import {translateDocument} from './i18n/runtime.js';
export function mountEmailStatus({api,user,esc}){
 const root=document.querySelector('#email-verification');if(!root)return ()=>{};
 let checking=false,sending=false,notice='',error='',cooldown=0,interval,cooldownTimer;
 function stop(){clearInterval(interval);clearTimeout(cooldownTimer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',onVisibility)}
 function render(){
  if(!root.isConnected){stop();return}
  const verified=!!user.email_verified_at;
  root.className='email-verification-notice'+(verified?' is-verified':'');root.dataset.emailStatus=verified?'verified':'unverified';
  root.innerHTML=`<h2>${verified?'Email подтверждён':'Email не подтверждён'}</h2><p data-i18n-skip>${esc(user.email)}</p>${verified?'':`<p>Подтвердите адрес электронной почты, перейдя по ссылке в письме.</p>${user.email_verification_sent_at?'<p>На Ваш email отправлено письмо со ссылкой подтверждения. Ссылка действует 24 часа.</p>':''}<button class="button secondary" type="button" id="resend-verification" ${sending||Date.now()<cooldown?'disabled':''}>${user.email_verification_sent_at?'Отправить письмо повторно':'Отправить письмо'}</button><p id="email-verification-notice" role="status">${esc(notice)}</p><p class="error" id="email-verification-error" role="alert">${esc(error)}</p>`}`;
  const button=root.querySelector('#resend-verification');if(button)button.onclick=async()=>{
   sending=true;error='';notice='';render();try{
    const result=await api('/auth/resend-verification',{method:'POST',body:{}});
    if(result.verified){user.email_verified_at=new Date().toISOString();stop()}
    else{user.email_verification_sent_at=new Date().toISOString();cooldown=Date.now()+60000;notice='Письмо отправлено на Ваш email. Перейдите по ссылке в письме для подтверждения адреса.';clearTimeout(cooldownTimer);cooldownTimer=setTimeout(render,60000)}
   }catch(err){error=err.message}finally{sending=false;render()}
  };
  if(verified)stop();translateDocument();
 }
 async function check(){
  if(!root.isConnected){stop();return}if(checking||document.visibilityState!=='visible'||user.email_verified_at)return;
  checking=true;try{const data=await api('/me');if(root.isConnected&&data.user?.id===user.id&&data.user?.registration_type===user.registration_type){user=data.user;render()}}catch{}finally{checking=false}
 }
 function onVisibility(){if(document.visibilityState==='visible')check()}
 if(!user.email_verified_at){interval=setInterval(check,30000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',onVisibility)}render();return stop;
}
export function renderEmailVerification({shell,api,link}){
 const fragment=new URLSearchParams(location.hash.slice(1)),token=fragment.get('token'),type=fragment.get('type')==='master'?'master':'user';
 // Confirmation secrets stay out of query strings, page analytics and browser history.
 history.replaceState({},'','/verify-email');
 const valid=/^[a-f0-9]{64}$/.test(token||'');
 shell(`<article class="verification-page"><h1>Подтверждение email</h1><p id="verification-message" role="status">${valid?'Нажмите кнопку, чтобы подтвердить адрес электронной почты.':'Ссылка подтверждения недействительна. Запросите новое письмо в кабинете.'}</p>${valid?'<button class="button" type="button" id="verify-email-button">Подтвердить email</button>':''}<p class="error" id="verification-error" role="alert"></p><p>${link(type==='master'?'/account?mode=login':'/cabinet?mode=login','Перейти в кабинет','text-link')}</p></article>`,'page');
 const button=document.querySelector('#verify-email-button');if(button)button.onclick=async()=>{button.disabled=true;const error=document.querySelector('#verification-error');error.textContent='';try{const result=await api('/auth/verify-email',{method:'POST',body:{token}});if(!button.isConnected)return;document.querySelector('#verification-message').textContent=result.registration_type==='master'?'Email профиля мастера подтверждён. Вы можете вернуться в кабинет.':'Email профиля пользователя подтверждён. Вы можете вернуться в кабинет.';document.querySelector('.verification-page a[data-link]').setAttribute('href',result.registration_type==='master'?'/account?mode=login':'/cabinet?mode=login');button.remove();translateDocument()}catch(err){if(button.isConnected){error.textContent=err.message;button.disabled=false;translateDocument()}}};
}

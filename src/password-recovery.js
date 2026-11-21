import {passwordControl,mountPasswordControls} from './password-controls.js';
import {translateDocument} from './i18n/runtime.js';
export function renderPasswordRecovery({shell,api,esc,type,email:initialEmail='',onCancel,onSuccess}){
 let email=initialEmail.trim(),stage='email',challenge='',retryAt=0,timer,root,stopped=false,busy=false;
 const active=()=>!stopped&&root?.isConnected;
 const stop=()=>{stopped=true;clearInterval(timer)};
 const error=message=>{if(!active())return;root.querySelector('#auth-error').textContent=message;translateDocument()};
 function render(){
  if(stopped)return;clearInterval(timer);
  const title=stage==='password'?'Новый пароль':type==='master'?'Восстановление пароля мастера':'Восстановление пароля пользователя';
  shell(`<div class="recovery-layout" id="password-recovery"><button class="text-link text-button" type="button" id="recovery-back">← Вернуться ко входу</button><section class="auth-card"><h1>${title}</h1>${stage==='email'?`<p>Введите email, указанный при регистрации в этом разделе.</p><form id="recovery-request"><label class="form-label" for="recovery-email">Email</label><input class="control" id="recovery-email" name="email" type="email" autocomplete="email" maxlength="254" required value="${esc(email)}"><p class="error" id="auth-error" role="alert"></p><button class="button full">Получить код</button></form>`:stage==='code'?`<p>Введите шестизначный код из письма.</p><p data-i18n-skip>${esc(email)}</p><p class="fineprint">Запрос принят. Письмо с кодом получит владелец email, зарегистрированного в этом разделе. Проверьте также папку «Спам». Код действует 10 минут.</p><form id="recovery-code-form"><fieldset class="recovery-code"><legend class="form-label">Код из письма</legend><div class="otp-fields" dir="ltr">${Array.from({length:6},(_,i)=>`<input class="control otp-digit" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1" required autocomplete="${i===0?'one-time-code':'off'}" aria-label="Цифра ${i+1} из 6" aria-describedby="auth-error" data-code-digit="${i}">`).join('')}</div></fieldset><p class="error" id="auth-error" role="alert"></p><button class="button full">Подтвердить код</button></form><div class="recovery-actions"><button type="button" class="text-button text-link" id="recovery-resend">Отправить код повторно</button><button type="button" class="text-button text-link" id="recovery-change-email">Изменить email</button></div><p class="fineprint" id="recovery-cooldown"><span>Повторный код можно запросить через</span> <span data-i18n-skip id="recovery-seconds"></span> <span>с.</span></p>`:`<p>Введите новый пароль дважды. Он изменится только для выбранного профиля.</p><form id="recovery-password-form">${passwordControl('password','Новый пароль','new-password',10)}${passwordControl('password-confirm','Повторите новый пароль','new-password',10)}<p class="fineprint">Не менее 10 символов. Используйте уникальный пароль.</p><p class="error" id="auth-error" role="alert"></p><button class="button full">Сохранить пароль и войти</button></form>`}</section></div>`,'page recovery-page');
  root=document.querySelector('#password-recovery');root.querySelector('#recovery-back').onclick=()=>{stop();onCancel()};
  if(stage==='email'){root.querySelector('#recovery-request').onsubmit=event=>{event.preventDefault();email=event.target.elements.email.value.trim();send()}}
  else if(stage==='code')mountCode();else mountPasswords();translateDocument();
 }
 async function send(){
  if(!active()||busy)return;busy=true;const view=root;for(const button of view.querySelectorAll('input,form button,#recovery-resend'))button.disabled=true;error('');
  try{const data=await api('/auth/password-reset/request',{method:'POST',body:{email,registrationType:type}});if(!active()||root!==view)return;challenge=data.challenge;retryAt=Date.now()+data.retryAfter*1000;stage='code';render();root.querySelector('.otp-digit').focus()}
  catch(e){if(root===view){error(e.message);for(const button of view.querySelectorAll('input,form button,#recovery-resend'))button.disabled=false}}finally{busy=false}
 }
 function mountCode(){
  const fields=[...root.querySelectorAll('.otp-digit')],form=root.querySelector('#recovery-code-form');
  const distribute=(index,value)=>{const digits=value.replace(/\D/g,'').slice(0,6);if(!digits)return;const start=digits.length===6?0:index;for(let i=0;i<digits.length&&start+i<6;i++)fields[start+i].value=digits[i];fields[Math.min(5,start+digits.length)].focus()};
  fields.forEach((field,i)=>{
   field.onfocus=()=>field.select();field.oninput=()=>{error('');const value=field.value.replace(/\D/g,'');field.value='';if(value)distribute(i,value)};
   field.onpaste=event=>{event.preventDefault();error('');distribute(i,event.clipboardData.getData('text'))};
   field.onkeydown=event=>{if(event.key==='Backspace'&&!field.value&&i>0){event.preventDefault();fields[i-1].value='';fields[i-1].focus()}else if(event.key==='ArrowLeft'&&i>0){event.preventDefault();fields[i-1].focus()}else if(event.key==='ArrowRight'&&i<5){event.preventDefault();fields[i+1].focus()}};
  });
  form.onsubmit=async event=>{event.preventDefault();event.submitter.disabled=true;const view=root;error('');try{await api('/auth/password-reset/verify',{method:'POST',body:{registrationType:type,challenge,code:fields.map(f=>f.value).join('')}});if(!active()||root!==view)return;stage='password';render();root.querySelector('#password').focus()}catch(e){if(root===view){error(e.message);event.submitter.disabled=false}}};
  root.querySelector('#recovery-change-email').onclick=()=>{stage='email';render();root.querySelector('#recovery-email').focus()};root.querySelector('#recovery-resend').onclick=send;
  const update=()=>{if(!active()){clearInterval(timer);return}const seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000));root.querySelector('#recovery-resend').disabled=busy||seconds>0;root.querySelector('#recovery-cooldown').hidden=seconds===0;root.querySelector('#recovery-seconds').textContent=seconds};update();timer=setInterval(update,1000);
 }
 function mountPasswords(){
  mountPasswordControls();const form=root.querySelector('#recovery-password-form');for(const input of form.querySelectorAll('input'))input.oninput=()=>{error('');form.elements.passwordConfirm.setAttribute('aria-invalid','false')};
  form.onsubmit=async event=>{event.preventDefault();if(form.elements.password.value!==form.elements.passwordConfirm.value){form.elements.passwordConfirm.setAttribute('aria-invalid','true');error('Пароли не совпадают');form.elements.passwordConfirm.focus();return}event.submitter.disabled=true;const view=root;error('');try{await api('/auth/password-reset/complete',{method:'POST',body:{registrationType:type,challenge,password:form.elements.password.value,passwordConfirm:form.elements.passwordConfirm.value}});if(!active()||root!==view)return;form.reset();clearInterval(timer);try{await onSuccess();stop()}catch{if(active())error('Пароль сохранён. Вернитесь ко входу и войдите с новым паролем.')}}catch(e){if(root===view){error(e.message);event.submitter.disabled=false}}};
 }
 render();if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))send();return stop;
}

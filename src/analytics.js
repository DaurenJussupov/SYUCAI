// Only explicitly listed product events are sent. Never pass form values here.
import {currentLanguage,translateDocument} from './i18n/runtime.js';
const consentKey='syucai-analytics-consent';
let config={},initialized=false,page='',started=0,session='',gaId='';
const allowed=new Set(['page_view','calculation','calendar_open','calendar_day','master_search','master_view','contact_open','whatsapp_click','registration','profile_submit','review_submit','engagement','error']);
const read=(storage,key)=>{try{return storage.getItem(key)}catch{return null}};
const write=(storage,key,value)=>{try{storage.setItem(key,value)}catch{}};
const permitted=()=>read(localStorage,consentKey)==='yes'&&location.pathname!=='/admin';
const safePath=path=>/^\/masters\/[a-f0-9-]{36}$/.test(path)?'/masters/:id':['/','/results','/calendar','/about','/masters','/account','/privacy'].includes(path)?path:'';
const label=value=>String(value||'').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,60);
function attribution(){
 let value=read(sessionStorage,'syucai-attribution');
 if(!value){const q=new URLSearchParams(location.search);let referrer='';try{referrer=new URL(document.referrer).origin}catch{}value=JSON.stringify({source:label(q.get('utm_source')),medium:label(q.get('utm_medium')),campaign:label(q.get('utm_campaign')),referrer});write(sessionStorage,'syucai-attribution',value)}
 try{return JSON.parse(value)}catch{return {}}
}
function enableGoogle(){
 const id=config.measurementId;if(!permitted()||!/^G-[A-Z0-9]{4,20}$/.test(id||'')||gaId===id)return;
 gaId=id;window['ga-disable-'+id]=false;window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};
 window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 window.gtag('js',new Date());
 window.gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+safePath(location.pathname),page_referrer:attribution().referrer||'',page_title:'SYUCAI',cookie_flags:'SameSite=Lax;Secure'});
 const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+id;document.head.append(script);
}
export function track(event,options={}){
 if(!initialized||!permitted()||!allowed.has(event))return;
 const path=safePath(location.pathname);if(!path)return;
 session=read(sessionStorage,'syucai-analytics-session')||crypto.randomUUID();write(sessionStorage,'syucai-analytics-session',session);
 const payload={event,path,session,consent:true,...attribution(),language:currentLanguage()};
 if(/^[a-f0-9-]{36}$/.test(options.master_id||''))payload.master_id=options.master_id;
 if(event==='engagement')payload.duration=Math.max(0,Math.min(1800,Math.round(options.duration||0)));
 fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
 enableGoogle();if(gaId&&window.gtag)window.gtag('event',event,{page_location:location.origin+path,page_referrer:payload.referrer,page_title:'SYUCAI',...(payload.master_id?{master_id:payload.master_id}:{}),...(event==='engagement'?{engagement_time_msec:payload.duration*1000}:{})});
}
function engagement(){if(started){const duration=(performance.now()-started)/1000;started=0;if(duration>=1)track('engagement',{duration})}}
export function analyticsPage(){
 engagement();page=safePath(location.pathname);started=permitted()&&document.visibilityState==='visible'?performance.now():0;
 showConsent(false);if(page)track('page_view');
}
function revoke(){
 engagement();if(gaId){window['ga-disable-'+gaId]=true;window.gtag?.('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})}
 // Clear Analytics identifiers from this host and its parent-domain cookie variants.
 for(const entry of document.cookie.split(';')){const name=entry.trim().split('=')[0];if(!/^_ga(?:_|$)/.test(name))continue;document.cookie=`${name}=; Max-Age=0; Path=/`;const parts=location.hostname.split('.');for(let i=0;i<parts.length-1;i++)document.cookie=`${name}=; Max-Age=0; Path=/; Domain=.${parts.slice(i).join('.')}`}
 try{sessionStorage.removeItem('syucai-analytics-session');sessionStorage.removeItem('syucai-attribution')}catch{}session='';gaId='';started=0;
}
export function showConsent(force=true){
 let box=document.querySelector('#analytics-consent');
 if(location.pathname==='/admin'||(!force&&read(localStorage,consentKey))){box?.remove();return}
 if(box)return;
 box=document.createElement('aside');box.id='analytics-consent';box.className='analytics-consent';box.setAttribute('aria-label','Настройки аналитики');
 box.innerHTML='<p>Разрешить аналитику посещений? Имена, даты рождения и сообщения не передаются. <a data-link href="/privacy">Подробнее</a></p><div><button type="button" class="button" data-consent="yes">Разрешить</button><button type="button" class="button secondary" data-consent="no">Только необходимые</button></div>';
 document.body.append(box);translateDocument();
 for(const button of box.querySelectorAll('[data-consent]'))button.onclick=()=>{const choice=button.dataset.consent;if(choice==='no')revoke();write(localStorage,consentKey,choice);box.remove();if(choice==='yes'){if(gaId)window['ga-disable-'+gaId]=false;analyticsPage()}};
}
export async function initializeAnalytics(){
 showConsent(false);
 try{const r=await fetch('/api/public-config');if(r.ok)config=await r.json()}catch{}
 initialized=true;if(permitted()){enableGoogle();analyticsPage()}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')engagement();else if(permitted())started=performance.now()});
window.addEventListener('pagehide',engagement);
document.addEventListener('click',event=>{if(event.target.closest('[data-analytics-settings]'))showConsent()});

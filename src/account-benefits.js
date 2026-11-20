import {currentLanguage,translateDocument} from './i18n/runtime.js';
import {track} from './analytics.js';
const labels={pending:'Ожидает согласования',active:'Продвижение активно',completed:'Продвижение завершено',rejected:'Заявка отклонена',cancelled:'Продвижение остановлено'};
export function durationLabel(days){return days%10===1&&days%100!==11?`${days} день`:days%10>=2&&days%10<=4&&(days%100<12||days%100>14)?`${days} дня`:`${days} дней`}
export function dateMarkup(value){
 const raw=String(value||'');const date=new Date(/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z');if(!Number.isFinite(date.getTime()))return '';
 const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 return `<time datetime="${key}">${new Intl.DateTimeFormat(currentLanguage(),{day:'numeric',month:'long',year:'numeric'}).format(date)}</time>`;
}
export function membershipNotice(trial){
 return `<section class="membership-notice" aria-labelledby="membership-title"><h2 id="membership-title">Условия размещения для мастеров</h2><p>Первые три месяца с даты регистрации — бесплатный пробный период. После его завершения размещение профиля на сайте будет платным. Стоимость находится на рассмотрении руководства и будет объявлена дополнительно.</p>${trial?`<p class="membership-period">${trial.active?'Пробный период действует до':'Пробный период завершён'} ${dateMarkup(trial.endsAt)}</p>`:''}</section>`;
}
export function mountPromotionPanel({api,profile,promotions=[],esc}){
 const root=document.querySelector('#promotion-management');if(!root)return;
 let open=false,days=1,notice='';
 function render(){
  const current=promotions.find(p=>['pending','active'].includes(p.status));
  root.innerHTML=`<button type="button" class="button secondary" id="promotion-toggle" aria-expanded="${open}" aria-controls="promotion-panel">Поднять мою карточку в поиске</button><div id="promotion-panel" class="promotion-panel" ${open?'':'hidden'}><h2>Продвижение карточки</h2><p>Продвижение даёт приоритет карточке среди мастеров того же города.</p><p>Выберите срок и отправьте заявку. Условия и запуск продвижения согласует администратор.</p><form id="promotion-form"><div class="promotion-fields"><label class="form-label" for="promotion-days">Срок продвижения<select id="promotion-days" class="control" name="days">${Array.from({length:30},(_,i)=>`<option value="${i+1}" ${days===i+1?'selected':''}>${durationLabel(i+1)}</option>`).join('')}</select></label><div><label class="form-label" for="promotion-cost">Стоимость</label><output class="control promotion-cost" id="promotion-cost">Стоимость на рассмотрении</output></div></div>${profile.status!=='approved'?'<p class="promotion-hint">Продвижение доступно после публикации анкеты.</p>':''}<button class="button" ${profile.status!=='approved'||current?'disabled':''}>Отправить заявку</button><p class="error" id="promotion-error" role="alert"></p><p id="promotion-notice" role="status">${esc(notice)}</p></form>${promotions.length?`<div class="promotion-history"><h3>Ваши заявки</h3>${promotions.map(p=>`<article><div class="list-heading"><b>${labels[p.status]}</b><span>${durationLabel(p.days)}</span></div>${p.ends_at?`<p><span>Срок до</span> ${dateMarkup(p.ends_at)}</p>`:''}${p.moderation_note?`<p data-i18n-skip>${esc(p.moderation_note)}</p>`:''}</article>`).join('')}</div>`:''}</div>`;
  root.querySelector('#promotion-toggle').onclick=()=>{open=!open;render()};
  root.querySelector('#promotion-days').onchange=e=>days=Number(e.target.value);
  root.querySelector('#promotion-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;const error=root.querySelector('#promotion-error');error.textContent='';try{
   await api('/promotions',{method:'POST',body:{days}});track('promotion_request');const data=await api('/promotions');if(!root.isConnected)return;promotions=data.promotions;notice='Заявка отправлена. Администратор рассмотрит её и согласует с Вами условия продвижения.';render();
  }catch(err){if(root.isConnected){error.textContent=err.message;translateDocument()}}finally{if(button.isConnected)button.disabled=false}};
  translateDocument();
 }
 render();
}

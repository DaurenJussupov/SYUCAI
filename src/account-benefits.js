import {promotionBasePrice} from '../shared/pricing.js';
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
 return `<section class="membership-notice" aria-labelledby="membership-title"><h2 id="membership-title">Условия размещения для мастеров</h2><p>Стандартные условия: первые 3 месяца — бесплатно; с 4-го по 6-й месяц — 3 000 ₸ в месяц. С 7-го месяца — 5 000 ₸ в месяц или 48 000 ₸ за год при единовременной оплате (скидка 20%).</p><p>Для мастеров, зарегистрировавшихся до 21 февраля 2027 года включительно: первые 3 месяца — бесплатно, затем 12 месяцев — по 3 000 ₸ в месяц или 28 800 ₸ за год при единовременной оплате (скидка 20%). После льготного периода действует стандартный тариф.</p>${trial?`<p class="membership-period">${trial.active?'Пробный период действует до':'Пробный период завершён'} ${dateMarkup(trial.endsAt)}</p>`:''}</section>`;
}
export function mountPromotionPanel({api,profile,promotions=[],esc}){
 const root=document.querySelector('#promotion-management');if(!root)return;
 root.hidden=!['pending','approved','rejected'].includes(profile.status);
 if(root.hidden){root.replaceChildren();return}
 let open=false,days=1,notice='';
 function render(){
  const current=promotions.find(p=>['pending','active'].includes(p.status));
  root.innerHTML=`<button type="button" class="button secondary" id="promotion-toggle" aria-expanded="${open}" aria-controls="promotion-panel">Поднять мою анкету в поиске</button><div id="promotion-panel" class="promotion-panel" ${open?'':'hidden'}><h2>Продвижение карточки</h2><p>Стоимость зависит от города и спроса. Базовые ставки: 1 день — 500 ₸, 2 дня — 900 ₸, 3 дня — 1 200 ₸.</p><p>Максимальный срок — 3 дня. Повторная заявка доступна после завершения предыдущего продвижения.</p><p>Условия показа: до 9 продвигаемых карточек в день в одном городе; карточки по очереди занимают позиции 1, 2 и 3.</p><p>Итоговую стоимость, доступность мест и время запуска администратор подтверждает до оплаты. Отправка заявки не запускает продвижение автоматически.</p><form id="promotion-form"><div class="promotion-fields"><label class="form-label" for="promotion-days">Срок продвижения<select id="promotion-days" class="control" name="days">${Array.from({length:3},(_,i)=>`<option value="${i+1}" ${days===i+1?'selected':''}>${durationLabel(i+1)}</option>`).join('')}</select></label><div><label class="form-label" for="promotion-cost">Базовая стоимость</label><output class="control promotion-cost" id="promotion-cost" data-i18n-skip>${promotionBasePrice(days)} ₸</output></div></div>${profile.status!=='approved'?'<p class="promotion-hint">Продвижение доступно после публикации анкеты.</p>':''}<button class="button" ${profile.status!=='approved'||current?'disabled':''}>Отправить заявку</button><p class="error" id="promotion-error" role="alert"></p><p id="promotion-notice" role="status">${esc(notice)}</p></form>${promotions.length?`<div class="promotion-history"><h3>Ваши заявки</h3>${promotions.map(p=>`<article><div class="list-heading"><b>${labels[p.status]}</b><span>${durationLabel(p.days)}</span></div>${p.ends_at?`<p><span>Срок до</span> ${dateMarkup(p.ends_at)}</p>`:''}${p.moderation_note?`<p data-i18n-skip>${esc(p.moderation_note)}</p>`:''}</article>`).join('')}</div>`:''}</div>`;
  root.querySelector('#promotion-toggle').onclick=()=>{open=!open;render()};
  root.querySelector('#promotion-days').onchange=e=>{days=Number(e.target.value);root.querySelector('#promotion-cost').textContent=promotionBasePrice(days)+' ₸'};
  root.querySelector('#promotion-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;const error=root.querySelector('#promotion-error');error.textContent='';try{
   await api('/promotions',{method:'POST',body:{days}});track('promotion_request');const data=await api('/promotions');if(!root.isConnected)return;promotions=data.promotions;notice='Заявка отправлена. Администратор рассмотрит её и согласует с Вами условия продвижения.';render();
  }catch(err){if(root.isConnected){error.textContent=err.message;translateDocument()}}finally{if(button.isConnected)button.disabled=false}};
  translateDocument();
 }
 render();
}

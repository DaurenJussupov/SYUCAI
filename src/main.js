import {renderAbout} from './about.js';
import {renderAdmin} from './admin.js';
import {initializeAnalytics,analyticsPage,track} from './analytics.js';
import {renderCalendar, leaveCalendar} from './calendar.js';
import {mountLanguagePicker, initializeTranslations, translateDocument, translateText, translateGeneratedValue, currentLanguage, cityLabel} from './i18n/runtime.js';
import '@fontsource-variable/manrope';
import './style.css';
import {calculateBirth,calculateName,parseBirthDate} from './calculations.js';
import {cities} from '../shared/cities.js';
const app=document.querySelector('#app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let leaveAccount=()=>{};
let values={date:'',name:''},selectedCity=sessionStorage.getItem('city')||'',me=null,routeId=0;
const arrowSvg='<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
const sunSvg='<svg class="sun-icon" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 2v36M2 20h36M7 7l26 26M7 33 33 7"/></svg>';
const calendarSvg='<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/></svg>';
async function api(path,options={}){let r;try{r=await fetch('/api'+path,{...options,headers:options.body instanceof FormData?{}:{'Content-Type':'application/json',...options.headers},body:options.body instanceof FormData?options.body:options.body?JSON.stringify(options.body):undefined})}catch{throw Error('Не удалось подключиться. Проверьте соединение и попробуйте ещё раз.')}let data;try{data=await r.json()}catch{throw Error('Сервис недоступен. Попробуйте позже.')}if(!r.ok)throw Error(data.error||'Не удалось выполнить запрос');return data}
function calendarBirthIsValid(){
 const field=document.querySelector('#birth')||document.querySelector('#calendar-birth');
 const value=String(field?field.value:values.date||'').trim();values.date=value;
 let message;
 if(!value)message='введите дату рождения';
 else{try{parseBirthDate(value)}catch(err){message=err.message}}
 if(!message)return true;
 if(!field)go('/');
 const input=document.querySelector('#birth')||document.querySelector('#calendar-birth');
 const box=document.querySelector('#birth-error')||document.querySelector('#calendar-error');
 if(input)input.setAttribute('aria-invalid','true');
 if(box)error(box,message);
 input?.focus();
 return false;
}
function go(path){
 if(new URL(path,location.href).pathname==='/calendar'){if(!calendarBirthIsValid())return;track('calendar_open')}
 history.pushState({},'',path);render();window.scrollTo({top:0,behavior:'instant'});
}
document.addEventListener('click',e=>{const a=e.target.closest('a[data-link]');if(a&&!e.metaKey&&!e.ctrlKey){e.preventDefault();go(a.getAttribute('href'))}});
window.addEventListener('popstate',render);
const link=(path,text,cls='')=>`<a data-link href="${path}" class="${cls}">${text}</a>`;
function setMenu(open, restoreFocus = false) {
 const button = document.querySelector('.menu-button');
 const nav = document.querySelector('#site-menu');
 if (!button || !nav) return;
 if (open) { const panel=document.querySelector('#language-panel');if(panel)panel.hidden=true;document.querySelector('#language-button')?.setAttribute('aria-expanded','false'); }
 button.setAttribute('aria-expanded', String(open));
 button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
 nav.hidden = !open;
 if (restoreFocus) button.focus();
}
document.addEventListener('keydown', e => {
 if (e.key === 'Escape' && document.querySelector('.menu-button')?.getAttribute('aria-expanded') === 'true') setMenu(false, true);
});
document.addEventListener('click', e => {
 if (!e.target.closest('.header') && document.querySelector('.menu-button')?.getAttribute('aria-expanded') === 'true') setMenu(false);
});
function masterDiscovery(){
 return `<div class="master-discovery">${link('/masters','<span class="master-cta-label">Мастер SYUCAI в Вашем городе<small>Рейтинг и отзывы</small></span><span aria-hidden="true">↗</span>','button master-cta')}</div>`;
}
function shell(content, cls = '') {
 content = (content+masterDiscovery()).replaceAll('↗', arrowSvg).replaceAll('✳', sunSvg).replaceAll('⌑', calendarSvg);
 app.innerHTML = `<header class="header"><a href="/" data-link class="brand" aria-label="SYUCAI — главная"><img src="/logo.PNG" alt="SYUCAI" width="64" height="64"></a><div class="header-actions"><div id="language-control"></div><button class="menu-button" aria-label="Открыть меню" aria-expanded="false" aria-controls="site-menu"><span></span><span></span></button></div><nav id="site-menu" aria-label="Главная навигация" hidden>${link('/', 'Главная')}${link('/calendar', 'МОЙ КАЛЕНДАРЬ')}${link('/about', 'О SYUCAI')}${link('/masters', 'Найти мастера')}${link('/account', 'Кабинет мастера', 'nav-account')}${link('/privacy','Приватность')}</nav></header><main class="${cls}" id="main">${content}</main><footer class="site-footer"><button class="text-button" type="button" data-analytics-settings>Настройки аналитики</button></footer><div class="toast" role="status" hidden></div>`;
 document.querySelector('.menu-button').onclick = () => setMenu(document.querySelector('.menu-button').getAttribute('aria-expanded') !== 'true');
 mountLanguagePicker();translateDocument();
}

function error(box,message){box.textContent=message;box.hidden=false;translateDocument()}
function statusText(s){return {draft:'Черновик',pending:'На проверке',approved:'Опубликовано',rejected:'Нужны уточнения'}[s]||'Новая анкета'}
function home() {
 shell(`<div class="home-form"><form id="calculator" novalidate><div class="entry"><label for="birth">Введите дату рождения</label><div class="input-line"><input id="birth" name="birth" inputmode="numeric" autocomplete="bday" placeholder="ДД.ММ.ГГГГ" maxlength="10" value="${esc(values.date)}" aria-describedby="birth-error"><span class="field-symbol" aria-hidden="true">⌑</span></div><p class="error" id="birth-error" aria-live="polite"></p></div><div class="entry"><label for="name">Введите название / имя</label><div class="input-line"><input id="name" name="name" autocomplete="given-name" placeholder="Имя латиницей" maxlength="80" spellcheck="false" value="${esc(values.name)}" aria-describedby="name-error"></div><p class="error" id="name-error" aria-live="polite"></p></div><div class="home-actions">${link('/calendar','МОЙ КАЛЕНДАРЬ','button secondary calendar-entry-button')}<button type="submit" class="button calculate-button">Рассчитать <span aria-hidden="true">↗</span></button></div><p class="input-hint">Можно заполнить одно или оба поля.</p></form></div>`, 'home');
 const date = document.querySelector('#birth'), name = document.querySelector('#name');
 date.addEventListener('input', () => {
  const s = date.value.replace(/\D/g, '').slice(0, 8);
  date.value = s.slice(0, 2) + (s.length > 2 ? '.' + s.slice(2, 4) : '') + (s.length > 4 ? '.' + s.slice(4) : '');
  values.date = date.value;
  date.setAttribute('aria-invalid', 'false');
  document.querySelector('#birth-error').textContent = '';
 });
 name.addEventListener('input', () => {
  values.name = name.value;
  const invalid = name.value && !/^[A-Za-z '\-]*$/.test(name.value);
  document.querySelector('#name-error').textContent = invalid ? 'Use Latin letters · Используйте латинский алфавит' : '';
  name.setAttribute('aria-invalid', String(!!invalid));
 });
 document.querySelector('#calculator').onsubmit = e => {
  e.preventDefault();
  values = {date:date.value.trim(), name:name.value.trim()};
  document.querySelectorAll('.error').forEach(el => el.textContent = '');
  [date, name].forEach(el => el.setAttribute('aria-invalid', 'false'));
  let firstInvalid;
  if (!values.date && !values.name) {
   error(document.querySelector('#birth-error'), 'Введите дату рождения или имя');
   date.focus();
   return;
  }
  for (const [value, calculate, input, errorId] of [[values.date, calculateBirth, date, '#birth-error'], [values.name, calculateName, name, '#name-error']]) {
   if (!value) continue;
   try { calculate(value); } catch (err) {
    error(document.querySelector(errorId), err.message);
    input.setAttribute('aria-invalid', 'true');
    firstInvalid ||= input;
   }
  }
  if (firstInvalid) firstInvalid.focus();
  else{track('calculation');go('/results')};
 };
}

function sections(data){return (data||[]).map(([title,text],i)=>`<details ${i===0?'open':''}><summary>${esc(title)}<span>+</span></summary><p>${esc(text)}</p></details>`).join('')}
function resultCard(n, label, title, body, kind) {
 return `<article class="result-card" data-result="${kind}"><div class="result-top"><span class="eyebrow">${label}</span><span class="result-orbit">✳</span></div><div class="number">${n}</div><h3>${esc(title)}</h3>${body}</article>`;
}

function results() {
 let birth, name;
 try {
  if (values.date) birth = calculateBirth(values.date);
  if (values.name) name = calculateName(values.name);
 } catch { return home(); }
 if (!birth && !name) return home();
 const daySummary = birth ? `<section class="day-summary" aria-label="Личный и общий день"><div><span>Личный день</span><strong data-day-value="personal">${birth.personalDay.value}</strong></div><div><span>Общий день</span><strong data-day-value="general">${birth.generalDay.value}</strong></div>${link('/calendar','МОЙ КАЛЕНДАРЬ','button secondary')}</section>` : '';
 const consciousness = birth ? resultCard(birth.consciousness.value, 'Число сознания', birth.consciousness.data.name, `<p class="calc">${esc(birth.consciousness.calc)}</p><p class="intro">Рождённые ${esc(birth.consciousness.data.days)} числа</p><div class="qualities"><p><b>В плюсе</b>${esc(birth.consciousness.data.plus)}</p><p><b>В минусе</b>${esc(birth.consciousness.data.minus)}</p></div>${sections(birth.consciousness.data.sections)}`, 'consciousness') : '';
 const mission = birth ? resultCard(birth.mission.value, 'Число миссии', birth.mission.data.name, `<p class="calc">${esc(birth.mission.calc)}</p><p class="intro">${esc(birth.mission.data.text)}</p>${sections(birth.mission.data.sections)}`, 'mission') : '';
 const nameCard = name ? resultCard(name.value, 'Число имени', name.data.title, `<p class="calc">${esc(name.calc)}</p><div class="letter-row">${name.letters.map(([c,n]) => `<span>${c}<small>${n}</small></span>`).join('')}</div><p class="intro">${esc(name.data.summary)}</p><div class="tags">${name.data.keys.map(k => `<span>${esc(k)}</span>`).join('')}</div>${sections(name.data.sections)}<details><summary>Классическая трактовка <span>+</span></summary><p>Планета: ${esc(name.data.classic.planet)}. Дни: ${esc(name.data.classic.days)}.</p><p>В плюсе: ${esc(name.data.classic.plus)}</p><p>В минусе: ${esc(name.data.classic.minus)}</p><p>${esc(name.data.classic.mission)}</p></details>`, 'name') : '';
 shell(`<div class="page-head"><button class="text-button" id="edit">← Изменить данные</button><h1>Результаты расчёта</h1><p>${esc([values.name,values.date].filter(Boolean).join(' · '))}</p></div><section class="energy-results" aria-label="${birth ? 'Ваши энергии' : 'Число имени'}">${birth ? '<div class="section-heading"><h2>Ваши энергии</h2></div>' : ''}<div class="result-grid energy-grid ${birth && name ? 'three' : ''}">${consciousness}${mission}${nameCard}</div></section>${daySummary}<p class="fineprint">Трактовки из предоставленных материалов SYUCAI служат для саморефлексии и не являются психологической диагностикой. Дата рождения и имя рассчитываются в вашем браузере и не отправляются на сервер.</p>`, 'page results');
 document.querySelector('#edit').onclick = () => go('/');
}

function about(){renderAbout({shell,link})}
function cityInput(id,value=''){const city=cities.find(c=>c.id===value);return `<label class="form-label" for="${id}">Ваш город</label><input id="${id}" class="control" list="cities" placeholder="Начните вводить город" value="${city?esc(cityLabel(city)):''}" required autocomplete="off"><datalist id="cities">${cities.map(c=>`<option value="${esc(cityLabel(c))}"></option>`).join('')}</datalist>`}
function getCity(id){const value=document.querySelector('#'+id).value.trim().toLowerCase();return cities.find(c=>cityLabel(c).toLowerCase()===value||(c.name+', '+c.country).toLowerCase()===value||c.name.toLowerCase()===value||c.id===value)}
function rating(m){return Number(m.review_count)?`<span class="star">★</span> ${Number(m.rating).toFixed(1)} <span class="muted">· ${m.review_count} отзыв.</span>`:'Пока нет отзывов'}
async function masters(){shell(`<div class="page-head"><h1>Найти мастера</h1></div><form class="search-form">${cityInput('search-city',selectedCity)}<button class="button" type="submit">Найти мастера <span>↗</span></button><p class="error" id="search-error" role="alert"></p></form><div id="master-list" aria-live="polite"><div class="empty-state"><span class="empty-icon">⌖</span><h2>Укажите город</h2><p>Сначала покажем мастеров поблизости,<br>затем — в других городах вашей страны.</p></div></div><p class="fineprint">Поиск использует справочник городов. Если вашего города пока нет, выберите ближайший в той же стране. Время и стоимость консультации уточняйте у мастера.</p>`,'page masters');const current=routeId;
 async function search(){const city=getCity('search-city'),err=document.querySelector('#search-error');err.textContent='';if(!city){error(err,'Выберите город из предложенного списка');return}selectedCity=city.id;sessionStorage.setItem('city',city.id);const box=document.querySelector('#master-list');box.innerHTML='<p class="loading">Ищем мастеров…</p>';try{const data=await api('/masters?city='+city.id);if(routeId!==current)return;track('master_search');box.innerHTML=data.masters.length?`<div class="list-heading"><span>${esc(city.name)} · ${esc(city.country)}</span><span>${data.masters.length} мастер(ов)</span></div><div class="master-grid">${data.masters.map(m=>`<a class="master-card" href="/masters/${m.id}" data-link><div class="portrait"><img src="/api/files/${m.photo}" alt="${esc(m.name)}" loading="lazy"><span class="distance">${m.city_id===city.id?'В вашем городе':m.distance+' км'}</span></div><div class="master-info"><span class="eyebrow">${esc(cities.find(c=>c.id===m.city_id)?.name||'')} · ${esc(m.country)}</span><h2 data-i18n-skip>${esc(m.name)} <span>↗</span></h2><p data-i18n-skip>${esc(m.credentials)}</p><div class="rating">${rating(m)}</div>${m.review_preview?`<blockquote class="review-preview" data-i18n-skip>${esc(m.review_preview)}</blockquote>`:''}</div></a>`).join('')}</div>`:`<div class="empty-state"><span class="empty-icon">⌖</span><h2>Мастера не найдены</h2><p>В стране «${esc(city.country)}» пока нет опубликованных анкет.</p>${link('/account','Вы мастер? Создайте профиль ↗','text-link')}</div>`}catch(e){if(routeId===current){box.innerHTML='';error(err,e.message)}}}
 document.querySelector('.search-form').onsubmit=e=>{e.preventDefault();search()};if(selectedCity)search();}
async function master(id){shell('<p class="loading">Загружаем профиль…</p>','page');const current=routeId;try{const m=await api('/masters/'+id);if(routeId!==current)return;track('master_view',{master_id:id});const city=cities.find(c=>c.id===m.city_id);shell(`<a href="/masters" data-link class="text-link">← К поиску мастера</a><div class="profile-grid"><div><img class="profile-photo" src="/api/files/${m.photo}" alt="${esc(m.name)}"><button class="button full" id="contact">Связаться с мастером <span>↗</span></button><div id="contact-box" hidden><form id="contact-form">${cityInput('contact-city',selectedCity)}<label class="form-label" for="message">Ваше сообщение</label><textarea id="message" class="control" rows="6" maxlength="2000" required></textarea><p class="fineprint">Откроется WhatsApp. Сообщение отправите вы.</p><p class="error" id="contact-error" role="alert"></p><button class="button full">Перейти в WhatsApp ↗</button></form></div></div><div class="profile-copy"><span class="eyebrow">${esc(city?.name)} · ${esc(m.country)}</span><h1 data-i18n-skip>${esc(m.name)}</h1><div class="rating">${rating(m)}</div><h3>Квалификация</h3><p class="preline" data-i18n-skip>${esc(m.credentials)}</p><h3>О мастере</h3><p class="preline" data-i18n-skip>${esc(m.bio)}</p><section class="reviews"><h2>Отзывы <span class="muted">/ ${m.review_count}</span></h2>${m.reviews.length?m.reviews.map(r=>`<article class="review"><div><b data-i18n-skip>${esc(r.author)}</b><span class="star">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p data-i18n-skip>${esc(r.text)}</p><small>${esc(r.created_at.slice(0,10))}</small></article>`).join(''):'<p class="muted">Отзывов пока нет.</p>'}<details><summary>Оставить отзыв <span>+</span></summary><form id="review-form"><p class="fineprint">Для отправки нужен аккаунт. Отзыв публикуется после проверки. Пишите о личном опыте консультации; сайт не подтверждает факт оплаты.</p><label class="form-label">Ваше имя<input class="control" name="author" required minlength="2" maxlength="70"></label><label class="form-label">Оценка<select class="control" name="rating"><option value="5">★★★★★ — 5</option><option value="4">★★★★ — 4</option><option value="3">★★★ — 3</option><option value="2">★★ — 2</option><option value="1">★ — 1</option></select></label><label class="form-label">Ваш опыт<textarea class="control" name="text" required minlength="20" maxlength="1500" rows="4"></textarea></label><p class="error" id="review-error" role="alert"></p><p id="review-status" role="status"></p><button class="button">Отправить отзыв</button></form></details>${link('/account','Войти или зарегистрироваться','text-link')}</section></div></div>`,'page master-profile');
 const contact=document.querySelector('#contact-box');document.querySelector('#contact').onclick=()=>{track('contact_open',{master_id:id});contact.hidden=!contact.hidden;if(!contact.hidden)document.querySelector('#contact-city').focus()};
 let edited=false;const message=document.querySelector('#message');message.addEventListener('input',()=>edited=true);function template(){const c=getCity('contact-city');if(!edited)translateGeneratedValue(message,`Добрый день, беспокою Вас с сайта syucai.me, я из г. ${c?.name||'[укажите город]'} хочу пройти консультацию по SYUCAI`)};template();document.querySelector('#contact-city').addEventListener('input',template);
 document.querySelector('#contact-form').onsubmit=e=>{e.preventDefault();const c=getCity('contact-city');if(!c)return error(document.querySelector('#contact-error'),'Выберите город из списка');if(!edited)template();sessionStorage.setItem('city',c.id);track('whatsapp_click',{master_id:id});window.location.assign(`https://wa.me/${m.phone}?text=${encodeURIComponent(message.value)}`)};
 document.querySelector('#review-form').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),button=e.submitter;button.disabled=true;try{await api(`/masters/${id}/reviews`,{method:'POST',body:b});track('review_submit',{master_id:id});document.querySelector('#review-status').textContent='Отзыв отправлен на проверку. Он появится в профиле после публикации администратором.';e.target.reset();translateDocument()}catch(err){error(document.querySelector('#review-error'),err.message)}finally{button.disabled=false}};
 }catch(e){if(routeId===current)shell(`<div class="empty-state"><h1>Не удалось открыть профиль</h1><p>${esc(e.message)}</p>${link('/masters','Вернуться к поиску','button')}</div>`,'page')}}
function auth(mode='register'){shell(`<div class="auth-layout"><div class="auth-intro"><h1>Кабинет мастера</h1><p>Регистрация и управление анкетой.</p></div><div class="auth-card"><div class="tabs"><button id="register-tab" class="${mode==='register'?'active':''}">Регистрация</button><button id="login-tab" class="${mode==='login'?'active':''}">Вход</button></div><h2>${mode==='register'?'Создать аккаунт':'Вход'}</h2><form id="auth-form"><label class="form-label" for="email">Email</label><input class="control" id="email" name="email" type="email" autocomplete="email" maxlength="254" required><label class="form-label" for="password">Пароль</label><input class="control" id="password" name="password" type="password" autocomplete="${mode==='register'?'new-password':'current-password'}" minlength="${mode==='register'?10:1}" maxlength="128" required><p class="fineprint">${mode==='register'?'Не менее 10 символов. Используйте уникальный пароль.':'Восстановление пароля пока недоступно. Сохраните пароль в надёжном месте.'}</p>${mode==='register'?'<label class="consent"><input type="checkbox" required> <span>Согласен на обработку данных для создания аккаунта и публикации профиля. <a href="/privacy" data-link>Как мы храним данные</a></span></label>':''}<p id="auth-error" class="error" role="alert"></p><button class="button full">${mode==='register'?'Создать аккаунт':'Войти'} <span>↗</span></button></form><p class="fineprint">Посетители тоже могут создать аккаунт, чтобы оставлять отзывы. Анкета мастера необязательна.</p></div></div>`,'page account');document.querySelector('#register-tab').onclick=()=>auth('register');document.querySelector('#login-tab').onclick=()=>auth('login');document.querySelector('#auth-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('/auth/'+mode,{method:'POST',body:Object.fromEntries(new FormData(e.target))});if(mode==='register')track('registration');account()}catch(err){error(document.querySelector('#auth-error'),err.message)}finally{button.disabled=false}}}
async function account(){shell('<p class="loading">Открываем кабинет…</p>','page');const current=routeId;try{me=await api('/me');if(routeId!==current)return;if(!me.user)return auth();let draft={};try{draft=JSON.parse(me.draft?.data||'{}')}catch{}const p={...me.profile,...draft};shell(`<div class="account-head"><div><span class="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>Профиль мастера<span class="accent">.</span></h1><p class="muted">${esc(me.user.email)}</p></div><button class="text-button" id="logout">Выйти ↗</button></div><div class="status-banner"><span class="status-dot ${p.status==='approved'?'green':''}"></span><div><b>${statusText(p.status)}</b><p>${p.status==='approved'?'Ваша анкета доступна посетителям. Изменения отправят её на повторную проверку.':p.status==='pending'?'Анкета сохранена. Она появится в каталоге после проверки документов администратором.':p.status==='rejected'?'Уточните описание и документы, затем отправьте анкету ещё раз.':'Заполните анкету, добавьте фото и диплом. Публикация — после проверки.'}</p>${p.moderation_note?`<p class="preline" data-i18n-skip>${esc(p.moderation_note)}</p>`:''}</div></div><div class="dashboard-grid"><section class="upload-panel"><h2>01 / Фото и документы</h2><div id="uploaded-photo">${me.files?.find(f=>f.kind==='photo')?`<img class="upload-preview" src="/api/files/${me.files.find(f=>f.kind==='photo').id}" alt="Ваше фото">`:'<div class="photo-placeholder">＋</div>'}</div><label class="upload-button">Загрузить фото<input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp"></label><p class="fineprint">JPG, PNG или WebP · до 5 МБ</p><h3>Дипломы и сертификаты</h3><p class="fineprint">Документы доступны вам и администратору для проверки. Посетители их не видят.</p><ul id="file-list">${(me.files||[]).filter(f=>f.kind==='document').map(f=>`<li data-i18n-skip><a href="/api/files/${f.id}" target="_blank" rel="noopener">${esc(f.name)} ↗</a></li>`).join('')}</ul><label class="upload-button">Добавить документ<input type="file" id="document-file" accept="application/pdf,image/jpeg,image/png"></label><p class="fineprint">PDF, JPG или PNG · до 5 МБ · до 5 документов</p><p class="error" id="upload-error" role="alert"></p><p id="upload-status" role="status"></p></section><section><h2>02 / Ваша анкета</h2><form id="profile-form"><p id="draft-status" class="fineprint" role="status"></p><label class="form-label">Имя и фамилия<input class="control" name="name" required minlength="3" maxlength="100" value="${esc(p.name)}" placeholder="Анара Каирбекова / Anara Kairbekova"></label>${cityInput('profile-city',p.city_id)}<label class="form-label">WhatsApp<input class="control" name="phone" type="tel" required pattern="[+]?[0-9]{10,15}" value="${esc(p.phone)}" placeholder="+77000000000"></label><p class="fineprint">Введите номер без пробелов с кодом страны. Контакт будет публичным.</p><label class="form-label">Квалификация и регалии<textarea class="control" name="credentials" required minlength="5" maxlength="1000" rows="3" placeholder="Обучение, специализация, опыт">${esc(p.credentials)}</textarea></label><label class="form-label">О себе<textarea class="control" name="bio" required minlength="80" maxlength="4000" rows="7" placeholder="Расскажите о своём подходе и формате консультации (от 80 символов)">${esc(p.bio)}</textarea></label><label class="consent"><input type="checkbox" required><span>Подтверждаю достоверность сведений и согласен на публикацию фото, описания, города и контакта.</span></label><p class="error" id="profile-error" role="alert"></p><p id="profile-status" role="status"></p><button class="button full">Сохранить и отправить на проверку ↗</button></form></section></div>`,'page dashboard');
 const profileForm=document.querySelector('#profile-form');if(p.city_text&&!p.city_id)document.querySelector('#profile-city').value=p.city_text;
 let timer,dirty=false,finished=false,pending=Promise.resolve();
 function flushDraft(){clearTimeout(timer);if(!dirty||finished)return pending;dirty=false;const data={...Object.fromEntries(new FormData(profileForm)),city_id:getCity('profile-city')?.id||'',city_text:document.querySelector('#profile-city').value};pending=pending.catch(()=>{}).then(()=>api('/profile/draft',{method:'PUT',body:data})).then(()=>{if(profileForm.isConnected){document.querySelector('#draft-status').textContent='Черновик сохранён';translateDocument()}}).catch(err=>{dirty=true;if(profileForm.isConnected)document.querySelector('#draft-status').textContent='Не удалось сохранить черновик. '+err.message;throw err});return pending}
 profileForm.addEventListener('input',()=>{finished=false;dirty=true;clearTimeout(timer);timer=setTimeout(()=>flushDraft().catch(()=>{}),600)});
 leaveAccount=()=>{clearTimeout(timer);if(dirty&&!finished)flushDraft().catch(()=>{});leaveAccount=()=>{}};
 document.querySelector('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});auth('login')}catch(e){error(document.querySelector('#profile-error'),e.message)}};
 for(const kind of ['photo','document'])document.querySelector('#'+kind+'-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const err=document.querySelector('#upload-error'),status=document.querySelector('#upload-status');err.textContent='';if(file.size>5*1024*1024)return error(err,'Максимальный размер файла — 5 МБ');const form=new FormData();form.append('file',file);form.append('kind',kind);e.target.disabled=true;status.textContent='Загружаем…';try{const f=await api('/files',{method:'POST',body:form});if(kind==='photo')document.querySelector('#uploaded-photo').innerHTML=`<img class="upload-preview" src="/api/files/${f.id}" alt="Ваше фото">`;else{const li=document.createElement('li');li.dataset.i18nSkip='';li.textContent=f.name;document.querySelector('#file-list').append(li)}status.textContent='Файл загружен. Отправьте заполненную анкету на проверку.'}catch(ex){error(err,ex.message);status.textContent=''}finally{e.target.disabled=false;e.target.value=''}};
 document.querySelector('#profile-form').onsubmit=async e=>{e.preventDefault();const city=getCity('profile-city'),err=document.querySelector('#profile-error');err.textContent='';if(!city)return error(err,'Выберите город из списка');const button=e.submitter;button.disabled=true;try{await flushDraft();await api('/profile',{method:'PUT',body:{...Object.fromEntries(new FormData(e.target)),city_id:city.id}});finished=true;dirty=false;track('profile_submit');document.querySelector('#profile-status').textContent='Анкета сохранена и отправлена на проверку.';document.querySelector('.status-banner b').textContent='На проверке';document.querySelector('.status-banner p').textContent='Анкета появится в каталоге после проверки документов.';document.querySelector('.status-dot').classList.remove('green')}catch(ex){error(err,ex.message)}finally{button.disabled=false}};
 }catch(e){if(routeId===current)shell(`<div class="empty-state"><h1>Кабинет временно недоступен</h1><p>${esc(e.message)}</p><button class="button" id="retry">Попробовать ещё раз</button></div>`,'page');document.querySelector('#retry')?.addEventListener('click',account)}}
function privacy(){shell(`<article class="prose narrow"><span class="eyebrow">ДАННЫЕ И ПРИВАТНОСТЬ</span><h1>О ваших данных</h1><p>Имя и дата рождения для расчётов обрабатываются только в браузере. Сайт не сохраняет эти значения на сервере. Выбранный город сохраняется в текущей сессии браузера и передаётся серверу для поиска мастеров.</p><p>Выбор языка сохраняется в вашем браузере. Переводы страниц подготовлены заранее; введённые данные не отправляются внешним сервисам перевода.</p><h2>Аккаунт и анкета</h2><p>Для аккаунта хранятся email и защищённый хеш пароля. Cookie сессии нужен для входа. При подаче анкеты сохраняются фото, документы, имя, город, описание и WhatsApp. После одобрения фото и данные анкеты, включая контакт, становятся публичными. Дипломы не публикуются.</p><h2>Отзывы и сообщения</h2><p>Отзывы, имя автора и оценка публикуются в профиле мастера после проверки администратором. Текст обращения в WhatsApp не сохраняется на сайте. После перехода действуют правила WhatsApp.</p><h2>Хранение и удаление</h2><p>Данные аккаунтов размещаются в Cloudflare D1, файлы — в приватном Cloudflare R2. После подключения Google администратором анкеты и файлы копируются в закрытые Google-таблицу и папку Drive для работы с заявками. Незавершённая анкета автоматически сохраняется как черновик. По вопросам исправления или удаления данных напишите администратору: <a href="mailto:temapluskz@gmail.com">temapluskz@gmail.com</a>. Укажите email своего аккаунта и суть запроса. Не присылайте пароли и дипломы по почте. Сроки хранения и окончательные условия обработки будут уточнены владельцем до публичного запуска.</p><h2>Аналитика</h2><p>С вашего согласия мы учитываем посещения страниц, источники переходов, страну, устройство, язык и действия на сайте. Имена, даты рождения, результаты расчётов и тексты сообщений в аналитику не передаются. События на сервере хранятся 90 дней. После подключения Google Analytics 4 эти же действия обрабатывает Google по своим правилам; Google может получать IP-адрес и использовать cookie. Отозвать согласие можно кнопкой ниже.</p><button class="button secondary" type="button" data-analytics-settings>Настройки аналитики</button><p>${link('/','На главную ↗','text-link')}</p></article>`,'page')}
function render(){routeId++;leaveAccount();leaveCalendar();const path=location.pathname.replace(/\/$/,'')||'/';document.title=({'/':'SYUCAI — расчёт по имени и дате рождения','/calendar':'Мой календарь — SYUCAI','/results':'Ваш расчёт — SYUCAI','/about':'О SYUCAI','/masters':'Найти мастера — SYUCAI','/account':'Кабинет мастера — SYUCAI','/privacy':'Приватность — SYUCAI'})[path]||'Мастер — SYUCAI';if(path==='/')home();else if(path==='/calendar')renderCalendar({shell,birthValue:values.date,onBirthChange:date=>values.date=date});else if(path==='/results')results();else if(path==='/about')about();else if(path==='/masters')masters();else if(path==='/account')account();else if(path==='/privacy')privacy();else if(path==='/admin')renderAdmin({shell,api,esc});else if(/^\/masters\/[a-f0-9-]+$/.test(path))master(path.split('/')[2]);else shell(`<div class="empty-state"><h1>Этой страницы пока нет</h1>${link('/','На главную','button')}</div>`,'page');analyticsPage()}
render();
initializeTranslations();
initializeAnalytics();
document.addEventListener('syucai:languagechange', event => {
 for (const input of document.querySelectorAll('input[list="cities"]')) {
  const value=input.value.toLowerCase();
  const city=cities.find(c=>cityLabel(c,event.detail.previous).toLowerCase()===value||c.id===value);
  if(city)input.value=cityLabel(city);
 }
 const list=document.querySelector('#cities');
 if(list)list.innerHTML=cities.map(c=>`<option value="${esc(cityLabel(c))}"></option>`).join('');
});

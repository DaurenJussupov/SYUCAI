import {parseBirthDate} from './calculations.js';
import {calendarDateKey,calendarMonth,calculateCalendarDay,calendarDays} from './calendar-calculations.js';
import {currentLanguage,translateText,translateDocument} from './i18n/runtime.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={birth:'',selected:null,year:null,month:null};
let active=false;
const format=(date,options)=>new Intl.DateTimeFormat(currentLanguage(),options).format(date);
const shortDate=date=>format(date,{day:'numeric',month:'long',year:'numeric'});
function guidance(day,label,kind){
 return `<article class="result-card" data-calendar-result="${kind}"><div class="eyebrow">${label}</div><div class="number">${day.value}</div><h3>${escape(day.data.title)}</h3><p class="calc">${escape(day.calc)}</p><p class="intro">${escape(day.data.summary)}</p><div class="day-guidance"><h4>Что делать</h4><p>${escape(day.data.todo)}</p><h4>Чего избегать</h4><p>${escape(day.data.avoid)}</p></div></article>`;
}
function renderPanel(){
 const panel=document.querySelector('#calendar-panel');if(!active||!panel||!state.birth)return;
 const now=new Date(),limit=now.getFullYear();
 const selected=calculateCalendarDay(state.birth,state.selected,now),month=calendarMonth(state.birth,state.year,state.month,now);
 const weekdays=Array.from({length:7},(_,i)=>format(new Date(2024,0,1+i),{weekday:'short'}));
 const months=Array.from({length:12},(_,i)=>`<option value="${i+1}" ${state.month===i+1?'selected':''}>${escape(format(new Date(2024,i,1),{month:'long'}))}</option>`).join('');
 const years=Array.from({length:61},(_,i)=>limit-30+i).map(y=>`<option value="${y}" ${state.year===y?'selected':''}>${y}</option>`).join('');
 const today=calendarDateKey(now);
 panel.innerHTML=`<section class="calendar-month" aria-label="Личный и общий календарь"><div class="calendar-toolbar"><button type="button" class="calendar-arrow" id="calendar-prev" aria-label="Предыдущий месяц" ${state.year===limit-30&&state.month===1?'disabled':''}>‹</button><select class="control" id="calendar-month" aria-label="Месяц">${months}</select><select class="control" id="calendar-year" aria-label="Год">${years}</select><button type="button" class="calendar-arrow" id="calendar-next" aria-label="Следующий месяц" ${state.year===limit+30&&state.month===12?'disabled':''}>›</button></div><div class="calendar-grid" role="group" aria-label="Дни месяца">${weekdays.map(d=>`<div class="calendar-weekday" data-i18n-skip>${escape(d)}</div>`).join('')}${'<div class="calendar-spacer" aria-hidden="true"></div>'.repeat(month.offset)}${month.days.map(day=>`<button type="button" class="calendar-cell ${day.date===today?'is-today':''} ${day.date===selected.date?'is-selected':''}" data-date="${day.date}" aria-pressed="${day.date===selected.date}" ${day.date===today?'aria-current="date"':''} aria-label="${escape(translateText(`${shortDate(new Date(state.year,state.month-1,day.day))}: личный день ${day.personal.value}, общий день ${day.general.value}`))}"><b>${day.day}</b><span class="calendar-cell-energies" aria-hidden="true"><span class="personal-value">${day.personal.value}</span><span class="general-value">${day.general.value}</span></span></button>`).join('')}</div><div class="calendar-legend"><span><i class="personal-key"></i>Личный день</span><span><i class="general-key"></i>Общий день</span><span><i class="today-key"></i>Сегодня</span><button type="button" id="calendar-today" class="text-button">Вернуться к сегодня</button></div></section><section class="calendar-selected" aria-labelledby="selected-day-title"><div class="section-heading"><h2 id="selected-day-title"><time datetime="${selected.date}">${escape(shortDate(state.selected))}</time>${selected.date===today?'<span class="today-badge">Сегодня</span>':''}</h2><span class="selected-weekday" data-i18n-skip>${escape(format(state.selected,{weekday:'long'}))}</span></div><div class="result-grid day-grid">${guidance(selected.personal,'Личный день','personal')}${guidance(selected.general,'Общий день','general')}</div></section><details class="calendar-reference"><summary>Все значения дней от 1 до 9 <span>+</span></summary><div class="calendar-reference-list">${Object.entries(calendarDays).map(([number,data])=>`<article><h3><span>${number}</span> <span>${escape(data.title)}</span></h3><p>${escape(data.summary)}</p><h4>Что делать</h4><p>${escape(data.todo)}</p><h4>Чего избегать</h4><p>${escape(data.avoid)}</p></article>`).join('')}</div></details><p class="fineprint">Личный день рассчитывается по дню и месяцу рождения, году, месяцу и числу выбранной даты. Общий день — по сумме цифр выбранной даты.</p>`;
 panel.hidden=false;
 const shift=delta=>{const date=new Date(state.year,state.month-1+delta,1);if(date.getFullYear()<limit-30||date.getFullYear()>limit+30)return;state.year=date.getFullYear();state.month=date.getMonth()+1;renderPanel();document.querySelector(delta<0?'#calendar-prev':'#calendar-next')?.focus()};
 panel.querySelector('#calendar-prev').onclick=()=>shift(-1);
 panel.querySelector('#calendar-next').onclick=()=>shift(1);
 panel.querySelector('#calendar-month').onchange=e=>{state.month=Number(e.target.value);renderPanel();document.querySelector('#calendar-month').focus()};
 panel.querySelector('#calendar-year').onchange=e=>{state.year=Number(e.target.value);renderPanel();document.querySelector('#calendar-year').focus()};
 panel.querySelector('#calendar-today').onclick=()=>{const date=new Date();state.selected=date;state.year=date.getFullYear();state.month=date.getMonth()+1;renderPanel()};
 for(const cell of panel.querySelectorAll('[data-date]'))cell.onclick=()=>{const [y,m,d]=cell.dataset.date.split('-').map(Number);state.selected=new Date(y,m-1,d);renderPanel();document.querySelector(`[data-date="${cell.dataset.date}"]`)?.focus()};
 translateDocument();
}
export function renderCalendar({shell,birthValue,onBirthChange}){
 active=true;
 shell(`<div class="page-head"><h1>МОЙ КАЛЕНДАРЬ</h1></div><form id="calendar-form" class="calendar-form" novalidate><label class="form-label" for="calendar-birth">Введите дату рождения</label><div class="calendar-form-row"><input id="calendar-birth" class="control" inputmode="numeric" autocomplete="bday" placeholder="ДД.ММ.ГГГГ" maxlength="10" value="${escape(birthValue)}" aria-describedby="calendar-error"><button class="button" type="submit">Открыть календарь <span aria-hidden="true">↗</span></button></div><p id="calendar-error" class="error" role="alert"></p></form><div id="calendar-panel" hidden></div>`, 'page calendar-page');
 const input=document.querySelector('#calendar-birth'),error=document.querySelector('#calendar-error');
 function open(showError=true){
  try{parseBirthDate(input.value)}catch(e){if(showError){error.textContent=e.message;input.setAttribute('aria-invalid','true');translateDocument();input.focus()}return false}
  error.textContent='';input.setAttribute('aria-invalid','false');onBirthChange(input.value);state.birth=input.value;
  if(!state.selected){const date=new Date();state.selected=date;state.year=date.getFullYear();state.month=date.getMonth()+1}
  renderPanel();return true;
 }
 input.oninput=()=>{
  const digits=input.value.replace(/\D/g,'').slice(0,8);input.value=digits.slice(0,2)+(digits.length>2?'.'+digits.slice(2,4):'')+(digits.length>4?'.'+digits.slice(4):'');onBirthChange(input.value);error.textContent='';input.setAttribute('aria-invalid','false');
  if(digits.length!==8||!open(false))document.querySelector('#calendar-panel').hidden=true;
 };
 document.querySelector('#calendar-form').onsubmit=e=>{e.preventDefault();open()};
 if(birthValue)open(false);
}
export function leaveCalendar(){active=false}
document.addEventListener('syucai:languagechange',()=>{if(active&&document.querySelector('#calendar-panel')&&!document.querySelector('#calendar-panel').hidden)renderPanel()});

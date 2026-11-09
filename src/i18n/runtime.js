import source from './source.json';
import {languages,languageByCode,languageName,sortedLanguages} from './languages.js';
const catalogs=new Map([['ru',{}]]);
let locale='ru',pending=false,manifest=null;
const originals=new WeakMap(),attributes=new WeakMap();
const skipped='script,style,code,pre,[data-i18n-skip],.preline,.review p,.review b,.admin-profile .preline';
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=source.strings.filter(s=>/\{\d+\}/.test(s)).map(message=>{
 const slots=[];let previous=0,pattern='^';
 for(const match of message.matchAll(/\{(\d+)\}/g)){pattern+=escapeRegExp(message.slice(previous,match.index))+'([\\s\\S]+?)';slots.push(match[1]);previous=match.index+match[0].length}
 pattern+=escapeRegExp(message.slice(previous))+'$';
 return {message,slots,regex:new RegExp(pattern)};
}).sort((a,b)=>b.message.length-a.message.length);
export const currentLanguage=()=>locale;
export function translateText(value,language=locale) {
 const raw=String(value??'');if(language==='ru')return raw;
 const dictionary=catalogs.get(language)||{},key=raw.trim();
 let translated=dictionary[key];
 if(translated===undefined){for(const {message,slots,regex} of patterns){if(!dictionary[message])continue;const match=regex.exec(key);if(!match)continue;
   const args={};slots.forEach((slot,i)=>args[slot]=/^(Документ|Фото):/.test(message)?match[i+1]:(dictionary[match[i+1]]||match[i+1]));translated=dictionary[message].replace(/\{(\d+)\}/g,(_,slot)=>args[slot]??'');break;
 }}
 if(translated===undefined&&key.includes(' · ')) {
  const parts=key.split(' · ');if(parts.some(part=>dictionary[part]))translated=parts.map(part=>dictionary[part]||part).join(' · ');
 }
 return translated===undefined?raw:raw.slice(0,raw.length-raw.trimStart().length)+translated+raw.slice(raw.trimEnd().length);
}
export const cityLabel=(city,language=locale)=>`${translateText(city.name,language)}, ${translateText(city.country,language)}`;
export function translateGeneratedValue(element,value){element.dataset.i18nValue=value;element.value=translateText(value);element.addEventListener('input',()=>delete element.dataset.i18nValue,{once:true})}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;translateDocument()})}
export function translateDocument(){
 const language=languageByCode(locale);document.documentElement.lang=locale;document.documentElement.dir=language.dir;
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;if(node.parentElement?.closest(skipped)||!node.nodeValue.trim())continue;
  const previous=originals.get(node);const raw=!previous||node.nodeValue!==previous.translated?node.nodeValue:previous.source;
  const translated=translateText(raw);if(node.nodeValue!==translated)node.nodeValue=translated;
  originals.set(node,{source:raw,translated});
 }
 for(const el of document.querySelectorAll('[placeholder],[aria-label],[title]')){
  if(el.closest('[data-i18n-skip]'))continue;
  let saved=attributes.get(el);if(!saved){saved={};attributes.set(el,saved)}
  for(const attr of ['placeholder','aria-label','title']){
   if(!el.hasAttribute(attr))continue;
   const actual=el.getAttribute(attr),previous=saved[attr],raw=!previous||actual!==previous.translated?actual:previous.source,translated=translateText(raw);
   if(actual!==translated)el.setAttribute(attr,translated);saved[attr]={source:raw,translated};
  }
 }
 for(const time of document.querySelectorAll('time[datetime]')){
  const parts=time.getAttribute('datetime').split('-').map(Number);if(parts.length!==3||parts.some(n=>!Number.isFinite(n)))continue;
  const value=new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric'}).format(new Date(parts[0],parts[1]-1,parts[2]));
  if(time.textContent!==value)time.textContent=value;originals.delete(time.firstChild);
 }
 for(const el of document.querySelectorAll('[data-i18n-value]'))el.value=translateText(el.dataset.i18nValue);
}
function toast(message){const el=document.querySelector('.toast');if(!el)return;el.hidden=false;el.textContent=translateText(message);setTimeout(()=>el.hidden=true,7000)}
export async function setLanguage(code){
 if(!languageByCode(code)||pending)return false;if(code===locale){closeLanguages();return true}
 pending=true;const button=document.querySelector('#language-button');if(button)button.setAttribute('aria-busy','true');
 try{
  if(code!=='ru'&&!catalogs.has(code)){
   if(manifest?.languages?.[code]?.status==='unavailable')throw Error('unavailable');
   const r=await fetch(`/i18n/${encodeURIComponent(code)}.json?v=${source.sourceHash}`,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('unavailable');
   const data=await r.json();
   if(data.locale!==code||data.sourceHash!==source.sourceHash||data.status!=='ready'||!source.strings.every(key=>typeof data.translations?.[key]==='string'&&data.translations[key].length))throw Error('incomplete');
   catalogs.set(code,data.translations);
  }
  const previous=locale;locale=code;try{localStorage.setItem('syucai.language',code)}catch{}
  document.dispatchEvent(new CustomEvent('syucai:languagechange',{detail:{previous,locale}}));
  mountLanguagePicker();translateDocument();closeLanguages();return true;
 }catch{toast('Перевод временно недоступен. Выбранный язык не изменён.');return false}
 finally{pending=false;document.querySelector('#language-button')?.removeAttribute('aria-busy')}
}
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountLanguagePicker(){
 const host=document.querySelector('#language-control');if(!host)return;
 const selected=languageByCode(locale);
 host.innerHTML=`<button id="language-button" class="language-button" type="button" aria-label="Язык сайта" aria-expanded="false" aria-controls="language-panel"><img class="flag" src="/flags/${selected.flag}.svg" alt=""><span>${selected.short}</span><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m2 4 4 4 4-4"/></svg></button><div id="language-panel" class="language-panel" role="dialog" aria-label="Выбрать язык" hidden><label class="sr-only" for="language-search">Найти язык</label><input id="language-search" class="language-search" type="search" placeholder="Найти язык" autocomplete="off"><div class="language-list" role="listbox" aria-label="Выбрать язык"></div></div>`;
 const panel=host.querySelector('#language-panel'),search=host.querySelector('#language-search'),list=host.querySelector('.language-list');
 function options(){
  const query=search.value.toLocaleLowerCase(locale).trim();
  list.innerHTML=sortedLanguages(locale).filter(l=>[l.ru,l.native,l.short,languageName(l,locale)].join(' ').toLocaleLowerCase(locale).includes(query)).map(l=>`<button type="button" class="language-option" role="option" aria-selected="${l.code===locale}" data-language="${l.code}" ${manifest?.languages?.[l.code]?.status==='unavailable'?'disabled title="Перевод пока недоступен"':''}><img class="flag" src="/flags/${l.flag}.svg" alt=""><span class="language-names"><span>${html(languageName(l,locale))}</span><small lang="${l.code}">${html(l.native)}</small></span><span class="language-code">${l.short}</span></button>`).join('');
  list.querySelectorAll('[data-language]').forEach(el=>el.onclick=()=>setLanguage(el.dataset.language));
 }
 options();search.oninput=options;
 host.querySelector('#language-button').onclick=()=>{
  const open=panel.hidden;panel.hidden=!open;host.querySelector('#language-button').setAttribute('aria-expanded',String(open));
  if(open){document.querySelector('#site-menu')?.setAttribute('hidden','');const menu=document.querySelector('.menu-button');menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label',translateText('Открыть меню'));search.focus()}
 };
 panel.onkeydown=e=>{
  const options=[...list.querySelectorAll('button:not(:disabled)')];const index=options.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();options[(index+1)%options.length]?.focus()}
  if(e.key==='ArrowUp'){e.preventDefault();options[index<=0?options.length-1:index-1]?.focus()}
  if(e.key==='Home'&&index>=0){e.preventDefault();options[0]?.focus()}
  if(e.key==='End'&&index>=0){e.preventDefault();options.at(-1)?.focus()}
 };
 schedule();
}
export function closeLanguages(restoreFocus=false){const panel=document.querySelector('#language-panel'),button=document.querySelector('#language-button');if(panel)panel.hidden=true;if(button){button.setAttribute('aria-expanded','false');if(restoreFocus)button.focus()}}
document.addEventListener('click',e=>{if(!e.target.closest('#language-control'))closeLanguages()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('#language-panel')?.hidden===false)closeLanguages(true)});
export async function initializeTranslations(){
 new MutationObserver(records=>{if(records.some(r=>!r.target.parentElement?.closest('script,style')))schedule()}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
 try{const r=await fetch(`/i18n/manifest.json?v=${source.sourceHash}`);if(r.ok){const data=await r.json();if(data.sourceHash===source.sourceHash)manifest=data}}catch{}
 let saved;try{saved=localStorage.getItem('syucai.language')}catch{}
 if(saved&&languageByCode(saved)&&saved!=='ru')await setLanguage(saved);else schedule()
}

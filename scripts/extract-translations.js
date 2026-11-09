import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parse} from 'acorn';
import {parseFragment} from 'parse5';
import {createHash} from 'node:crypto';
import {cities} from '../shared/cities.js';
const messages=new Set();
function add(text){const value=text?.trim().replace(/__SYUCAI_VAR_(\d+)__/g,'{$1}');if(value&&/[А-Яа-яЁё]/.test(value)&&value.length>1&&!value.includes('document.querySelector')&&!value.includes('function '))messages.add(value)}
function html(text){
 if(!text)return;
 if(!text.includes('<')){add(text);return}
 function walk(node){
  if(node.nodeName==='#text')add(node.value);
  for(const a of node.attrs||[])if(['placeholder','aria-label','title'].includes(a.name))add(a.value);
  for(const child of node.childNodes||[])walk(child);
 }
 walk(parseFragment(text));
}
function walk(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='Literal'&&typeof node.value==='string')html(node.value);
 if(node.type==='TemplateLiteral')html(node.quasis.map((q,i)=>(q.value.cooked||'')+(i<node.expressions.length?`__SYUCAI_VAR_${i}__`:'')).join(''));
 for(const [k,v] of Object.entries(node))if(!['start','end','loc'].includes(k)){
  if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);
 }
}
function data(value){if(typeof value==='string')add(value);else if(value&&typeof value==='object')Object.values(value).forEach(data)}
for(const file of ['src/main.js','src/admin.js','src/analytics.js','src/calendar.js','src/calendar-calculations.js','src/calculations.js','worker/index.js','worker/admin.js','worker/admin-auth.js','worker/google.js','worker/analytics.js'])walk(parse(await readFile(file,'utf8'),{sourceType:'module',ecmaVersion:'latest'}));
for(const file of ['src/birth-data.json','src/name-data.json','src/calendar-data.json'])data(JSON.parse(await readFile(file,'utf8')));
for(const city of cities){add(city.name);add(city.country)}
for(const text of ['Язык сайта','Выбрать язык','Найти язык','Загрузка перевода…','Перевод временно недоступен. Выбранный язык не изменён.','Перевод пока недоступен','Закрыть выбор языка'])add(text);
// Data-only labels used in API validation and numeric/date context.
for(const text of ['Документ: {0} ↓','Фото: {0} ↓','{0} км','Число','Личный год {0} → личный месяц {1} → личный день {2}'])add(text);
const strings=[...messages].sort();
const sourceHash=createHash('sha256').update(JSON.stringify(strings)).digest('hex');
await mkdir('src/i18n',{recursive:true});
await writeFile('src/i18n/source.json',JSON.stringify({sourceHash,strings},null,2)+'\n');
console.log(`Translation source: ${strings.length} messages; ${strings.reduce((n,s)=>n+s.length,0)} characters.`);

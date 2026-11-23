import {parseFragment} from 'parse5';
import {seoPages,guideIntro,guideQuestions,guideLinks} from '../shared/seo-content.js';
import {renderAbout} from '../src/about.js';
import {renderPrivacy} from '../src/privacy.js';
const common=['Главная','МОЙ КАЛЕНДАРЬ','О SYUCAI','Найти мастера','Блог SYUCAI','О расчётах','Политика конфиденциальности','Главная навигация'];
function textKeys(render){let html='';render({shell:value=>html=value,link:(_path,label)=>'<a>'+label+'</a>'});const keys=[];function walk(node){if(node.nodeName==='#text')keys.push(node.value.trim());for(const a of node.attrs||[])if(['placeholder','title','aria-label'].includes(a.name))keys.push(a.value.trim());for(const child of node.childNodes||[])walk(child)}walk(parseFragment(html));return keys}
export function seoTranslationCoverage(source,translations){
 const managed=new Set(source.strings),definitions={};
 for(const [path,page] of Object.entries(seoPages))definitions[path]=[...common,page.title,page.heading,page.description];
 definitions['/'].push('Введите дату рождения','ДД.ММ.ГГГГ','Введите название / имя','Имя латиницей','Рассчитать','Можно заполнить одно или оба поля.');
 definitions['/guide'].push(guideIntro,...guideQuestions.flat(),...guideLinks.map(([,label])=>label));
 definitions['/about'].push(...textKeys(renderAbout));definitions['/privacy'].push(...textKeys(renderPrivacy));definitions['/blog'].push('Читать далее');
 definitions['/masters/:id']=[...common,'Мастер SYUCAI','Квалификация','О мастере'];
 // Private auth/moderation strings must not determine public page indexing.
 return Object.fromEntries(Object.entries(definitions).map(([path,values])=>{const keys=[...new Set(values)].filter(k=>managed.has(k)&&/[А-Яа-яЁё]/.test(k));return [path,keys.length>0&&keys.every(k=>typeof translations[k]==='string'&&translations[k].trim())]}));
}

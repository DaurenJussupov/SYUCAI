import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {languages} from '../src/i18n/languages.js';
import {catalogTranslations,catalogState} from '../shared/translation-catalog.js';

export function batches(strings,maxLength=3400){
 const groups=[];let group=[],length=0;
 for(const source of strings){if(group.length&&length+source.length+28>maxLength){groups.push(group);group=[];length=0}group.push(source);length+=source.length+28}
 if(group.length)groups.push(group);return groups;
}
export function decodeBatch(text,sources){
 const parts=[...text.matchAll(/\[\[SYUCAI_(\d+)\]\]/g)];
 if(parts.length!==sources.length)throw Error('Translation batch lost its message markers.');
 const output={};
 for(let i=0;i<parts.length;i++){
  if(Number(parts[i][1])!==i)throw Error('Translation batch reordered messages.');
  const translated=text.slice(parts[i].index+parts[i][0].length,parts[i+1]?.index??text.length).trim();
  if(!translated)throw Error('Empty translated message.');
  const source={strings:[sources[i]]};
  if(!catalogTranslations({locale:'batch',translations:{[sources[i]]:translated}},source,'batch')[sources[i]])throw Error('Translation changed message placeholders or included unexpected markup.');
  output[sources[i]]=translated;
 }
 return output;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const priority=new Set(['Введите дату рождения','Введите название / имя','Имя латиницей','ДД.ММ.ГГГГ','Рассчитать','МОЙ КАЛЕНДАРЬ','Главная','О SYUCAI','Найти мастера','Кабинет мастера','Результаты расчёта','Ваши энергии','Число имени','Число сознания','Число миссии','Личный день','Общий день','Мастер SYUCAI в Вашем городе','Рейтинг и отзывы','Язык сайта','Выбрать язык','Найти язык','Принять cookies','Только необходимые']);
const providers=['https://translate.googleapis.com/translate_a/single','https://translate.google.com/translate_a/single'];
function responseText(data){
 if(Array.isArray(data))return (data[0]||[]).map(segment=>segment?.[0]||'').join('');
 return (data.sentences||[]).map(s=>s.trans||'').join('');
}
export async function translateBatch(sources,target,{request=fetch,pause=wait}={}){
 // GET is the public gtx interface. The former Android client POST can return 403.
 // Small groups also keep percent-encoded Russian text within practical URL limits.
 const groups=batches(sources,900),translations={};
 for(const group of groups){
  const input=group.map((s,i)=>`[[SYUCAI_${i}]]\n${s}`).join('\n\n');let lastError,done=false;
  for(const provider of providers){
   const url=new URL(provider);url.search=new URLSearchParams({client:'gtx',sl:'ru',tl:target,dt:'t',dj:'1',q:input});
   for(let attempt=0;attempt<3;attempt++){
    try{
     const response=await request(url.href,{signal:AbortSignal.timeout(15000)});
     if([429,500,502,503,504].includes(response.status)&&attempt<2){const seconds=Number(response.headers?.get('retry-after'));await pause(Number.isFinite(seconds)&&seconds>0?seconds*1000:2000*2**attempt);continue}
     if(!response.ok)throw Object.assign(Error(`Translation provider returned HTTP ${response.status} for ${target}.`),{status:response.status});
     Object.assign(translations,decodeBatch(responseText(await response.json()),group));done=true;break;
    }catch(error){lastError=error;if(!error.status&&attempt<2){await pause(1000*2**attempt);continue}break}
   }
   if(done)break;
  }
  if(!done)throw lastError||Error('Translation retry limit reached.');
 }
 return translations;
}
export function validCatalog(catalog,source,locale){
 return catalog?.sourceHash===source.sourceHash&&catalog.locale===locale&&catalog.status==='ready'&&catalogState(catalog,source,locale).status==='ready';
}
export const reusableTranslations=catalogTranslations;
export function remoteTranslationsEnabled(env=process.env){
 return env.SYUCAI_SKIP_REMOTE_SETUP!=='1'&&(!!env.CLOUDFLARE_API_TOKEN||env.SYUCAI_BUILD_TRANSLATIONS==='1'||['true','1'].includes(env.WORKERS_CI));
}
export async function buildTranslations({root=process.cwd(),request=fetch,pause=wait,languageList=languages,remoteEnabled=remoteTranslationsEnabled(),previous='https://syucai.alphalab-kz.workers.dev/i18n/',logger=console}={}){
 const source=JSON.parse(await readFile(resolve(root,'src/i18n/source.json'),'utf8'));
 const output=resolve(root,'dist/i18n');await mkdir(output,{recursive:true});
 const manifest={sourceHash:source.sourceHash,generatedAt:new Date().toISOString(),languages:{ru:{status:'ready'}}};
 const overridden=new Set(),seeds=new Map();
 for(const language of languageList.filter(l=>l.code!=='ru')){
  let raw;try{raw=await readFile(resolve(root,`translations/${language.code}.json`),'utf8')}catch(e){if(e.code!=='ENOENT')throw e}
  if(raw){const catalog=JSON.parse(raw);if(!validCatalog(catalog,source,language.code))throw Error(`Reviewed catalog ${language.code} is incomplete or stale. Update it before publishing.`);
   await writeFile(`${output}/${language.code}.json`,JSON.stringify(catalog));manifest.languages[language.code]={status:'ready',reviewed:true,translated:source.strings.length,total:source.strings.length};overridden.add(language.code);continue;
  }
  // Optional checked-in machine cache, separate from strictly reviewed overrides.
  try{const cache=JSON.parse(await readFile(resolve(root,`translations/cache/${language.code}.json`),'utf8'));seeds.set(language.code,catalogTranslations(cache,source,language.code))}catch(error){if(error.code!=='ENOENT')throw error}
 }
 async function save(language,translations){
  const state=catalogState({locale:language.code,translations},source,language.code);
  const catalog={locale:language.code,sourceHash:source.sourceHash,...state};
  await writeFile(`${output}/${language.code}.json`,JSON.stringify(catalog));
  manifest.languages[language.code]={status:state.status,translated:state.translated,total:state.total};return state;
 }
 if(!remoteEnabled){
  for(const language of languageList.filter(l=>l.code!=='ru'&&!overridden.has(l.code)))if(seeds.has(language.code))await save(language,seeds.get(language.code));
  await writeFile(output+'/manifest.json',JSON.stringify({...manifest,localBuild:true}));
  logger.log('Local build: using reviewed/cached catalogs without contacting a translation service.');return manifest;
 }
 const queue=languageList.filter(l=>l.code!=='ru'&&!overridden.has(l.code));
 async function worker(){for(;;){const language=queue.shift();if(!language)return;let translations={};
  try{const response=await request(previous+language.code+'.json',{signal:AbortSignal.timeout(10000)});if(response.ok)translations=catalogTranslations(await response.json(),source,language.code)}catch{}
  Object.assign(translations,seeds.get(language.code)||{});
  const missing=source.strings.filter(key=>!translations[key]);
  const ordered=[...missing.filter(key=>priority.has(key)),...missing.filter(key=>!priority.has(key))];
  try{for(const group of batches(ordered,900)){
    Object.assign(translations,await translateBatch(group,language.target,{request,pause}));await pause(450);
   }
  }catch(error){logger.error(`Translation refresh deferred: ${language.code}: ${error.message}`)}
  const state=await save(language,translations);
  logger.log(`Translation ${state.status}: ${language.code} (${state.translated}/${state.total})`);
 }}
 await Promise.all([worker(),worker(),worker()]);
 await writeFile(output+'/manifest.json',JSON.stringify(manifest));
 const usable=Object.entries(manifest.languages).filter(([code,value])=>code!=='ru'&&value.status!=='unavailable').length;
 // A network outage must never successfully deploy a Russian-only replacement.
 if(languageList.some(l=>l.code!=='ru')&&!usable)throw Error('No usable foreign-language catalogs. Deployment stopped; existing site remains unchanged. Restore translation access or provide cached catalogs.');
 logger.log(`Translation catalogs: ${usable}/${languageList.length-1} foreign languages available. Existing translations survive deferred updates.`);return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildTranslations().catch(e=>{console.error(e.message);process.exitCode=1});

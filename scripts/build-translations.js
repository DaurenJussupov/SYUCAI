import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {languages} from '../src/i18n/languages.js';

export function batches(strings, maxLength=3400) {
 const groups=[];let group=[],length=0;
 for(const source of strings){if(group.length&&length+source.length+28>maxLength){groups.push(group);group=[];length=0}group.push(source);length+=source.length+28}
 if(group.length)groups.push(group);return groups;
}
export function decodeBatch(text, sources) {
 const parts=[...text.matchAll(/\[\[SYUCAI_(\d+)\]\]/g)];
 if(parts.length!==sources.length)throw Error('Translation batch lost its message markers.');
 const output={};
 for(let i=0;i<parts.length;i++){
  if(Number(parts[i][1])!==i)throw Error('Translation batch reordered messages.');
  const translated=text.slice(parts[i].index+parts[i][0].length,parts[i+1]?.index??text.length).trim();
  if(!translated)throw Error('Empty translated message.');
  const placeholders=s=>(s.match(/\{\d+\}/g)||[]).sort().join('|');
  if(placeholders(translated)!==placeholders(sources[i]))throw Error('Translation changed message placeholders.');
  if(/<\/?(?:script|iframe|img|svg)\b/i.test(translated))throw Error('Unexpected markup in a translation.');
  output[sources[i]]=translated;
 }
 return output;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function translateBatch(sources,target,{request=fetch,pause=wait}={}) {
 const input=sources.map((s,i)=>`[[SYUCAI_${i}]]\n${s}`).join('\n\n');
 const url='https://translate.google.com/translate_a/single?client=at&dt=t&dj=1';
 for(let attempt=0;attempt<4;attempt++){
  const response=await request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({sl:'ru',tl:target,q:input}),signal:AbortSignal.timeout(45000)});
  if([429,500,502,503,504].includes(response.status)&&attempt<3){const seconds=Number(response.headers?.get('retry-after'));await pause(Number.isFinite(seconds)&&seconds>0?seconds*1000:2000*2**attempt);continue}
  if(!response.ok)throw Error(`Translation provider returned HTTP ${response.status} for ${target}.`);
  const data=await response.json();const text=(data.sentences||[]).map(s=>s.trans||'').join('');
  return decodeBatch(text,sources);
 }
 throw Error('Translation retry limit reached.');
}
export function validCatalog(catalog,source,locale) {
 return catalog?.sourceHash===source.sourceHash&&catalog.locale===locale&&catalog.status==='ready'&&source.strings.every(s=>typeof catalog.translations?.[s]==='string'&&catalog.translations[s].length>0);
}
export async function buildTranslations() {
 const source=JSON.parse(await readFile('src/i18n/source.json','utf8'));
 const output='dist/i18n';await mkdir(output,{recursive:true});
 const manifest={sourceHash:source.sourceHash,generatedAt:new Date().toISOString(),languages:{ru:{status:'ready'}}};
 const overridden=new Set();
 for(const language of languages.filter(l=>l.code!=='ru')){
  let raw;try{raw=await readFile(`translations/${language.code}.json`,'utf8')}catch(e){if(e.code==='ENOENT')continue;throw e}
  const catalog=JSON.parse(raw);if(!validCatalog(catalog,source,language.code))throw Error(`Reviewed catalog ${language.code} is incomplete or stale. Update it before publishing.`);
  await writeFile(`${output}/${language.code}.json`,JSON.stringify(catalog));manifest.languages[language.code]={status:'ready',reviewed:true};overridden.add(language.code);
 }
 if(process.env.SYUCAI_SKIP_REMOTE_SETUP==='1'||(!process.env.CLOUDFLARE_API_TOKEN&&process.env.SYUCAI_BUILD_TRANSLATIONS!=='1')){
  await writeFile(output+'/manifest.json',JSON.stringify({...manifest,localBuild:true}));
  console.log('Local build: external translation service is not contacted. Production builds generate static language catalogs.');return;
 }
 const previous='https://syucai.alphalab-kz.workers.dev/i18n/';
 // Low parallelism and backoff respect the provider; requests contain only repository copy.
 const queue=languages.filter(l=>l.code!=='ru'&&!overridden.has(l.code));
 async function worker(){for(;;){const language=queue.shift();if(!language)return;let translations={};try{
   let catalog;
   try{const r=await fetch(previous+language.code+'.json',{signal:AbortSignal.timeout(10000)});if(r.ok){const old=await r.json();if(validCatalog(old,source,language.code))catalog=old;else if(old.sourceHash===source.sourceHash&&old.locale===language.code)translations=old.translations||{}}}catch{}
   if(!catalog){for(const group of batches(source.strings.filter(key=>!translations[key]))){Object.assign(translations,await translateBatch(group,language.target));await wait(450)}catalog={locale:language.code,sourceHash:source.sourceHash,status:'ready',translations}}
   if(!validCatalog(catalog,source,language.code))throw Error('Incomplete translation catalog.');
   await writeFile(`${output}/${language.code}.json`,JSON.stringify(catalog));manifest.languages[language.code]={status:'ready'};
   console.log(`Translation ready: ${language.code}`);
  }catch(e){await writeFile(`${output}/${language.code}.json`,JSON.stringify({locale:language.code,sourceHash:source.sourceHash,status:'unavailable',translations}));manifest.languages[language.code]={status:'unavailable'};console.error(`Translation unavailable: ${language.code}: ${e.message}`)}}}
 await Promise.all([worker(),worker(),worker()]);
 await writeFile(output+'/manifest.json',JSON.stringify(manifest));
 const ready=Object.values(manifest.languages).filter(v=>v.status==='ready').length;
 console.log(`Translation catalogs: ${ready}/${languages.length} ready. Unavailable locales are explicitly marked; no silent language substitution.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildTranslations().catch(e=>{console.error(e.message);process.exitCode=1});

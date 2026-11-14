import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildTranslations,remoteTranslationsEnabled} from '../scripts/build-translations.js';
const logger={log(){},error(){}};
const source={sourceHash:'current',strings:['Введите дату рождения','Рассчитать','Новый текст']};
const languageList=[{code:'ru'},{code:'en',target:'en'}];
async function setup(){const root=await mkdtemp(join(tmpdir(),'syucai-i18n-'));await mkdir(join(root,'src/i18n'),{recursive:true});await writeFile(join(root,'src/i18n/source.json'),JSON.stringify(source));return root}
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const previousCatalog={locale:'en',sourceHash:'previous',status:'unavailable',translations:{'Введите дату рождения':'Enter your date of birth','Рассчитать':'Calculate'}};
const options=root=>({root,languageList,remoteEnabled:true,pause:async()=>{},logger});
test('a failed refresh preserves translations from a legacy unavailable catalog and publishes an explicit partial catalog',async()=>{
 const root=await setup();try{
  const manifest=await buildTranslations({...options(root),request:async url=>String(url).includes('.workers.dev')?response(previousCatalog):response({},403)});
  assert.equal(manifest.languages.en.status,'partial');assert.equal(manifest.languages.en.translated,2);
  const catalog=JSON.parse(await readFile(join(root,'dist/i18n/en.json')));assert.equal(catalog.translations['Рассчитать'],'Calculate');assert.equal(catalog.translations['Новый текст'],undefined);assert.equal(catalog.sourceHash,'current');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('new copy is translated without retranslating preserved messages',async()=>{
 const root=await setup(),queries=[];try{
  const manifest=await buildTranslations({...options(root),request:async url=>{if(String(url).includes('.workers.dev'))return response(previousCatalog);const q=new URL(url).searchParams.get('q');queries.push(q);return response({sentences:[{trans:'[[SYUCAI_0]]\nNew text'}]})}});
  assert.equal(manifest.languages.en.status,'ready');assert.equal(queries.length,1);assert.ok(queries[0].includes('Новый текст'));assert.ok(!queries[0].includes('Введите дату рождения'));
 }finally{await rm(root,{recursive:true,force:true})}
});
test('a complete provider outage with no preserved translations stops production deployment',async()=>{
 const root=await setup();try{
  await assert.rejects(buildTranslations({...options(root),request:async()=>response({},403)}),/Deployment stopped/);
  const manifest=JSON.parse(await readFile(join(root,'dist/i18n/manifest.json')));assert.equal(manifest.languages.en.status,'unavailable');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('checked-in machine caches work offline and stale reviewed overrides cannot be silently replaced',async()=>{
 const root=await setup();try{
  await mkdir(join(root,'translations/cache'),{recursive:true});await writeFile(join(root,'translations/cache/en.json'),JSON.stringify(previousCatalog));
  const manifest=await buildTranslations({...options(root),remoteEnabled:false,request:async()=>{throw Error('No network expected')}});assert.equal(manifest.languages.en.status,'partial');
  await writeFile(join(root,'translations/en.json'),JSON.stringify(previousCatalog));await assert.rejects(buildTranslations({...options(root),remoteEnabled:false}),/Reviewed catalog en is incomplete or stale/);
 }finally{await rm(root,{recursive:true,force:true})}
});


test('Cloudflare Workers Builds generates catalogs even when authentication is not an environment token',()=>{
 assert.equal(remoteTranslationsEnabled({WORKERS_CI:'true'}),true);
 assert.equal(remoteTranslationsEnabled({WORKERS_CI:'1'}),true);
 assert.equal(remoteTranslationsEnabled({WORKERS_CI:'false'}),false);
 assert.equal(remoteTranslationsEnabled({SYUCAI_BUILD_TRANSLATIONS:'1'}),true);
 assert.equal(remoteTranslationsEnabled({WORKERS_CI:'true',SYUCAI_SKIP_REMOTE_SETUP:'1'}),false);
 assert.equal(remoteTranslationsEnabled({}),false);
});

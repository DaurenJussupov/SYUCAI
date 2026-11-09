import {test} from 'node:test';
import assert from 'node:assert/strict';
import {languages,sortedLanguages,languageByCode} from '../src/i18n/languages.js';
import {batches,decodeBatch,translateBatch,validCatalog,reusableTranslations} from '../scripts/build-translations.js';
import source from '../src/i18n/source.json' with {type:'json'};
import {existsSync} from 'node:fs';
test('all requested languages occur once, with flags, explicit codes and alphabetical ordering',()=>{
 assert.equal(languages.length,35);assert.equal(new Set(languages.map(l=>l.code)).size,35);
 assert.equal(languages.filter(l=>l.code==='cs').length,1);
 assert.equal(languageByCode('kk').short,'KZ');assert.equal(languageByCode('uz').short,'UZ');assert.equal(languageByCode('en').short,'ENG');assert.equal(languageByCode('uk').short,'UKR');
 assert.equal(languageByCode('ro-MD').target,'ro');assert.equal(languageByCode('inh').native,'ГӀалгӀай');
 assert.deepEqual(languages.filter(l=>l.dir==='rtl').map(l=>l.code).sort(),['ar','fa']);
 const names=sortedLanguages().map(l=>l.ru);assert.deepEqual(names,[...names].sort(new Intl.Collator('ru',{sensitivity:'base'}).compare));
 for(const l of languages)assert.ok(existsSync(`public/flags/${l.flag}.svg`),l.code);
});
test('translation batches keep numeric placeholders and reject missing or changed markers',()=>{
 const messages=['Ваш город','Личный год {0} → личный день {1}'];
 const text='[[SYUCAI_0]]\nYour city\n\n[[SYUCAI_1]]\nPersonal year {0} → personal day {1}';
 assert.deepEqual(decodeBatch(text,messages),{'Ваш город':'Your city','Личный год {0} → личный день {1}':'Personal year {0} → personal day {1}'});
 assert.throws(()=>decodeBatch(text.replace('{1}',''),messages),/placeholders/);
 assert.throws(()=>decodeBatch('Missing markers',messages),/markers/);
 assert.throws(()=>decodeBatch('[[SYUCAI_0]]<script>alert(1)</script>',['Ваш город']),/markup/);
 assert.deepEqual(batches(['aaa','bbb','ccc'],65),[['aaa','bbb'],['ccc']]);
});
test('rate limits back off; unsupported locales do not masquerade as translated catalogs',async()=>{
 let attempts=0;const pauses=[];
 const result=await translateBatch(['Ваш город'],'en',{request:async()=>++attempts===1?{status:429,ok:false,headers:{get:()=>null}}:{status:200,ok:true,json:async()=>({sentences:[{trans:'[[SYUCAI_0]]\nYour city'}]})},pause:async n=>pauses.push(n)});
 assert.equal(result['Ваш город'],'Your city');assert.deepEqual(pauses,[2000]);
 await assert.rejects(translateBatch(['Ваш город'],'inh',{request:async()=>({status:400,ok:false})}),/HTTP 400/);
 const translations=Object.fromEntries(source.strings.map(s=>[s,'translated']));
 assert.equal(validCatalog({locale:'en',sourceHash:source.sourceHash,status:'ready',translations},source,'en'),true);
 delete translations[source.strings[0]];assert.equal(validCatalog({locale:'en',sourceHash:source.sourceHash,status:'ready',translations},source,'en'),false);
 assert.equal(validCatalog({locale:'en',sourceHash:'old',status:'ready',translations},source,'en'),false);
});

test('copy updates reuse existing translations by exact source message without reusing changed placeholders',()=>{
 const old={locale:'en',sourceHash:'older',translations:{'Мой календарь':'My calendar','Личный год {0}':'Personal year {0}','Общий день {0}':'General day','Удалённый текст':'Deleted text'}};
 const current={sourceHash:'newer',strings:['Мой календарь','Личный год {0}','Общий день {0}','Новая надпись']};
 assert.deepEqual(reusableTranslations(old,current,'en'),{'Мой календарь':'My calendar','Личный год {0}':'Personal year {0}'});
 assert.deepEqual(reusableTranslations(old,current,'fr'),{});
});

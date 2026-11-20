import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countryCodes,countryName,countryCode,sortedCountries} from '../shared/countries.js';
import {resolveLocation} from '../shared/locations.js';
import {rankMasters} from '../shared/cities.js';
import {database} from './helpers/database.js';
import worker from '../worker/index.js';
import {hash} from '../worker/admin-auth.js';
const origin='https://syucai.test',owner='00000000-0000-4000-8000-000000000001',token='a'.repeat(64);
const request=(e,path,{method='GET',body,authenticated=false}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...(authenticated?{Cookie:'session='+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),e);
test('country identifiers are stable and names sort and localize without a translation API',()=>{
 assert.equal(countryCodes.length,249);assert.equal(new Set(countryCodes).size,249);
 assert.equal(countryCode('США'),'US');assert.equal(countryCode('United States'),'US');assert.equal(countryCode('Кыргызстан'),'KG');
 for(const locale of ['ru','en','de','ar','ja','kk']){const values=sortedCountries(locale);assert.equal(values.length,countryCodes.length);assert.ok(values.every(c=>c.name&&c.name!==c.code));assert.deepEqual(values.map(c=>c.code),[...values].sort((a,b)=>a.name.localeCompare(b.name,locale)).map(c=>c.code))}
 assert.equal(countryName('US','en'),'United States');assert.equal(countryName('ZZ'),'');
});
test('New York, mixed case and aliases work, while arbitrary cities need a country and never invent coordinates',()=>{
 const ny=resolveLocation({country_code:'US',city_name:'New York'});assert.equal(ny.id,'newyork');assert.equal(ny.lat,40.71);
 assert.equal(resolveLocation({country_code:'US',city_name:'NEW-YORK'}).id,ny.id);
 assert.equal(resolveLocation({country_code:'US',city_name:'Нью-Йорк'}).id,ny.id);
 assert.equal(resolveLocation({country_code:'KZ',city_name:'Алматы, Казахстан'}).id,'almaty');
 for(const [code,name] of [['US','A Small Town'],['JP','青ヶ島'],['FR','Y'],['KZ','Өскемен шағын қаласы']]){const location=resolveLocation({country_code:code,city_name:name,lat:10,lon:20,city_id:'newyork'});assert.equal(location.name,name);assert.equal(location.country_code,code);assert.equal(location.lat,null);assert.equal(location.lon,null)}
 for(const data of [{city_name:'New York'},{country_code:'ZZ',city_name:'New York'},{country_code:'US',city_name:''},{country_code:'US',city_name:'123'},{country_code:'US',city_name:'<script>'}])assert.throws(()=>resolveLocation(data));
 assert.equal(resolveLocation({country_code:'US',city_name:''},{requireCity:false}).name,'');
});
test('same free-text city wins over promotions; unknown distances stay null and other countries stay excluded',()=>{
 const city=resolveLocation({country_code:'US',city_name:'A Small Town'});
 const records=[{id:'elsewhere',city_id:'custom:US:elsewhere',city_name:'Elsewhere',country_code:'US',coordinates_known:0,lat:0,lon:0,promoted:1},{id:'local',city_id:city.id,city_name:'A Small Town',country_code:'US',coordinates_known:0,lat:0,lon:0},{id:'canada',city_name:'A Small Town',country_code:'CA',coordinates_known:0,lat:0,lon:0}];
 const result=rankMasters(records,city);assert.deepEqual(result.map(m=>m.id),['local','elsewhere']);assert.equal(result[0].same_city,true);assert.equal(result[1].distance,null);
 const countryOnly=rankMasters(records,resolveLocation({country_code:'US'},{requireCity:false}));assert.equal(countryOnly.length,2);assert.ok(countryOnly.every(m=>m.distance===null&&!m.same_city));
});
test('real profile API saves country and arbitrary city, restores drafts and searches public profiles without fabricated distances',async()=>{
 const e={...database(),ASSETS:{fetch:async()=>new Response('assets')}};try{
 e.sqlite.prepare('INSERT INTO accounts(id,email,password,salt) VALUES(?,?,?,?)').run(owner,'owner@example.test','hash','salt');
 await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(token),owner,Date.now()+60000).run();
 for(const kind of ['photo','document'])e.sqlite.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run(kind,owner,kind,kind,kind==='photo'?'image/png':'application/pdf',kind+'.pdf');
 const data={name:'World Master',bio:'A sufficiently detailed biography about international consultations and professional experience.',credentials:'Diploma',phone:'+12025550123',city_name:'New York'};
 assert.equal((await request(e,'/profile',{method:'PUT',body:data,authenticated:true})).status,400);
 assert.equal((await request(e,'/profile',{method:'PUT',body:{...data,country_code:'US'},authenticated:true})).status,200);
 let profile=e.sqlite.prepare('SELECT * FROM profiles WHERE id=?').get(owner);assert.equal(profile.city_name,'New York');assert.equal(profile.country_code,'US');assert.equal(profile.coordinates_known,1);assert.equal(profile.status,'pending');
 assert.equal((await(await request(e,'/masters?country_code=US&city_name=New+York')).json()).masters.length,0);
 const draft={city_name:'A Small Town',country_code:'US',password:'must-not-be-saved'};
 await request(e,'/profile/draft',{method:'PUT',body:draft,authenticated:true});const me=await(await request(e,'/me',{authenticated:true})).json();assert.equal(JSON.parse(me.draft.data).country_code,'US');assert.equal(JSON.parse(me.draft.data).password,undefined);
 assert.equal((await request(e,'/profile',{method:'PUT',body:{...data,...draft,lat:55,lon:55,city_id:'newyork'},authenticated:true})).status,200);
 profile=e.sqlite.prepare('SELECT * FROM profiles WHERE id=?').get(owner);assert.equal(profile.coordinates_known,0);assert.equal(profile.city_name,'A Small Town');
 e.sqlite.prepare("UPDATE profiles SET status='approved' WHERE id=?").run(owner);
 const same=await(await request(e,'/masters?country_code=US&city_name=a+small+town')).json();assert.equal(same.masters[0].same_city,true);assert.equal(same.masters[0].lat,null);assert.equal(same.masters[0].lon,null);
 const other=await(await request(e,'/masters?country_code=US&city_name=Elsewhere')).json();assert.equal(other.masters[0].distance,null);assert.equal(other.masters[0].same_city,false);
 assert.equal((await(await request(e,'/masters?country_code=CA')).json()).masters.length,0);
 assert.equal((await(await request(e,'/masters?country_code=US')).json()).masters.length,1);
 assert.equal((await request(e,'/masters?country_code=ZZ')).status,400);
 const detail=await(await request(e,'/masters/'+owner)).json();assert.equal(detail.city_name,'A Small Town');assert.equal(detail.country_code,'US');assert.equal(detail.lat,null);
 }finally{e.close()}
});

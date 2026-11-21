import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {database} from './helpers/database.js';
import worker from '../worker/index.js';
import {sendVerification,verifyEmail} from '../worker/email-verification.js';
import {hash} from '../worker/admin-auth.js';
const origin='https://syucai.test',email='same@example.test',passwords={master:'MasterPassword123!',user:'UserPassword456!'};
const request=(e,path,{type='master',method='GET',body,cookies=''}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{'X-Account-Type':type,...(cookies?{Cookie:cookies}:{}),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'})},...(body?{body:JSON.stringify(body)}:{})}),e);
const register=(e,type)=>request(e,'/auth/register',{type,method:'POST',body:{registrationType:type,email:email.toUpperCase(),name:'User Name',password:passwords[type],passwordConfirm:passwords[type],newsletter:type==='user'}});
const cookie=response=>response.headers.getSetCookie().map(v=>v.split(';')[0]).filter(v=>!v.endsWith('=')).join('; ');
for(const order of [['master','user'],['user','master']])test('same email registers once per section, with independent credentials and sessions: '+order.join(' first, then '),async()=>{
 const e={...database(),ASSETS:{fetch:async()=>new Response('assets')}};try{
 const sessions={};let identity;
 for(const type of order){const response=await register(e,type);assert.equal(response.status,200);sessions[type]=cookie(response);const data=await response.json();assert.equal(data.user.registration_type,type);identity=data.user.id}
 assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM accounts').get().n,1);assert.equal(e.sqlite.prepare("SELECT display_name FROM account_registrations WHERE registration_type='master'").get().display_name,'');assert.equal(e.sqlite.prepare("SELECT display_name FROM account_registrations WHERE registration_type='user'").get().display_name,'User Name');assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM account_registrations').get().n,2);
 for(const type of ['master','user']){assert.equal((await register(e,type)).status,409);const bad=await request(e,'/auth/login',{type,method:'POST',body:{email,password:passwords[type==='user'?'master':'user'],registrationType:type}});assert.equal(bad.status,401);const good=await request(e,'/auth/login',{type,method:'POST',body:{email,password:passwords[type],registrationType:type}});assert.equal(good.status,200)}
 const both=sessions.master+'; '+sessions.user;e.sqlite.prepare("INSERT INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,status) VALUES(?,'Self Master','almaty','Казахстан',43,76,'Biography','Diploma','77000000000','approved')").run(identity);const self=await request(e,'/masters/'+identity+'/reviews',{type:'user',method:'POST',cookies:both,body:{rating:5,text:'Must not review myself'}});assert.equal(self.status,400);assert.match((await self.json()).error,/Нельзя оставить отзыв о себе/);
 for(const type of ['master','user']){const data=await(await request(e,'/me',{type,cookies:both})).json();assert.equal(data.user.registration_type,type);assert.equal(data.user.id,identity)}
 assert.equal((await request(e,'/profile/draft',{method:'PUT',type:'master',cookies:sessions.user,body:{name:'Must not cross'}})).status,401);assert.equal((await request(e,'/profile/draft',{method:'PUT',type:'master',cookies:sessions.user.replace('session_user','session_master'),body:{name:'Forged cookie name'}})).status,401);
 assert.equal((await request(e,'/member/preferences',{method:'PUT',type:'user',cookies:sessions.master,body:{name:'Must not cross',newsletter:true}})).status,401);assert.equal((await request(e,'/member/preferences',{method:'PUT',type:'user',cookies:sessions.master.replace('session_master','session_user'),body:{name:'Forged cookie name',newsletter:true}})).status,401);
 await request(e,'/auth/logout',{type:'user',method:'POST',cookies:both});assert.equal((await(await request(e,'/me',{type:'user',cookies:both})).json()).user,null);assert.equal((await(await request(e,'/me',{type:'master',cookies:both})).json()).user.registration_type,'master');
 }finally{e.close()}
});
test('email confirmation is bound to its section and never consumes the other confirmation',async()=>{
 const e={...database(),ASSETS:{fetch:async()=>new Response('assets')}};try{
 const master=await(await register(e,'master')).json();await register(e,'user');const messages=[];e.RESEND_API_KEY='test-only';
 const send=async(_url,options)=>{messages.push(JSON.parse(options.body));return new Response(JSON.stringify({id:'accepted'}),{headers:{'Content-Type':'application/json'}})};
 for(const type of ['master','user'])await sendVerification(e,{id:master.user.id,email,registration_type:type},{request:send});
 const tokens=messages.map(m=>m.text.match(/#token=([a-f0-9]{64})/)[1]);assert.ok(messages[0].text.includes('&type=master'));assert.ok(messages[1].text.includes('&type=user'));
 await verifyEmail(e,tokens[0]);const rows=e.sqlite.prepare('SELECT registration_type,email_verified_at FROM account_registrations ORDER BY registration_type').all();assert.ok(rows[0].email_verified_at);assert.equal(rows[1].email_verified_at,null);assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM email_verification_tokens').get().n,1);
 await verifyEmail(e,tokens[1]);assert.ok(e.sqlite.prepare("SELECT email_verified_at FROM account_registrations WHERE registration_type='user'").get().email_verified_at);
 }finally{e.close()}
});
test('legacy sessions stay in their section; logout removes legacy fallback without logging out the other section',async()=>{
 const e={...database(),ASSETS:{fetch:async()=>new Response('assets')}};try{
 const m=await(await register(e,'master')).json(),u=await register(e,'user'),userCookie=cookie(u),legacy='a'.repeat(64);await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(legacy),m.user.id,Date.now()+60000).run();
 const cookies='session='+legacy+'; '+userCookie;assert.equal((await(await request(e,'/me',{type:'master',cookies})).json()).user.registration_type,'master');assert.equal((await(await request(e,'/me',{type:'user',cookies:'session='+legacy})).json()).user,null);
 await request(e,'/auth/logout',{type:'master',method:'POST',cookies});assert.equal((await(await request(e,'/me',{type:'master',cookies})).json()).user,null);assert.equal((await(await request(e,'/me',{type:'user',cookies})).json()).user.registration_type,'user');
 }finally{e.close()}
});
test('migration preserves a previously shared master, user activity, credentials, files and legacy sessions',()=>{
 const e=database({migrate:false});try{
 for(const file of ['0002_admin_integrations.sql','0003_promotions.sql','0004_email_verification.sql','0005_world_locations.sql','0006_members_moderation_blog.sql'])e.sqlite.exec(readFileSync('migrations/'+file,'utf8'));
 e.sqlite.prepare("INSERT INTO accounts(id,email,password,salt,registration_type,display_name,role,newsletter_opt_in,email_verified_at) VALUES('legacy',?,'original-hash','original-salt','master','Legacy User','moderator',1,CURRENT_TIMESTAMP)").run(email);
 e.sqlite.prepare("INSERT INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,status) VALUES('legacy','Legacy Master','almaty','Казахстан',43,76,'Bio','Diploma','77000000000','approved')").run();e.sqlite.prepare("INSERT INTO files VALUES('doc','legacy','document','private-key','application/pdf','diploma.pdf')").run();e.sqlite.prepare("INSERT INTO sessions VALUES('token','legacy',9999999999999)").run();
 e.sqlite.exec(readFileSync('migrations/0007_separate_profile_registrations.sql','utf8'));const rows=e.sqlite.prepare('SELECT * FROM account_registrations ORDER BY registration_type').all();assert.equal(rows.length,2);assert.equal(rows[0].password,'original-hash');assert.equal(rows[1].password,'original-hash');assert.equal(rows[0].role,'user');assert.equal(rows[1].role,'moderator');assert.equal(rows[0].newsletter_opt_in,0);assert.equal(rows[1].newsletter_opt_in,1);assert.ok(rows.every(r=>r.email_verified_at));assert.equal(e.sqlite.prepare('SELECT object_key FROM files').get().object_key,'private-key');assert.equal(e.sqlite.prepare('SELECT status FROM profiles').get().status,'approved');assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);e.sqlite.prepare("UPDATE account_registrations SET display_name='Independent user data',newsletter_opt_in=0 WHERE registration_type='user'").run();e.sqlite.prepare("UPDATE accounts SET email_verification_requested_at=7 WHERE id='legacy'").run();assert.equal(e.sqlite.prepare("SELECT display_name FROM account_registrations WHERE registration_type='user'").get().display_name,'Independent user data');e.sqlite.prepare("UPDATE accounts SET role='user' WHERE id='legacy'").run();assert.equal(e.sqlite.prepare("SELECT role FROM account_registrations WHERE registration_type='user'").get().role,'user');
 }finally{e.close()}
});

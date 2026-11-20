import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {database} from './helpers/database.js';
import {hash} from '../worker/admin-auth.js';
import {sendVerification,verifyEmail} from '../worker/email-verification.js';
const origin='https://syucai.test',id='00000000-0000-4000-8000-000000000001';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function fixture(){const db=database();db.sqlite.prepare('INSERT INTO accounts(id,email,password,salt) VALUES(?,?,?,?)').run(id,'master@example.test','hash','salt');return {...db,RESEND_API_KEY:'not-a-real-key',PUBLIC_SITE_URL:origin,ASSETS:{fetch:async()=>new Response('assets')}}}
const request=(e,path,{method='GET',body,headers={}}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),e);
const user={id,email:'master@example.test'};
function tokenFrom(message){return message.text.match(/#token=([a-f0-9]{64})/)[1]}
test('verification email uses the canonical HTTPS site, expires, stores only hashes and consumes all outstanding tokens once',async()=>{
 const e=fixture(),messages=[];try{
 const send=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');messages.push(JSON.parse(options.body));return response({id:'accepted-message'})};
 assert.equal((await sendVerification(e,user,{request:send})).sent,true);
 const token=tokenFrom(messages[0]),row=e.sqlite.prepare('SELECT * FROM email_verification_tokens').get();assert.notEqual(row.token,token);assert.equal(row.token,await hash(token));assert.ok(row.expires>Date.now()+86300000);assert.ok(messages[0].text.includes(origin+'/verify-email#token='));assert.equal(new URL(messages[0].text.match(/https:\/\/[^\s]+/)[0]).search,'');
 await assert.rejects(sendVerification(e,user,{request:send}),e=>e.status===429);
 e.sqlite.prepare('UPDATE accounts SET email_verification_requested_at=0 WHERE id=?').run(id);await sendVerification(e,user,{request:send});assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM email_verification_tokens').get().n,2);
 assert.deepEqual(await verifyEmail(e,token),{ok:true});assert.ok(e.sqlite.prepare('SELECT email_verified_at FROM accounts').get().email_verified_at);assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM email_verification_tokens').get().n,0);
 await assert.rejects(verifyEmail(e,token),/истекла или уже использована/);await assert.rejects(verifyEmail(e,tokenFrom(messages[1])),/истекла или уже использована/);
 }finally{e.close()}
});
test('expired or malformed links cannot verify an account',async()=>{
 const e=fixture();try{let token;await sendVerification(e,user,{request:async(url,options)=>{token=tokenFrom(JSON.parse(options.body));return response({id:'accepted'})}});e.sqlite.prepare('UPDATE email_verification_tokens SET expires=0').run();await assert.rejects(verifyEmail(e,token),e=>e.status===400);await assert.rejects(verifyEmail(e,'not-a-token'),e=>e.status===400);assert.equal(e.sqlite.prepare('SELECT email_verified_at FROM accounts').get().email_verified_at,null)}finally{e.close()}
});
test('a missing or failing provider never claims a message was sent and never prevents account creation',async()=>{
 const e=fixture();try{
 const missing={...e,RESEND_API_KEY:undefined};assert.deepEqual(await sendVerification(missing,user),{sent:false,configured:false});assert.equal(e.sqlite.prepare('SELECT COUNT(*) n FROM email_verification_tokens').get().n,0);
 const original=console.error;console.error=()=>{};try{const failed=await sendVerification(e,user,{request:async()=>response({error:'failed'},403)});assert.equal(failed.sent,false);assert.equal(e.sqlite.prepare('SELECT email_verification_sent_at FROM accounts').get().email_verification_sent_at,null)}finally{console.error=original}
 const registered=await request(missing,'/auth/register',{method:'POST',body:{email:'another@example.test',password:'TestPassword123!',passwordConfirm:'TestPassword123!'}});assert.equal(registered.status,200);assert.equal((await registered.json()).verification.sent,false);
 }finally{e.close()}
});
test('resend requires a session, verification rejects cross-origin calls and confirmation never logs a user in',async()=>{
 const e=fixture();try{
 assert.equal((await request(e,'/auth/resend-verification',{method:'POST',body:{}})).status,401);
 assert.equal((await request(e,'/auth/verify-email',{method:'POST',headers:{Origin:'https://evil.test'},body:{token:'a'.repeat(64)}})).status,403);
 let token;await sendVerification(e,user,{request:async(url,options)=>{token=tokenFrom(JSON.parse(options.body));return response({id:'accepted'})}});
 const confirmed=await request(e,'/auth/verify-email',{method:'POST',body:{token}});assert.equal(confirmed.status,200);assert.equal(confirmed.headers.get('Set-Cookie'),null);assert.equal((await(await request(e,'/me')).json()).user,null);
 assert.equal((await request(e,'/auth/verify-email',{method:'POST',body:{token}})).status,400);
 }finally{e.close()}
});

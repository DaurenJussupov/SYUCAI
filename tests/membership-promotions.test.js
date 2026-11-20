import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {database} from './helpers/database.js';
import {hash} from '../worker/admin-auth.js';
import {trialPeriod} from '../shared/membership.js';
import {rankMasters} from '../shared/cities.js';
const origin='https://syucai.test',admin={Authorization:'Bearer admin-test-key'};
const owner='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000001';
const token='a'.repeat(64);
const request=(e,path,{method='GET',body,headers={}}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),e);
async function fixture(){const db=database(),e={...db,ADMIN_TOKEN:'admin-test-key',ASSETS:{fetch:async()=>new Response('assets')}};
 for(const id of [owner,other]){e.sqlite.prepare('INSERT INTO accounts(id,email,password,salt) VALUES(?,?,?,?)').run(id,id+'@example.test','hash','salt');e.sqlite.prepare("INSERT INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,status) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,id===owner?'Owner':'Other','almaty','Казахстан',43.24,76.89,'Profile for testing','Qualification','77000000000','approved')}
 await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(token),owner,Date.now()+600000).run();return e;
}
const headers={Cookie:'session='+token};
const create=async(e,days=3)=>request(e,'/promotions',{method:'POST',headers,body:{days}});
const moderate=async(e,id,action,note='')=>request(e,'/admin/promotions',{method:'POST',headers:admin,body:{id,action,note}});
test('registration requires matching confirmation, stores no confirmation and login keeps its existing contract',async()=>{
 const db=database(),e={...db,ASSETS:{fetch:async()=>new Response('assets')}};try{
 const data={email:'new-master@example.test',password:'TestPassword123!'};
 assert.equal((await request(e,'/auth/register',{method:'POST',body:data})).status,400);
 assert.equal((await request(e,'/auth/register',{method:'POST',body:{...data,passwordConfirm:'DifferentPassword!'}})).status,400);assert.equal(e.sqlite.prepare('SELECT count(*) n FROM accounts').get().n,0);
 const response=await request(e,'/auth/register',{method:'POST',body:{...data,passwordConfirm:data.password}});assert.equal(response.status,200);
 const account=e.sqlite.prepare('SELECT * FROM accounts').get();assert.notEqual(account.password,data.password);assert.equal(account.passwordConfirm,undefined);
 const loggedIn=await request(e,'/auth/login',{method:'POST',body:data});assert.equal(loggedIn.status,200);
 }finally{db.close()}
});
test('trial is three calendar months from registration, with leap-year and end-of-month clamping',()=>{
 assert.equal(trialPeriod('2026-01-31 12:30:45',new Date('2026-02-01Z')).endsAt,'2026-04-30T12:30:45.000Z');
 assert.equal(trialPeriod('2023-11-30 10:00:00').endsAt,'2024-02-29T10:00:00.000Z');
 const end='2027-02-21T01:02:03.000Z';assert.equal(trialPeriod('2026-11-21 01:02:03',new Date(end)).active,false);assert.equal(trialPeriod('2026-11-21 01:02:03',new Date('2027-02-21T01:02:02Z')).active,true);
 assert.equal(trialPeriod('invalid'),null);
});
test('promotion requests require authentication, published profiles and integer durations 1–30',async()=>{
 const e=await fixture();try{
 assert.equal((await request(e,'/promotions',{method:'POST',body:{days:1}})).status,401);
 for(const days of [0,31,1.5,'3',null])assert.equal((await create(e,days)).status,400);
 e.sqlite.prepare("UPDATE profiles SET status='pending' WHERE id=?").run(owner);assert.equal((await create(e)).status,400);
 assert.equal((await request(e,'/admin/promotions')).status,401);
 const csrf=await request(e,'/promotions',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:{days:1}});assert.equal(csrf.status,403);
 }finally{e.close()}
});
test('requests are private and duplicate requests cannot bypass moderation or choose another master',async()=>{
 const e=await fixture();try{
 const response=await request(e,'/promotions',{method:'POST',headers,body:{days:30,master_id:other,status:'active',price:0}});assert.equal(response.status,201);
 const row=e.sqlite.prepare('SELECT * FROM promotions').get();assert.equal(row.master_id,owner);assert.equal(row.status,'pending');assert.equal(row.days,30);assert.equal(row.starts_at,null);assert.equal(row.price,undefined);
 assert.equal((await create(e,1)).status,409);const listed=await(await request(e,'/promotions',{headers})).json();assert.equal(listed.promotions[0].id,row.id);
 const otherToken='b'.repeat(64);await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(otherToken),other,Date.now()+60000).run();assert.equal((await(await request(e,'/promotions',{headers:{Cookie:'session='+otherToken}})).json()).promotions.length,0);
 const masters=(await(await request(e,'/masters?city=almaty')).json()).masters;assert.equal(masters.find(m=>m.id===owner).promoted,0);
 }finally{e.close()}
});
test('only admin activation starts promotion; it expires automatically and cannot be extended by activating twice',async()=>{
 const e=await fixture();try{
 const {id}=await(await create(e,2)).json();assert.equal((await moderate(e,id,'activate')).status,200);
 const row=e.sqlite.prepare('SELECT * FROM promotions').get();assert.equal(new Date(row.ends_at.replace(' ','T')+'Z')-new Date(row.starts_at.replace(' ','T')+'Z'),2*86400000);
 assert.equal((await moderate(e,id,'activate')).status,409);assert.equal(e.sqlite.prepare('SELECT ends_at FROM promotions').get().ends_at,row.ends_at);
 const masters=(await(await request(e,'/masters?city=almaty')).json()).masters;assert.equal(masters[0].id,owner);assert.equal(masters[0].promoted,1);
 e.sqlite.prepare("UPDATE promotions SET ends_at=datetime('now','-1 second') WHERE id=?").run(id);
 const expiredSearch=(await(await request(e,'/masters?city=almaty')).json()).masters;assert.equal(expiredSearch.find(m=>m.id===owner).promoted,0);
 const history=await(await request(e,'/promotions',{headers})).json();assert.equal(history.promotions[0].status,'completed');assert.equal((await create(e,1)).status,201);
 }finally{e.close()}
});
test('admin may reject requests or stop active promotions; unpublished masters cannot be activated',async()=>{
 const e=await fixture();try{
 const {id}=await(await create(e)).json();e.sqlite.prepare("UPDATE profiles SET status='pending' WHERE id=?").run(owner);assert.equal((await moderate(e,id,'activate')).status,400);
 assert.equal((await moderate(e,id,'reject','Уточните условия')).status,200);assert.equal((await(await request(e,'/promotions',{headers})).json()).promotions[0].moderation_note,'Уточните условия');
 e.sqlite.prepare("UPDATE profiles SET status='approved' WHERE id=?").run(owner);const next=await(await create(e)).json();await moderate(e,next.id,'activate');assert.equal((await moderate(e,next.id,'cancel')).status,200);
 assert.equal((await create(e)).status,201);assert.equal(e.sqlite.prepare("SELECT count(*) n FROM admin_audit WHERE action LIKE 'promotion_%'").get().n,3);
 }finally{e.close()}
});
test('promotions preserve country filtering and proximity, prioritizing masters within the same city',()=>{
 const city={country:'KZ',lat:43,lon:76};const ranked=rankMasters([{id:'a',country:'KZ',lat:43,lon:76,promoted:0},{id:'b',country:'KZ',lat:43,lon:76,promoted:1},{id:'c',country:'KZ',lat:50,lon:70,promoted:1},{id:'d',country:'Other',lat:43,lon:76,promoted:1}],city);
 assert.deepEqual(ranked.map(m=>m.id),['b','a','c']);
});

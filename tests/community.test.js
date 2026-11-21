import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {database} from './helpers/database.js';
import {hash} from '../worker/admin-auth.js';
const origin='https://syucai.test',master='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002',moderator='00000000-0000-4000-8000-000000000003',outsider='00000000-0000-4000-8000-000000000004';
const tokens={master:'a'.repeat(64),member:'b'.repeat(64),moderator:'c'.repeat(64),outsider:'d'.repeat(64)};
const request=(e,path,{method='GET',body,as,admin=false}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{...(method==='GET'?{}:{Origin:origin}),...(body instanceof FormData?{}:body?{'Content-Type':'application/json'}:{}),...(as?{Cookie:'session='+tokens[as]}:{}),...(admin?{Authorization:'Bearer admin-test-key'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),e);
async function fixture(){
 const db=database(),objects=new Map(),e={...db,objects,ADMIN_TOKEN:'admin-test-key',ASSETS:{fetch:async()=>new Response('assets')},FILES:{put:async(key,bytes)=>objects.set(key,bytes),get:async key=>objects.has(key)?{body:objects.get(key)}:null,delete:async key=>objects.delete(key)}};
 for(const [id,key] of [[master,'master'],[member,'member'],[moderator,'moderator'],[outsider,'outsider']]){
  e.sqlite.prepare("INSERT INTO accounts(id,email,password,salt,display_name,role,registration_type,email_verified_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").run(id,key+'@example.test','hash','salt',key,key==='moderator'?'moderator':'user',key==='master'?'master':'user');
  await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(tokens[key]),id,Date.now()+600000).run();
 }
 e.sqlite.prepare("INSERT INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,status) VALUES(?,?,?,?,?,?,?,?,?,'approved')").run(master,'Master','almaty','Казахстан',43.2,76.9,'Biography','Diploma','77000000000');return e;
}
function reviewForm({evidence=true,rating=4}={}){const form=new FormData();form.set('author','Member');form.set('rating',String(rating));form.set('text','This is my detailed experience of a consultation with this master.');if(evidence)form.set('evidence',new File(['%PDF-1.4\nConsultation receipt\n%%EOF'],'receipt.pdf',{type:'application/pdf'}));return form}
test('member registration stores a name and explicit newsletter choice, confirmation controls subscriber eligibility, and users cannot grant roles',async()=>{
 const e=await fixture();try{
 const registration={registrationType:'user',name:'New User',email:'new@example.test',password:'TestPassword123!',passwordConfirm:'TestPassword123!',newsletter:true,role:'moderator'};
 assert.equal((await request(e,'/auth/register',{method:'POST',body:{...registration,name:''}})).status,400);
 assert.equal((await request(e,'/auth/register',{method:'POST',body:registration})).status,200);
 const account=e.sqlite.prepare("SELECT * FROM accounts WHERE email='new@example.test'").get();assert.equal(account.role,'user');assert.equal(account.registration_type,'user');assert.ok(!(await(await request(e,'/admin/applications',{admin:true})).json()).applications.some(a=>a.id===account.id));assert.equal(account.display_name,'New User');assert.equal(account.newsletter_opt_in,1);assert.ok(account.newsletter_consent_at);assert.equal(account.email_verified_at,null);
 assert.equal((await(await request(e,'/admin/subscribers',{admin:true})).json()).subscribers.length,0);
 e.sqlite.prepare('UPDATE accounts SET email_verified_at=CURRENT_TIMESTAMP WHERE id=?').run(account.id);
 assert.equal((await(await request(e,'/admin/subscribers',{admin:true})).json()).subscribers[0].email,'new@example.test');
 const prefs=await request(e,'/member/preferences',{method:'PUT',as:'member',body:{name:'Updated Member',newsletter:true,role:'moderator'}});assert.equal(prefs.status,200);assert.equal(e.sqlite.prepare("SELECT role FROM account_registrations WHERE account_id=? AND registration_type='user'").get(member).role,'user');
 await request(e,'/member/preferences',{method:'PUT',as:'member',body:{name:'Updated Member',newsletter:false}});assert.equal(e.sqlite.prepare("SELECT newsletter_opt_in FROM account_registrations WHERE account_id=? AND registration_type='user'").get(member).newsletter_opt_in,0);
 }finally{e.close()}
});
test('email, documentary proof and explicit moderator confirmation are required before a review can affect the public rating',async()=>{
 const e=await fixture();try{
 e.sqlite.prepare('UPDATE accounts SET email_verified_at=NULL WHERE id=?').run(member);
 assert.equal((await request(e,`/masters/${master}/reviews`,{method:'POST',as:'member',body:reviewForm()})).status,403);
 e.sqlite.prepare('UPDATE accounts SET email_verified_at=CURRENT_TIMESTAMP WHERE id=?').run(member);
 assert.equal((await request(e,`/masters/${master}/reviews`,{method:'POST',as:'member',body:reviewForm({evidence:false})})).status,400);
 const response=await request(e,`/masters/${master}/reviews`,{method:'POST',as:'member',body:reviewForm()});assert.equal(response.status,201);const {id}=await response.json();
 const evidence=e.sqlite.prepare('SELECT * FROM review_evidence WHERE review_id=?').get(id);assert.equal((await(await request(e,'/masters/'+master)).json()).review_count,0);
 assert.equal((await request(e,'/moderator/reviews',{method:'POST',as:'moderator',body:{id,status:'approved',evidence_id:evidence.id}})).status,400);
 assert.equal((await request(e,'/moderator/reviews',{method:'POST',as:'moderator',body:{id,status:'approved',consultation_confirmed:true,evidence_id:'stale'}})).status,400);
 assert.equal((await request(e,'/moderator/reviews',{method:'POST',as:'moderator',body:{id,status:'approved',consultation_confirmed:true,evidence_id:evidence.id}})).status,200);
 const publicData=await(await request(e,'/masters/'+master)).json();assert.equal(publicData.review_count,1);assert.equal(publicData.rating,4);assert.equal(publicData.reviews[0].text,'This is my detailed experience of a consultation with this master.');assert.equal(publicData.reviews[0].evidence_id,undefined);
 assert.equal((await request(e,'/review-evidence/'+evidence.id)).status,401);assert.equal((await request(e,'/review-evidence/'+evidence.id,{as:'master'})).status,401);assert.equal((await request(e,'/review-evidence/'+evidence.id,{as:'outsider'})).status,403);
 for(const options of [{as:'member'},{as:'moderator'},{admin:true}])assert.equal((await request(e,'/review-evidence/'+evidence.id,options)).status,200);
 assert.equal((await request(e,'/reviews/'+id,{method:'PUT',as:'outsider',body:reviewForm()})).status,404);
 assert.equal((await request(e,'/reviews/'+id,{method:'PUT',as:'member',body:reviewForm({rating:5})})).status,200);assert.equal(e.objects.has(evidence.object_key),false);assert.equal((await(await request(e,'/masters/'+master)).json()).review_count,0);
 assert.equal((await request(e,`/masters/${master}/reviews`,{method:'POST',as:'master',body:reviewForm()})).status,401);
 }finally{e.close()}
});
test('moderator access is limited, revoked immediately, and never opens owner administration or diploma files',async()=>{
 const e=await fixture();try{
 assert.equal((await request(e,'/moderator/session',{as:'member'})).status,403);assert.equal((await request(e,'/moderator/session',{as:'moderator'})).status,200);
 for(const path of ['/admin/applications','/admin/settings','/admin/stats','/admin/moderators','/admin/subscribers','/admin/promotions'])assert.equal((await request(e,path,{as:'moderator'})).status,401);
 e.sqlite.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run('diploma',master,'document','private-diploma','application/pdf','diploma.pdf');assert.equal((await request(e,'/files/diploma',{as:'moderator'})).status,401);
 assert.equal((await request(e,'/admin/moderators',{method:'POST',as:'moderator',body:{id:outsider,role:'moderator'}})).status,401);
 assert.equal((await request(e,'/admin/moderators',{method:'POST',admin:true,body:{id:moderator,role:'user'}})).status,200);assert.equal((await request(e,'/moderator/reviews',{as:'moderator'})).status,403);
 }finally{e.close()}
});
test('moderators write and publish their own blog news; drafts stay private and other authors cannot be edited',async()=>{
 const e=await fixture();try{
 const post={title:'SYUCAI news',excerpt:'Short introduction',content:'This is a full piece of news for the SYUCAI blog.',status:'draft'};
 assert.equal((await request(e,'/moderator/posts',{method:'POST',as:'member',body:post})).status,403);
 const response=await request(e,'/moderator/posts',{method:'POST',as:'moderator',body:post});assert.equal(response.status,200);const saved=await response.json();assert.equal((await(await request(e,'/blog')).json()).posts.length,0);assert.equal((await request(e,'/blog/'+saved.slug)).status,404);
 assert.equal((await request(e,'/moderator/posts',{method:'POST',as:'moderator',body:{...post,id:saved.id,status:'published'}})).status,200);assert.equal((await(await request(e,'/blog')).json()).posts.length,1);assert.equal((await(await request(e,'/blog/'+saved.slug)).json()).content,post.content);
 const owned=await(await request(e,'/moderator/posts',{method:'POST',admin:true,body:{...post,title:'Owner draft'}})).json();assert.equal((await request(e,'/moderator/posts',{method:'POST',as:'moderator',body:{...post,id:owned.id}})).status,403);assert.equal((await(await request(e,'/moderator/posts',{as:'moderator'})).json()).posts.length,1);
 }finally{e.close()}
});
test('legacy reviews remain stored but do not enter ratings without documentary verification',async()=>{
 const e=await fixture();try{e.sqlite.prepare("INSERT INTO reviews(id,master_id,author_id,author,rating,text,status) VALUES('legacy',?,?,?,?,?,'approved')").run(master,member,'Legacy member',5,'Original historical review');const result=await(await request(e,'/masters/'+master)).json();assert.equal(result.review_count,0);assert.equal(result.review_preview,null);assert.equal(e.sqlite.prepare("SELECT text FROM reviews WHERE id='legacy'").get().text,'Original historical review');assert.equal((await request(e,'/admin/reviews',{method:'POST',admin:true,body:{id:'legacy',status:'approved',consultation_confirmed:true}})).status,400)}finally{e.close()}
});

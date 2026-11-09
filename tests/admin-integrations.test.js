import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {database} from './helpers/database.js';
import {seal,unseal,connectGoogle,googleCallback,createResources,syncAccount,processSync,sheetSafe,createAnalytics} from '../worker/google.js';
import {getSetting,setSetting,enqueue,hash} from '../worker/admin-auth.js';
const origin='https://syucai.test';
const userId='00000000-0000-4000-8000-000000000001',reviewer='00000000-0000-4000-8000-000000000002';
function fixture(){const db=database();const e={...db,ADMIN_TOKEN:'a-secure-test-key',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-client-secret',FILES:{get:async()=>({arrayBuffer:async()=>new TextEncoder().encode('file bytes').buffer})},ASSETS:{fetch:async()=>new Response('assets')}};return e}
const request=(e,path,{method='GET',body,headers={}}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),e);
const admin={Authorization:'Bearer a-secure-test-key'};
function account(e,id=userId){e.sqlite.prepare('INSERT INTO accounts(id,email,password,salt) VALUES(?,?,?,?)').run(id,id+'@example.test','hash','salt')}
function profile(e){account(e);e.sqlite.prepare("INSERT INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,photo,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(userId,'Example Master','almaty','Казахстан',43.2,76.9,'A sufficiently long biography for testing.','Diploma','77000000000','photo','approved');for(const kind of ['photo','document'])e.sqlite.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run(kind,userId,kind,kind+'-key',kind==='photo'?'image/png':'application/pdf',kind+'.pdf')}
const googleReady=async e=>{await setSetting(e,'google_tokens',await seal(e,{access_token:'fake-access',refresh_token:'fake-refresh',expires:Date.now()+3600000}));await setSetting(e,'google_folder_id','folder');await setSetting(e,'google_sheet_id','sheet')};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('additive migration preserves previous profiles, files and published reviews',()=>{
 const e=database({migrate:false});profile(e);account(e,reviewer);e.sqlite.prepare('INSERT INTO reviews(id,master_id,author_id,author,rating,text) VALUES(?,?,?,?,?,?)').run('review',userId,reviewer,'Reviewer',5,'Original review');
 e.sqlite.exec(readFileSync('migrations/0002_admin_integrations.sql','utf8'));assert.equal(e.sqlite.prepare('SELECT status FROM profiles').get().status,'approved');assert.equal(e.sqlite.prepare('SELECT count(*) n FROM files').get().n,2);assert.equal(e.sqlite.prepare('SELECT status FROM reviews').get().status,'approved');e.close();
});
test('admin sessions use HttpOnly cookies, reject CSRF and are revoked by secret rotation',async()=>{
 const e=fixture();try{
 assert.equal((await request(e,'/admin/applications')).status,401);
 assert.equal((await request(e,'/admin/login',{method:'POST',body:{token:'wrong'}})).status,401);
 assert.equal((await request(e,'/admin/login',{method:'POST',body:{token:e.ADMIN_TOKEN},headers:{Origin:'https://evil.test'}})).status,403);
 const result=await request(e,'/admin/login',{method:'POST',body:{token:e.ADMIN_TOKEN}}),cookie=result.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly; SameSite=Lax/);assert.match(cookie,/Secure/);assert.equal((await result.json()).ok,true);
 const headers={Cookie:cookie.split(';')[0]};assert.equal((await request(e,'/admin/applications',{headers})).status,200);
 assert.equal((await request({...e,ADMIN_TOKEN:'rotated'},'/admin/applications',{headers})).status,401);
 const settings=await (await request(e,'/admin/settings',{headers})).text();assert.ok(!settings.includes(e.GOOGLE_CLIENT_SECRET));assert.ok(!settings.includes(e.ADMIN_TOKEN));
 await request(e,'/admin/logout',{method:'POST',headers,body:{}});assert.equal((await request(e,'/admin/applications',{headers})).status,401);
 }finally{e.close()}
});
test('unfinished drafts and files are visible to admin but private to visitors',async()=>{
 const e=fixture();try{account(e);await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash('f'.repeat(64)),userId,Date.now()+60000).run();const headers={Cookie:'session='+'f'.repeat(64)};
 const save=await request(e,'/profile/draft',{method:'PUT',headers,body:{name:'Anara',city_id:'almaty',bio:'Partial profile',password:'never-store-this'}});assert.equal(save.status,200);
 e.sqlite.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run('private-document',userId,'document','private','application/pdf','diploma.pdf');
 const data=await(await request(e,'/admin/applications',{headers:admin})).json();assert.equal(data.applications[0].status,'not_submitted');assert.equal(data.applications[0].draft.name,'Anara');assert.equal(data.applications[0].draft.password,undefined);assert.equal(data.applications[0].files.length,1);
 assert.equal((await request(e,'/files/private-document')).status,401);assert.equal((await request(e,'/files/private-document',{headers:admin})).status,200);
 assert.equal((await(await request(e,'/masters?city=almaty')).json()).masters.length,0);
 }finally{e.close()}
});
test('pending reviews cannot affect public ratings; moderation changes the average',async()=>{
 const e=fixture();try{profile(e);account(e,reviewer);const token='e'.repeat(64);await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(token),reviewer,Date.now()+60000).run();
 const result=await request(e,`/masters/${userId}/reviews`,{method:'POST',headers:{Cookie:'session='+token},body:{author:'Reviewer',rating:4,text:'This is a complete review about a consultation.'}});assert.equal(result.status,201);
 let publicData=await(await request(e,'/masters/'+userId)).json();assert.equal(publicData.review_count,0);assert.equal(publicData.reviews.length,0);
 const id=e.sqlite.prepare('SELECT id FROM reviews').get().id;
 await request(e,'/admin/reviews',{method:'POST',headers:admin,body:{id,status:'approved'}});publicData=await(await request(e,'/masters/'+userId)).json();assert.equal(publicData.rating,4);assert.equal(publicData.review_count,1);
 await request(e,'/admin/reviews',{method:'POST',headers:admin,body:{id,status:'rejected'}});publicData=await(await request(e,'/masters/'+userId)).json();assert.equal(publicData.review_count,0);
 }finally{e.close()}
});
test('analytics validates consent, excludes form values and restricts dashboard access',async()=>{
 const e=fixture();try{
 const data={event:'page_view',path:'/results',session:crypto.randomUUID(),consent:true,language:'en',name:'SECRET NAME',date:'07.09.1975',message:'PRIVATE',referrer:'https://example.test/secret?q=private',source:'newsletter',duration:999999};
 assert.equal((await request(e,'/events',{method:'POST',body:{...data,consent:false}})).status,400);
 assert.equal((await request(e,'/events',{method:'POST',body:{...data,path:'/admin'}})).status,400);
 assert.equal((await request(e,'/events',{method:'POST',body:{...data,path:'/results?birth=private'}})).status,400);
 assert.equal((await request(e,'/events',{method:'POST',body:data})).status,202);const record=e.sqlite.prepare('SELECT * FROM analytics_events').get();assert.equal(record.referrer,'example.test');assert.equal(record.duration,1800);assert.ok(!JSON.stringify(record).includes('PRIVATE'));assert.ok(!JSON.stringify(record).includes('1975'));
 assert.equal((await request(e,'/admin/stats')).status,401);const stats=await(await request(e,'/admin/stats',{headers:admin})).json();assert.equal(stats.events[0].events,1);assert.equal(stats.pages[0].path,'/results');
 }finally{e.close()}
});
test('Google tokens are authenticated-encrypted; OAuth states are single-use and session-bound',async()=>{
 const e=fixture();const original=globalThis.fetch;try{const value=await seal(e,{refresh_token:'sensitive-refresh'});assert.ok(!value.includes('sensitive-refresh'));assert.equal((await unseal(e,value)).refresh_token,'sensitive-refresh');await assert.rejects(unseal({...e,ADMIN_TOKEN:'wrong'},value));
 const cookie='b'.repeat(64),req=new Request(origin+'/api/admin/google/connect',{headers:{Cookie:'admin_session='+cookie}}),url=new URL(await connectGoogle(req,e));assert.equal(url.origin,'https://accounts.google.com');assert.ok(url.searchParams.get('scope').includes('drive.file'));assert.ok(url.searchParams.get('scope').includes('analytics.edit'));
 globalThis.fetch=async()=>response({access_token:'access',refresh_token:'refresh',expires_in:3600});
 const callback=origin+'/api/admin/google/callback?code=code&state='+url.searchParams.get('state');await assert.rejects(googleCallback(new Request(callback,{headers:{Cookie:'admin_session='+'c'.repeat(64)}}),e));
 await googleCallback(new Request(callback,{headers:{Cookie:'admin_session='+cookie}}),e);await assert.rejects(googleCallback(new Request(callback,{headers:{Cookie:'admin_session='+cookie}}),e));assert.ok(!(await getSetting(e,'google_tokens')).includes('refresh_token'));
 }finally{globalThis.fetch=original;e.close()}
});
test('resource creation is reusable and never grants public access',async()=>{
 const e=fixture(),original=globalThis.fetch;try{await googleReady(e);await e.DB.prepare("DELETE FROM site_settings WHERE key IN ('google_folder_id','google_sheet_id')").run();const calls=[];
 globalThis.fetch=async(url,opts={})=>{calls.push([String(url),opts]);if(opts.method==='POST'){const b=JSON.parse(opts.body);return response({id:b.mimeType.includes('folder')?'new-folder':'new-sheet'})}if(opts.method==='PUT')return response({});return response({files:[]})};
 assert.deepEqual(await createResources(e),{folder:'new-folder',sheet:'new-sheet'});await createResources(e);assert.equal(calls.filter(c=>c[1].method==='POST').length,2);assert.ok(calls.every(c=>!c[0].includes('permissions')));
 }finally{globalThis.fetch=original;e.close()}
});
test('Google sync recovers an interrupted upload without duplicating files, updates sorted rows, and retries safely',async()=>{
 const e=fixture(),original=globalThis.fetch;try{profile(e);await googleReady(e);const uploads=new Set(),writes=[];let generated=0,fail=true;
 globalThis.fetch=async(url,opts={})=>{url=String(url);
  if(url.includes('generateIds'))return response({ids:['drive-'+(++generated)]});
  if(url.includes('upload/drive')){assert.match(opts.headers['Content-Type'],/multipart\/related/);const body=await opts.body.text();const id=body.match(/"id":"([^"]+)"/)[1];assert.ok(!uploads.has(id));uploads.add(id);if(fail){fail=false;throw Error('network interruption after upload')}return response({id})}
  if(url.includes('/drive/v3/files/drive-'))return uploads.has(url.match(/files\/([^?]+)/)[1])?response({id:'exists'}):response({},404);
  if(url.endsWith('/values/A:A'))return response({values:[['ID'],['some-other-master'],[userId]]});
  if(opts.method==='PUT'){writes.push([url,JSON.parse(opts.body)]);return response({})}
  throw Error('Unexpected Google API request: '+url);
 };
 await enqueue(e,userId);const first=await processSync(e,1);assert.equal(first.succeeded,0);assert.equal(e.sqlite.prepare('SELECT status FROM sync_jobs').get().status,'error');
 const second=await processSync(e,1);assert.equal(second.succeeded,1);assert.equal(uploads.size,2);assert.equal(generated,2);assert.ok(writes[0][0].includes('/values/A3:L3'));assert.equal(writes[0][1].values[0][0],userId);
 e.sqlite.prepare("DELETE FROM files WHERE id='photo'").run();assert.equal(e.sqlite.prepare("SELECT COUNT(*) n FROM google_file_links WHERE file_id='photo'").get().n,0);
 assert.equal(sheetSafe('=IMPORTXML("bad")'),'\'=IMPORTXML("bad")');
 }finally{globalThis.fetch=original;e.close()}
});
test('GA4 provisioning reuses the property and stream and disables automatic form tracking',async()=>{
 const e=fixture(),original=globalThis.fetch;try{await googleReady(e);const calls=[];let streamCreated=false;globalThis.fetch=async(url,opts={})=>{url=String(url);calls.push([url,opts]);if(url.endsWith('/properties')&&opts.method==='POST')return response({name:'properties/12345'});if(url.endsWith('/dataStreams')&&opts.method==='POST'){streamCreated=true;return response({name:'properties/12345/dataStreams/678',type:'WEB_DATA_STREAM',webStreamData:{measurementId:'G-ABCDE12345',defaultUri:origin}})}if(url.endsWith('/dataStreams'))return response({dataStreams:streamCreated?[{name:'properties/12345/dataStreams/678',webStreamData:{measurementId:'G-ABCDE12345',defaultUri:origin}}]:[]});return response({})};
 const data=await createAnalytics(e,{account:'accounts/111',timeZone:'Asia/Almaty',siteUrl:origin});assert.equal(data.measurementId,'G-ABCDE12345');await createAnalytics(e,{account:'accounts/111',timeZone:'Asia/Almaty',siteUrl:origin});assert.equal(calls.filter(c=>c[1].method==='POST').length,2);assert.ok(calls.some(c=>c[1].method==='PATCH'&&JSON.parse(c[1].body).streamEnabled===false));
 }finally{globalThis.fetch=original;e.close()}
});

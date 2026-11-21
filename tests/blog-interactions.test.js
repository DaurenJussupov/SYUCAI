import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {database} from './helpers/database.js';
import {hash} from '../worker/admin-auth.js';
import {commentBlockEnd} from '../worker/blog-community.js';
const origin='https://syucai.test',id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),post=id(10),slug='news-'+post;
async function fixture(){const e={...database(),ADMIN_TOKEN:'admin',objects:new Map(),ASSETS:{fetch:async()=>new Response('assets')}};e.FILES={put:async(k,b)=>e.objects.set(k,b),get:async k=>e.objects.has(k)?{body:e.objects.get(k)}:null,delete:async k=>e.objects.delete(k)};for(const n of [1,2,3]){e.sqlite.prepare("INSERT INTO accounts(id,email,password,salt,registration_type,display_name,role,email_verified_at) VALUES(?,?,'hash','salt','user',?,?,CURRENT_TIMESTAMP)").run(id(n),n+'@example.test','User '+n,n===2?'moderator':'user');await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(String(n).repeat(64)),id(n),Date.now()+600000).run()}e.sqlite.prepare("INSERT INTO blog_posts(id,slug,title,content,status,author_id,published_at) VALUES(?,?,'Article','Article body','published',?,CURRENT_TIMESTAMP)").run(post,slug,id(2));return e}
const request=(e,path,{as=1,admin=false,method='GET',body}={})=>worker.fetch(new Request(origin+'/api'+path,{method,headers:{...(as?{Cookie:'session='+String(as).repeat(64)}:{}),...(admin?{Authorization:'Bearer admin'}:{}),...(method==='GET'?{}:{Origin:origin}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}),e);
test('likes are one per user; comments are immediate, escaped by the client, counted and deletable only by moderation',async()=>{
 const e=await fixture();try{
 const like='/blog/'+slug+'/like',comments='/blog/'+slug+'/comments';assert.equal((await request(e,like,{as:0,method:'POST',body:{liked:true}})).status,401);for(let n=0;n<2;n++)assert.equal((await request(e,like,{method:'POST',body:{liked:true}})).status,200);assert.equal((await(await request(e,'/blog/'+slug)).json()).likes_count,1);await request(e,like,{method:'POST',body:{liked:false}});assert.equal((await(await request(e,'/blog/'+slug)).json()).likes_count,0);
 const created=await request(e,comments,{method:'POST',body:{text:'<script>literal content</script>'}});assert.equal(created.status,201);const comment=(await created.json()).id;
 const state=await(await request(e,comments,{as:0})).json();assert.equal(state.total,1);assert.equal(state.comments[0].text,'<script>literal content</script>');assert.equal(state.comments[0].account_id,undefined);assert.equal((await(await request(e,'/blog')).json()).posts[0].comments_count,1);
 assert.equal((await request(e,'/moderator/comments/'+comment,{method:'DELETE'})).status,403);assert.equal((await request(e,'/moderator/comments/'+comment,{as:2,method:'DELETE'})).status,200);assert.equal((await(await request(e,comments,{as:0})).json()).total,0);assert.ok(e.sqlite.prepare('SELECT deleted_at FROM blog_comments').get().deleted_at);
 }finally{e.close()}
});
test('finite and indefinite blocks stop only comments, expire and can be lifted; zero days are rejected even with months',async()=>{
 const e=await fixture();try{
 const path='/moderator/comment-blocks',data={account_id:id(1),action:'block',indefinite:false,months:0,days:1};
 for(const invalid of [{months:0,days:0},{months:12,days:0},{months:13,days:1},{months:-1,days:1},{months:0,days:1.5}])assert.equal((await request(e,path,{as:2,method:'POST',body:{...data,...invalid}})).status,400);
 assert.equal((await request(e,path,{method:'POST',body:data})).status,403);assert.equal((await request(e,path,{as:2,method:'POST',body:data})).status,200);assert.equal((await request(e,'/blog/'+slug+'/comments',{method:'POST',body:{text:'Blocked'}})).status,403);assert.equal((await request(e,'/blog/'+slug+'/like',{method:'POST',body:{liked:true}})).status,200);
 e.sqlite.prepare("UPDATE comment_blocks SET blocked_until=datetime('now','-1 second')").run();assert.equal((await request(e,'/blog/'+slug+'/comments',{method:'POST',body:{text:'Allowed after expiry'}})).status,201);
 assert.equal((await request(e,path,{as:2,method:'POST',body:{...data,indefinite:true,months:0,days:0}})).status,200);assert.equal((await(await request(e,'/blog/'+slug+'/comments')).json()).block.indefinite,true);assert.equal((await request(e,'/blog/'+slug+'/comments',{method:'POST',body:{text:'Blocked indefinitely'}})).status,403);await request(e,path,{as:2,method:'POST',body:{account_id:id(1),action:'unblock'}});assert.equal((await request(e,'/blog/'+slug+'/comments',{method:'POST',body:{text:'Allowed again'}})).status,201);
 assert.equal(commentBlockEnd(1,1,new Date('2027-01-31T12:00:00Z')),'2027-03-01 12:00:00');assert.equal(commentBlockEnd(0,1,new Date('2028-02-28T12:00:00Z')),'2028-02-29 12:00:00');
 }finally{e.close()}
});
test('article images are optional, limited to the author or administrator and hidden with drafts',async()=>{
 const e=await fixture();try{
 const image=new FormData();image.set('image',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'cover.png',{type:'image/png'}));const path='/moderator/posts/'+post+'/image';assert.equal((await request(e,path,{method:'POST',body:image})).status,403);const uploaded=await request(e,path,{as:2,method:'POST',body:image});assert.equal(uploaded.status,201);const imageId=(await uploaded.json()).id;assert.equal((await request(e,'/blog-images/'+imageId,{as:0})).status,200);assert.equal((await(await request(e,'/blog/'+slug)).json()).image_id,imageId);
 e.sqlite.prepare("UPDATE blog_posts SET status='draft'").run();assert.notEqual((await request(e,'/blog-images/'+imageId,{as:0})).status,200);assert.equal((await request(e,'/blog-images/'+imageId,{as:2})).status,200);assert.equal((await request(e,'/blog/'+slug+'/comments',{method:'POST',body:{text:'Draft comment'}})).status,404);assert.equal((await request(e,path,{as:2,method:'DELETE'})).status,200);assert.equal(e.objects.size,0);
 }finally{e.close()}
});

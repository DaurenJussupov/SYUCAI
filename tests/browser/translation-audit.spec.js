import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {languages} from '../../src/i18n/languages.js';
import source from '../../src/i18n/source.json' with {type:'json'};
import {localePath} from '../../shared/site-routing.js';
import {blogSources,blogTranslationMessages} from '../../shared/blog-translations.js';
const masterId='00000000-0000-4000-8000-000000009001',memberId='00000000-0000-4000-8000-000000009002';
const profile={id:masterId,status:'approved',name:'Audit Master',city_id:'berlin',city_name:'Berlin',country_code:'DE',country:'Germany',photo:'audit-photo',phone:'491234567890',credentials:'Public qualification',bio:'Public professional biography for the local translation audit.',updated_at:'2026-11-27 08:00:00',rating:0,review_count:0,reviews:[]};
const reportDir='/tmp/syucai-language-audit';
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
test.beforeAll(()=>{
 const state=process.env.SYUCAI_E2E_STATE;expect(state).toMatch(/test-state-/);
 const sql=[`INSERT OR IGNORE INTO accounts(id,email,password,salt,display_name) VALUES('${masterId}','audit-master@example.test','hash','salt','Audit');`,`INSERT OR IGNORE INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,photo,status,city_name,country_code) VALUES('${masterId}','Audit Master','berlin','Germany',52,13,'Public biography','Qualification','491234567890','audit-photo','approved','Berlin','DE');`,...blogSources.map(post=>`UPDATE blog_posts SET title=${quote(post.title)},excerpt=${quote(post.excerpt)},content=${quote(post.content)} WHERE slug=${quote(post.slug)};`)].join('\n');
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','syucai','--local','--persist-to',state,'--command',sql],{encoding:'utf8',env:process.env});mkdirSync(reportDir,{recursive:true});
});
for(const language of languages.filter(item=>!process.env.SYUCAI_AUDIT_LANGUAGES||process.env.SYUCAI_AUDIT_LANGUAGES.split(',').includes(item.code)))test('actual translated pages, calendar periods and full articles: '+language.code,async({page})=>{
 test.setTimeout(180000);const code=language.code,dictionary=code==='ru'?{}:JSON.parse(readFileSync('dist/i18n/'+code+'.json','utf8')).translations,issues=[],visited=[],errors=[];let signedIn=false;
 page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:390,height:844});await page.addInitScript(code=>{localStorage.setItem('syucai.language',code);localStorage.setItem('syucai-analytics-consent','no')},code);
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let data;
  if(path==='/api/me'){
   const type=request.headers()['x-account-type']==='master'?'master':'user',user={id:type==='master'?masterId:memberId,email:'audit@example.test',display_name:'Audit',last_name:'Master',registration_type:type,role:type==='user'?'moderator':'user',email_verified_at:'2026-11-27 08:00:00',newsletter_opt_in:0,created_at:'2026-11-01 08:00:00'};
   data=signedIn?{user,files:[],profile:type==='master'?profile:null,promotions:[],trial:{active:true,endsAt:'2027-02-01T08:00:00Z'}}:{user:null};
  }else if(path==='/api/masters/'+masterId)data=profile;
  else if(path==='/api/files/audit-photo'){await route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=','base64')});return}
  else if(path==='/api/profile/stats')data={metrics:{views:0,contacts:0},reviews:{rating:null,count:0,latest:[]},support:{open:0,unread:0}};
  else if(path==='/api/member/reviews')data={reviews:[]};
  else if(path==='/api/support')data={tickets:[],total:0,counts:[],nextOffset:null};
  else if(path==='/api/moderator/session')data={ok:true,admin:false};
  else if(/\/api\/(?:admin|moderator)\/applications$/.test(path))data={applications:[],counts:{},total:0};
  else if(path==='/api/admin/session')data={authenticated:true,configured:true};
  else if(/\/api\/(?:admin|moderator)\/reviews$/.test(path))data={reviews:[]};
  else if(path==='/api/moderator/posts')data={posts:[]};
  else if(path==='/api/moderator/comments')data={comments:[],total:0};
  else if(path==='/api/moderator/comment-blocks')data={blocks:[]};
  else if(path==='/api/admin/promotions')data={promotions:[]};
  else if(path==='/api/admin/moderators')data={accounts:[]};
  else if(path==='/api/admin/subscribers')data={subscribers:[]};
  else if(path==='/api/admin/support')data={tickets:[],total:0,counts:[],nextOffset:null};
  else if(path==='/api/admin/audit')data={audit:[]};
  if(data!==undefined)await route.fulfill({json:data});else await route.continue();
 });
 async function audit(label){
  await expect(page.locator('html')).toHaveAttribute('lang',code);await expect(page.locator('main')).toBeVisible();
  const result=await page.evaluate(({strings,dictionary,code})=>{
   const skipped='script,style,code,pre,[data-i18n-skip],.preline,.review p,.review b',messages=new Set(strings),found=[];
   const check=(value,kind)=>{const key=value.trim();if(code!=='ru'&&messages.has(key)&&dictionary[key]&&dictionary[key]!==key)found.push({kind,key})};
   const walker=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement.closest(skipped))check(node.nodeValue,'text')}
   for(const el of document.querySelectorAll('main [placeholder],main [aria-label],main [title]'))if(!el.closest('[data-i18n-skip]'))for(const attr of ['placeholder','aria-label','title'])if(el.hasAttribute(attr))check(el.getAttribute(attr),attr);
   return {found,overflow:document.documentElement.scrollWidth>innerWidth+1};
  },{strings:source.strings,dictionary,code});
  issues.push(...result.found.map(value=>({path:label,...value})));if(result.overflow)issues.push({path:label,kind:'overflow'});visited.push(label);
 }
 async function open(path,ready){await page.goto(localePath(path,code));if(ready)await page.locator(ready).waitFor();await audit(path)}
 await open('/','#calculator');await page.locator('#birth').fill('24091987');await page.locator('#name').fill('Anna');await page.locator('#calculator button[type=submit]').click();await page.locator('[data-day-value=month]').waitFor();await audit('/results');expect(await page.locator('[data-day-value]').evaluateAll(nodes=>nodes.map(node=>node.dataset.dayValue))).toEqual(['personal','general','year','month']);await expect(page.locator('[data-calendar-result], #calendar-panel')).toHaveCount(0);
 await open('/calendar','#calendar-birth');await page.locator('#calendar-birth').fill('24091987');await page.locator('[data-calendar-result=month]').waitFor();await audit('/calendar:filled');
 for(const path of ['/about','/guide','/privacy','/masters','/blog'])await open(path,path==='/blog'?'.blog-list':'main h1');
 for(const post of blogSources){await open('/blog/'+post.slug,'.blog-content');const body=(await page.locator('.blog-content').innerText()).replace(/\s+/g,' ');for(const message of blogTranslationMessages(post).filter(key=>key!==post.title&&key!==post.excerpt)){const expected=code==='ru'?message.replace(/Сюцай/gi,'SYUCAI'):dictionary[message];if(!body.includes(expected.replace(/\s+/g,' ').trim()))issues.push({path:'/blog/'+post.slug,kind:'article text',key:message})}await expect(page.locator('.blog-article header h1')).toHaveText(code==='ru'?post.title.replace(/Сюцай/gi,'SYUCAI'):dictionary[post.title]);await expect(page.locator('.blog-article-layout')).toHaveAttribute('lang',code);await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://syucai.me'+localePath('/blog/'+post.slug,code));}
 await open('/masters/'+masterId,'.profile-copy');await page.locator('#contact').click();await audit('/masters/:id:contact');
 for(const path of ['/account','/cabinet']){await open(path,'#auth-form');await page.locator('#login-tab').click();await audit(path+':login');await page.locator('#forgot-password').click();await audit(path+':password-recovery')}
 signedIn=true;await open('/account','#master-application-state');await page.locator('.identity-settings summary').click();await page.locator('#promotion-toggle').click();await audit('/account:settings-and-promotion');await open('/account?edit=1','#profile-form');await open('/cabinet','#member-preferences');await open('/account/support','#support-new');await page.locator('#support-new').click();await audit('/account/support:new');
 await open('/moderator','#moderator-content');for(const tab of ['applications','reviews','posts','comments']){await page.locator('[data-moderator-tab='+tab+']').click();await page.locator('#moderator-content > :not(.loading)').first().waitFor();await audit('/moderator:'+tab)}
 await open('/admin','#admin-content');for(const tab of ['applications','reviews','promotions','moderators','blog','comments','subscribers','support','audit']){await page.locator('[data-tab='+tab+']').click();await page.locator('#admin-content > :not(.loading)').first().waitFor();await audit('/admin:'+tab)}
 issues.push(...errors.map(error=>({kind:'pageerror',key:error})));writeFileSync(reportDir+'/'+code+'.json',JSON.stringify({code,visited,issues},null,2));expect(issues).toEqual([]);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blogSources,blogTextMessages,blogSource,blogTranslationMessages,blogTranslationAvailable} from '../shared/blog-translations.js';
import {renderBlogContent} from '../src/blog-content.js';
import {handleSeo} from '../worker/seo.js';
import {database} from './helpers/database.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('blog snapshots include complete published text and stop matching after any editorial change',()=>{
 for(const post of blogSources){assert.equal(blogSource(post),post);assert.ok(blogTranslationMessages(post).length>=5);assert.equal(blogTranslationAvailable(post,'en',()=>true),true);assert.equal(blogTranslationAvailable(post,'en',()=>false),false);for(const field of ['title','excerpt','content'])assert.equal(blogSource({...post,[field]:post[field]+' changed'}),null);const {content,...preview}=post;assert.equal(blogSource({...preview,translationSource:post.slug}),post);assert.equal(blogSource(preview),null)}
});
test('article translations preserve original external URLs, block formatting and escaped HTML',()=>{
 const text='## Заголовок\n\nАбзац https://example.test/path?x=1&y=2.\n\n* Пункт один\n* Пункт два';
 assert.deepEqual(blogTextMessages(text),['Заголовок','Абзац','Пункт один','Пункт два']);
 const html=renderBlogContent(text,esc,text=>'English '+text);assert.match(html,/<h2>English Заголовок<\/h2>/);assert.match(html,/<li>English Пункт один<\/li>/);assert.match(html,/href="https:\/\/example.test\/path\?x=1&amp;y=2"/);assert.doesNotMatch(html,/href="English/);
 const unsafe=renderBlogContent('Текст',esc,()=>'<img src=x onerror=alert(1)>');assert.match(unsafe,/&lt;img/);assert.doesNotMatch(unsafe,/<img/);
});
test('translated articles have matching server HTML, language metadata, canonical URLs and sitemap entries; changed text falls back safely',async()=>{
 const e=database(),post=blogSources[0],keys=blogTranslationMessages(post),dictionary=Object.fromEntries(keys.map((key,i)=>[key,'Translated article '+i]));
 e.ASSETS={fetch:async request=>{const path=new URL(request.url).pathname;if(path==='/index.html')return new Response(readFileSync('index.html','utf8'));if(path==='/i18n/manifest.json')return Response.json({languages:{ru:{status:'ready'},en:{status:'ready',seoReady:{['/blog/'+post.slug]:true}}}});if(path==='/i18n/en.json')return Response.json({translations:dictionary});return new Response('asset')}};
 try{
  e.sqlite.prepare("INSERT INTO blog_posts(id,slug,title,excerpt,content,status,published_at,author_id) VALUES('translated',?,?,?,?,'published',CURRENT_TIMESTAMP,'admin')").run(post.slug,post.title,post.excerpt,post.content);
  const request=path=>handleSeo(new Request('https://syucai.me'+path),e);let html=await(await request('/en/blog/'+post.slug)).text();assert.match(html,/lang="en" data-i18n-skip/);assert.match(html,new RegExp('href="https://syucai.me/en/blog/'+post.slug+'"'));assert.match(html,/index,follow/);assert.doesNotMatch(html,/noindex/);assert.ok(html.includes(esc(dictionary[post.title])));assert.ok(html.includes('https://syucai-institute-kazakhstan.com/'));const schema=JSON.parse(html.match(/<script id="seo-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(schema['@graph'].find(v=>v['@type']==='BlogPosting').inLanguage,'en');let map=await(await request('/sitemap.xml')).text();assert.ok(map.includes('/en/blog/'+post.slug));
  e.sqlite.prepare("UPDATE blog_posts SET content=content||' New editorial text' WHERE id='translated'").run();html=await(await request('/en/blog/'+post.slug)).text();assert.match(html,/noindex/);assert.match(html,/lang="ru" data-i18n-skip/);assert.match(html,new RegExp('rel="canonical" href="https://syucai.me/blog/'+post.slug+'"'));map=await(await request('/sitemap.xml')).text();assert.ok(!map.includes('/en/blog/'+post.slug));
 }finally{e.close()}
});

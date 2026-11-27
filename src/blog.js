import {updateSeo} from './seo.js';
import {renderApplicationQueue} from './application-queue.js';
import {mountBlogInteractions,renderCommentModeration} from './blog-interactions.js';
import {renderBlogContent} from './blog-content.js';
import {translateDocument,translateText,currentLanguage,hasTranslation,readyLocaleCodes} from './i18n/runtime.js';
import {basePath} from '../shared/site-routing.js';
import {blogSource,blogTranslationAvailable} from '../shared/blog-translations.js';
import {renderReviewQueue,renderBlogEditor} from './community-admin.js';
let currentBlog=null;
function applyBlogLanguage(){
 if(!currentBlog)return;const {data,slug,esc}=currentBlog,path=slug?'/blog/'+slug:'/blog';if(basePath(location.pathname)!==path)return;
 const locale=currentLanguage(),translated=post=>blogTranslationAvailable(post,locale,key=>hasTranslation(key)),translator=post=>locale!=='ru'&&translated(post)?translateText:value=>String(value||'').replace(/Сюцай/gi,'SYUCAI');
 if(slug){
  const article=document.querySelector('.blog-article');if(!article)return;const t=translator(data),language=translated(data)?locale:'ru';
  article.querySelector('header').lang=language;article.querySelector('header h1').textContent=t(data.title);article.querySelector('.blog-article-layout').lang=language;
  article.querySelector('.blog-content').innerHTML=renderBlogContent(data.content,esc,t);article.querySelector('.blog-cover')?.setAttribute('alt',t(data.title));
  article.querySelector('#blog-translation-notice').textContent=language===locale?'':translateText('Статья показана на языке оригинала.');
  updateSeo({title:t(data.title),description:t(data.excerpt)||t(data.content.slice(0,180)),articleLanguage:language,articleLocales:readyLocaleCodes(path).filter(code=>code==='ru'||!!blogSource(data)),image:data.image_id?location.origin+'/api/blog-images/'+data.image_id:undefined,type:'article',schema:{'@type':'BlogPosting',headline:t(data.title),datePublished:data.published_at.replace(' ','T')+'Z',dateModified:data.updated_at.replace(' ','T')+'Z',inLanguage:language,author:{'@type':'Organization',name:'Syucai Training Institute LLC'},...(data.image_id?{image:location.origin+'/api/blog-images/'+data.image_id}:{})}});
 }else for(const node of document.querySelectorAll('[data-blog-post]')){
  const post=data.posts.find(p=>p.id===node.dataset.blogPost);if(!post)continue;const t=translator(post),language=translated(post)?locale:'ru';
  for(const [selector,text] of [['.blog-preview-title',post.title],['.blog-excerpt',post.excerpt]]){const el=node.querySelector(selector);el.lang=language;el.textContent=t(text)}node.querySelector('.blog-cover')?.setAttribute('alt',t(post.title));
 }
 translateDocument();
}
document.addEventListener('syucai:languagechange',applyBlogLanguage);
export async function renderBlog({shell,api,esc,link,slug}){
 const path=basePath(location.pathname);currentBlog=null;shell('<p class="loading">Загружаем…</p>','page');
 try{
  const data=await api(slug?'/blog/'+encodeURIComponent(slug):'/blog');if(basePath(location.pathname)!==path)return;
  if(slug)shell(`<article class="prose blog-article">${link('/blog','← Все новости','text-link')}<header lang="ru" data-i18n-skip><h1>${esc(data.title)}</h1><p>${esc(data.published_at?.slice(0,10))}</p></header><p class="fineprint" id="blog-translation-notice" role="status"></p><div class="blog-article-layout ${data.image_id?'has-image':''}" lang="ru" data-i18n-skip>${data.image_id?`<img class="blog-cover" src="/api/blog-images/${data.image_id}" alt="${esc(data.title)}">`:''}<div class="blog-content">${renderBlogContent(data.content,esc)}</div></div><div id="blog-interactions"><p class="loading">Загружаем комментарии…</p></div></article>`,'page');
  else shell(`<h1>Блог SYUCAI</h1><div class="blog-list">${data.posts.length?data.posts.map(p=>`<article data-blog-post="${esc(p.id)}"><div class="blog-preview-layout ${p.image_id?'has-image':''}">${p.image_id?`<img class="blog-cover" src="/api/blog-images/${p.image_id}" alt="${esc(p.title)}" loading="lazy">`:''}<div><p data-i18n-skip>${esc(p.published_at?.slice(0,10))}</p><h2 class="blog-preview-title" data-i18n-skip>${esc(p.title)}</h2><p class="blog-excerpt" data-i18n-skip>${esc(p.excerpt)}</p><div class="blog-stats"><span>Лайки: ${p.likes_count}</span><span>Комментарии: ${p.comments_count}</span></div>${link('/blog/'+p.slug,'Читать далее','text-link')}</div></div></article>`).join(''):'<p>Скоро здесь появятся новости SYUCAI.</p>'}</div>`,'page');
  currentBlog={data,slug,esc};applyBlogLanguage();if(slug)mountBlogInteractions({slug,api,esc,link});
 }catch(e){if(basePath(location.pathname)===path)shell(`<h1>Блог SYUCAI</h1><p>${esc(e.message)}</p>`,'page')}
}
export async function renderModerator({shell,api,esc,link}){
 const active=()=>location.pathname==='/moderator';shell('<h1>Панель модератора</h1><p class="loading">Проверяем доступ…</p>','page');
 try{
  await api('/moderator/session');if(!active())return;
  shell(`<div class="account-head"><h1>Панель модератора</h1>${link('/cabinet','Личный кабинет','text-link')}</div><nav class="admin-tabs"><button type="button" data-moderator-tab="applications">Анкеты</button><button type="button" data-moderator-tab="reviews">Отзывы</button><button type="button" data-moderator-tab="posts">Новости блога</button><button type="button" data-moderator-tab="comments">Комментарии</button></nav><div id="moderator-content"></div><p class="error" id="moderator-error" role="alert"></p>`,'page');let current='reviews';
  async function load(tab){current=tab;const box=document.querySelector('#moderator-content');box.innerHTML='<p class="loading">Загружаем…</p>';try{await(tab==='applications'?renderApplicationQueue({box,api,esc,endpoint:'/moderator/applications',isActive:()=>active()&&current===tab}):tab==='comments'?renderCommentModeration({box,api,esc,isActive:()=>active()&&current===tab}):tab==='reviews'?renderReviewQueue({box,api,esc,endpoint:'/moderator/reviews',isActive:()=>active()&&current===tab}):renderBlogEditor({box,api,esc,isActive:()=>active()&&current===tab}))}catch(e){if(active()){document.querySelector('#moderator-error').textContent=e.message;translateDocument()}}}
  for(const button of document.querySelectorAll('[data-moderator-tab]'))button.onclick=()=>load(button.dataset.moderatorTab);await load('reviews');
 }catch(e){if(active())shell(`<h1>Панель модератора</h1><p>${esc(e.message)}</p>${link('/cabinet?mode=login','Войти в личный кабинет','button')}`,'page')}
}

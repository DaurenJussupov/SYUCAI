import {mountBlogInteractions,renderCommentModeration} from './blog-interactions.js';
import {renderBlogContent} from './blog-content.js';
import {translateDocument} from './i18n/runtime.js';
import {renderReviewQueue,renderBlogEditor} from './community-admin.js';
export async function renderBlog({shell,api,esc,link,slug}){
 const path=location.pathname;shell('<p class="loading">Загружаем…</p>','page');
 try{
  const data=await api(slug?'/blog/'+encodeURIComponent(slug):'/blog');if(location.pathname!==path)return;
  if(slug)shell(`<article class="prose blog-article">${link('/blog','← Все новости','text-link')}<header data-i18n-skip><h1>${esc(data.title)}</h1><p>${esc(data.published_at?.slice(0,10))}</p></header><div class="blog-article-layout ${data.image_id?'has-image':''}" data-i18n-skip>${data.image_id?`<img class="blog-cover" src="/api/blog-images/${data.image_id}" alt="${esc(data.title)}">`:''}<div class="blog-content">${renderBlogContent(data.content,esc)}</div></div><div id="blog-interactions"><p class="loading">Загружаем комментарии…</p></div></article>`,'page');
  else shell(`<h1>Блог SYUCAI</h1><div class="blog-list">${data.posts.length?data.posts.map(p=>`<article><div class="blog-preview-layout ${p.image_id?'has-image':''}">${p.image_id?`<img class="blog-cover" src="/api/blog-images/${p.image_id}" alt="${esc(p.title)}" loading="lazy">`:''}<div><p data-i18n-skip>${esc(p.published_at?.slice(0,10))}</p><h2 data-i18n-skip>${esc(p.title)}</h2><p data-i18n-skip>${esc(p.excerpt)}</p><div class="blog-stats"><span>Лайки: ${p.likes_count}</span><span>Комментарии: ${p.comments_count}</span></div>${link('/blog/'+p.slug,'Читать далее','text-link')}</div></div></article>`).join(''):'<p>Скоро здесь появятся новости SYUCAI.</p>'}</div>`,'page');
  if(slug){document.title=data.title+' — SYUCAI';mountBlogInteractions({slug,api,esc,link})}
 }catch(e){if(location.pathname===path)shell(`<h1>Блог SYUCAI</h1><p>${esc(e.message)}</p>`,'page')}
}
export async function renderModerator({shell,api,esc,link}){
 const active=()=>location.pathname==='/moderator';shell('<h1>Панель модератора</h1><p class="loading">Проверяем доступ…</p>','page');
 try{
  await api('/moderator/session');if(!active())return;
  shell(`<div class="account-head"><h1>Панель модератора</h1>${link('/cabinet','Личный кабинет','text-link')}</div><nav class="admin-tabs"><button type="button" data-moderator-tab="reviews">Отзывы</button><button type="button" data-moderator-tab="posts">Новости блога</button><button type="button" data-moderator-tab="comments">Комментарии</button></nav><div id="moderator-content"></div><p class="error" id="moderator-error" role="alert"></p>`,'page');let current='reviews';
  async function load(tab){current=tab;const box=document.querySelector('#moderator-content');box.innerHTML='<p class="loading">Загружаем…</p>';try{await(tab==='comments'?renderCommentModeration({box,api,esc,isActive:()=>active()&&current===tab}):tab==='reviews'?renderReviewQueue({box,api,esc,endpoint:'/moderator/reviews',isActive:()=>active()&&current===tab}):renderBlogEditor({box,api,esc,isActive:()=>active()&&current===tab}))}catch(e){if(active()){document.querySelector('#moderator-error').textContent=e.message;translateDocument()}}}
  for(const button of document.querySelectorAll('[data-moderator-tab]'))button.onclick=()=>load(button.dataset.moderatorTab);await load('reviews');
 }catch(e){if(active())shell(`<h1>Панель модератора</h1><p>${esc(e.message)}</p>${link('/cabinet?mode=login','Войти в личный кабинет','button')}`,'page')}
}

import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {blogSources} from '../../shared/blog-translations.js';
test('full article translations update metadata and preserve the typed original comment across languages',async({page})=>{
 const post=blogSources[0],dictionary=code=>JSON.parse(readFileSync('dist/i18n/'+code+'.json','utf8')).translations;
 await page.addInitScript(()=>localStorage.setItem('syucai-analytics-consent','no'));await page.setViewportSize({width:390,height:844});
 await page.route('**/api/blog/'+post.slug,route=>route.fulfill({json:{...post,id:'local-translated-post',translationSource:post.slug,image_id:null,published_at:'2026-11-27 08:00:00',updated_at:'2026-11-27 08:00:00'}}));
 await page.route('**/api/blog/'+post.slug+'/comments?*',route=>route.fulfill({json:{comments:[],total:0,likes_count:0,nextOffset:null,liked:false,signedIn:true,emailVerified:true,hasName:true,block:null,isModerator:false}}));
 await page.goto('/blog/'+post.slug);await expect(page.locator('#blog-comment-form')).toBeVisible();await page.locator('#blog-comment-form textarea').fill('My original comment must stay exactly as typed.');
 for(const code of ['en','ar']){
  await page.locator('#language-button').click();await page.locator('[data-language="'+code+'"]').click();await expect(page.locator('html')).toHaveAttribute('lang',code);await expect(page.locator('.blog-article header h1')).toHaveText(dictionary(code)[post.title]);await expect(page.locator('.blog-article-layout')).toHaveAttribute('lang',code);await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://syucai.me/'+code+'/blog/'+post.slug);await expect(page.locator('#blog-comment-form textarea')).toHaveValue('My original comment must stay exactly as typed.');
  await expect(page.locator('.blog-content a[href="https://syucai-institute-kazakhstan.com/"]')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await expect(page.locator('html')).toHaveAttribute('dir','rtl');
});

import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// Only public article text is eligible; never export drafts, author IDs or user comments.
export async function refreshBlogSource({root=process.cwd(),origin='https://syucai.me',request=fetch}={}){
 const get=async path=>{const response=await request(new URL(path,origin),{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Public article source returned HTTP '+response.status);return response.json()};
 const list=await get('/api/blog'),posts=[];
 for(const preview of list.posts){if(!/^[a-z0-9-]+$/.test(preview.slug))throw Error('Invalid public article slug');const article=await get('/api/blog/'+preview.slug);if(typeof article.title!=='string'||typeof article.content!=='string')throw Error('Incomplete public article');posts.push({slug:article.slug,title:article.title,excerpt:article.excerpt||'',content:article.content})}
 posts.sort((a,b)=>a.slug.localeCompare(b.slug));await writeFile(resolve(root,'shared/blog-source.json'),JSON.stringify(posts,null,2)+'\n');return posts.length;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)refreshBlogSource().then(count=>console.log('Public articles prepared for translation:',count)).catch(error=>{console.error(error.message);process.exitCode=1});

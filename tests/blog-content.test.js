import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderBlogContent} from '../src/blog-content.js';
import {database} from './helpers/database.js';
import {publicBlog} from '../worker/blog-community.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
test('article formatting escapes HTML, links only HTTP URLs and preserves paragraphs and lists',()=>{
 const result=renderBlogContent('## Heading\n\n<script>alert(1)</script> javascript:alert(2)\n\n* First\n* Second\n\nApply: https://syucai-institute-kazakhstan.com/, now.',esc);
 assert.match(result,/<h2>Heading<\/h2>/);assert.match(result,/<ul><li>First<\/li><li>Second<\/li><\/ul>/);assert.ok(result.includes('&lt;script&gt;'));assert.ok(!result.includes('<script>'));assert.ok(!result.includes('href="javascript:'));assert.ok(result.includes('href="https://syucai-institute-kazakhstan.com/"'));assert.ok(result.includes('</a>, now.'));
});
test('owner-approved first article publishes once, starts with zero reactions and preserves editorial changes',async()=>{
 const e=database(),migration=readFileSync('migrations/0009_first_blog_article.sql','utf8');e.sqlite.exec(migration);const post=await publicBlog(e,'obuchenie-v-dubai-2027');assert.equal(post.title,'Обучение в Дубай возвращается!');assert.equal(post.likes_count,0);assert.equal(post.comments_count,0);assert.match(post.content,/HiSTES/);assert.match(post.content,/https:\/\/syucai-institute-kazakhstan.com\//);e.sqlite.prepare('UPDATE blog_posts SET title=? WHERE id=?').run('Edited title',post.id);e.sqlite.exec(migration);assert.equal((await publicBlog(e,'obuchenie-v-dubai-2027')).title,'Edited title');assert.equal((await publicBlog(e)).posts.length,1);e.close();
});

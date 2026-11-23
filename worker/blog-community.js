import {json,isAdmin,audit} from './admin-auth.js';
import {getUser,moderatorActor} from './accounts.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const summary="SELECT b.*,(SELECT COUNT(*) FROM blog_likes l WHERE l.post_id=b.id) likes_count,(SELECT COUNT(*) FROM blog_comments c WHERE c.post_id=b.id AND c.deleted_at IS NULL) comments_count,(SELECT id FROM blog_images i WHERE i.post_id=b.id) image_id FROM blog_posts b";
export async function publicBlog(e,slug){
 if(!slug)return {posts:(await e.DB.prepare(summary+" WHERE b.status='published' ORDER BY b.published_at DESC LIMIT 100").all()).results.map(({author_id,content,status,created_at,updated_at,...post})=>post)};
 const post=await e.DB.prepare(summary+" WHERE b.slug=? AND b.status='published'").bind(slug).first();if(!post)fail('Новость не найдена',404);delete post.author_id;delete post.status;return post;
}
export async function editorBlog(e,actor){return {posts:(await e.DB.prepare(summary+' WHERE ?=1 OR b.author_id=? ORDER BY b.updated_at DESC LIMIT 100').bind(actor.admin?1:0,actor.id).all()).results}}
const sameEmailUsers="SELECT peer.account_id FROM account_registrations subject JOIN account_registrations peer ON peer.email=subject.email COLLATE NOCASE AND peer.registration_type='user' WHERE subject.account_id=? AND subject.registration_type='user'";
const activeBlock=(e,id)=>e.DB.prepare(`SELECT * FROM comment_blocks WHERE account_id IN(${sameEmailUsers}) AND (indefinite=1 OR blocked_until>CURRENT_TIMESTAMP) ORDER BY indefinite DESC,blocked_until DESC LIMIT 1`).bind(id).first();
const dateSql=date=>date.toISOString().slice(0,19).replace('T',' ');
export function commentBlockEnd(months,days,now=new Date()){
 if(!Number.isInteger(months)||months<0||months>12||!Number.isSafeInteger(days)||days<1)fail('Укажите от 0 до 12 месяцев и не меньше одного дня');
 const end=new Date(now),day=end.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+months);const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(day,last));end.setUTCDate(end.getUTCDate()+days);if(!Number.isFinite(end.getTime())||end.getUTCFullYear()>9999)fail('Укажите корректный срок блокировки');return dateSql(end);
}
export async function handleBlogCommunity(r,e,{body,limit}){
 const url=new URL(r.url),path=url.pathname,method=r.method,offset=Math.max(0,Math.min(1000000,Number.parseInt(url.searchParams.get('offset'),10)||0));
 const interaction=path.match(/^\/api\/blog\/([a-z0-9-]+)\/(comments|like)$/);
 if(interaction){
  const post=await e.DB.prepare("SELECT id FROM blog_posts WHERE slug=? AND status='published'").bind(interaction[1]).first();if(!post)fail('Новость не найдена',404);
  const user=await getUser(r,e,'user');
  if(method==='GET'&&interaction[2]==='comments'){
   const comments=(await e.DB.prepare('SELECT id,author,text,created_at FROM blog_comments WHERE post_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?').bind(post.id,offset).all()).results;
   const count=await e.DB.prepare('SELECT COUNT(*) n FROM blog_comments WHERE post_id=? AND deleted_at IS NULL').bind(post.id).first(),likes=await e.DB.prepare('SELECT COUNT(*) n FROM blog_likes WHERE post_id=?').bind(post.id).first(),block=user?await activeBlock(e,user.id):null;
   return json({comments,total:count.n,likes_count:likes.n,nextOffset:offset+comments.length<count.n?offset+comments.length:null,liked:!!(user&&await e.DB.prepare('SELECT account_id FROM blog_likes WHERE post_id=? AND account_id=?').bind(post.id,user.id).first()),signedIn:!!user,emailVerified:!!user?.email_verified_at,hasName:!!user?.display_name?.trim(),block:block?{indefinite:!!block.indefinite,until:block.blocked_until,reason:block.reason}:null,isModerator:!!(await isAdmin(r,e)||user?.role==='moderator'&&user.email_verified_at)});
  }
  if(method!=='POST')return json({error:'Метод не поддерживается'},405);
  if(!user)fail('Войдите в профиль пользователя',401);if(!user.email_verified_at)fail('Подтвердите email профиля пользователя',403);
  if(interaction[2]==='like'){
   await limit(r,e,'blog-like',240);const data=await body(r);if(typeof data?.liked!=='boolean')fail('Проверьте лайк');
   if(data.liked)await e.DB.prepare('INSERT INTO blog_likes(post_id,account_id) VALUES(?,?) ON CONFLICT DO NOTHING').bind(post.id,user.id).run();else await e.DB.prepare('DELETE FROM blog_likes WHERE post_id=? AND account_id=?').bind(post.id,user.id).run();
   return json({ok:true,liked:data.liked,likes_count:(await e.DB.prepare('SELECT COUNT(*) n FROM blog_likes WHERE post_id=?').bind(post.id).first()).n});
  }
  if(await activeBlock(e,user.id))fail('Возможность комментировать ограничена модератором',403);
  await limit(r,e,'blog-comment',30);const data=await body(r),text=typeof data?.text==='string'?data.text.trim():'';if(!text||text.length>2000)fail('Введите комментарий до 2000 символов');if(!user.display_name?.trim())fail('Укажите имя в личном кабинете');
  const id=crypto.randomUUID();await e.DB.prepare(`INSERT INTO blog_comments(id,post_id,account_id,author,text) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM comment_blocks WHERE account_id IN(${sameEmailUsers}) AND (indefinite=1 OR blocked_until>CURRENT_TIMESTAMP)) RETURNING id`).bind(id,post.id,user.id,user.display_name,text,user.id).first().then(row=>{if(!row)fail('Возможность комментировать ограничена модератором',403)});return json({ok:true,id},201);
 }
 const image=path.match(/^\/api\/blog-images\/([a-f0-9-]{36})$/);
 if(image&&method==='GET'){
  const file=await e.DB.prepare('SELECT i.*,b.status,b.author_id FROM blog_images i JOIN blog_posts b ON b.id=i.post_id WHERE i.id=?').bind(image[1]).first();if(!file)fail('Изображение не найдено',404);
  if(file.status!=='published'){const actor=await moderatorActor(r,e);if(!actor.admin&&actor.id!==file.author_id)fail('Изображение не найдено',404)}
  if(file.object_key.startsWith('asset:/images/blog/'))return e.ASSETS.fetch(new Request(new URL(file.object_key.slice(6),r.url)));
  const object=await e.FILES.get(file.object_key);if(!object)fail('Изображение не найдено',404);return new Response(object.body,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store'}});
 }
 if(!path.startsWith('/api/moderator/'))return null;
 if(!path.includes('/comments')&&!path.includes('/comment-blocks')&&!path.match(/\/posts\/[a-f0-9-]{36}\/image$/))return null;
 const actor=await moderatorActor(r,e);
 if(path==='/api/moderator/comments'&&method==='GET')return json({comments:(await e.DB.prepare('SELECT c.*,b.title,b.slug FROM blog_comments c JOIN blog_posts b ON b.id=c.post_id WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC,c.id DESC LIMIT 50 OFFSET ?').bind(offset).all()).results,total:(await e.DB.prepare('SELECT COUNT(*) n FROM blog_comments WHERE deleted_at IS NULL').first()).n});
 const removal=path.match(/^\/api\/moderator\/comments\/([a-f0-9-]{36})$/);
 if(removal&&method==='DELETE'){await e.DB.prepare('UPDATE blog_comments SET deleted_at=CURRENT_TIMESTAMP,deleted_by=? WHERE id=? AND deleted_at IS NULL').bind(actor.id,removal[1]).run();await audit(e,'blog_comment_removed',removal[1]);return json({ok:true})}
 if(path==='/api/moderator/comment-blocks'&&method==='GET')return json({blocks:(await e.DB.prepare("SELECT c.*,g.display_name FROM comment_blocks c JOIN account_registrations g ON g.account_id=c.account_id AND g.registration_type='user' WHERE c.indefinite=1 OR c.blocked_until>CURRENT_TIMESTAMP ORDER BY c.created_at DESC LIMIT 500").all()).results});
 if(path==='/api/moderator/comment-blocks'&&method==='POST'){
  const data=await body(r),target=await e.DB.prepare("SELECT account_id,role FROM account_registrations WHERE account_id=? AND registration_type='user'").bind(typeof data?.account_id==='string'?data.account_id:'').first();if(!target)fail('Пользователь не найден',404);if(!actor.admin&&target.role==='moderator')fail('Блокировка модераторов доступна администратору',403);
  if(data.action==='unblock'){await e.DB.prepare(`DELETE FROM comment_blocks WHERE account_id IN(${sameEmailUsers})`).bind(target.account_id).run();await audit(e,'comments_unblocked',target.account_id);return json({ok:true})}
  if(data.action!=='block'||typeof data.indefinite!=='boolean')fail('Проверьте параметры блокировки');
  const until=data.indefinite?null:commentBlockEnd(data.months,data.days),reason=typeof data.reason==='string'?data.reason.trim().slice(0,500):'';
  await e.DB.batch([e.DB.prepare(`DELETE FROM comment_blocks WHERE account_id IN(${sameEmailUsers})`).bind(target.account_id),e.DB.prepare('INSERT INTO comment_blocks(account_id,indefinite,months,days,blocked_until,reason,moderated_by) VALUES(?,?,?,?,?,?,?)').bind(target.account_id,data.indefinite?1:0,data.indefinite?0:data.months,data.indefinite?1:data.days,until,reason,actor.id)]);await audit(e,'comments_blocked',target.account_id);return json({ok:true,until,indefinite:data.indefinite});
 }
 const upload=path.match(/^\/api\/moderator\/posts\/([a-f0-9-]{36})\/image$/);
 if(upload){
  const post=await e.DB.prepare('SELECT author_id FROM blog_posts WHERE id=?').bind(upload[1]).first();if(!post)fail('Новость не найдена',404);if(!actor.admin&&post.author_id!==actor.id)fail('Можно редактировать только свои новости',403);
  const old=await e.DB.prepare('SELECT * FROM blog_images WHERE post_id=?').bind(upload[1]).first();
  if(method==='DELETE'){await e.DB.prepare('DELETE FROM blog_images WHERE post_id=?').bind(upload[1]).run();if(old&&!old.object_key.startsWith('asset:'))await e.FILES.delete(old.object_key);await audit(e,'blog_image_removed',upload[1]);return json({ok:true})}
  if(method!=='POST')return json({error:'Метод не поддерживается'},405);
  await limit(r,e,'blog-image',30);if(+(r.headers.get('content-length')||0)>6*1024*1024)fail('Максимальный размер файла — 5 МБ',413);
  const form=await r.formData(),file=form.get('image');if(!(file instanceof File)||!file.size||file.size>5*1024*1024)fail('Выберите JPG, PNG или WebP до 5 МБ');
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),signature=String.fromCharCode(...bytes.slice(0,12));if(!(file.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||file.type==='image/png'&&bytes[0]===137&&signature.slice(1,4)==='PNG'||file.type==='image/webp'&&signature.startsWith('RIFF')&&signature.slice(8,12)==='WEBP'))fail('Содержимое файла не соответствует изображению');
  const id=crypto.randomUUID(),key='blog-images/'+upload[1]+'/'+id;await e.FILES.put(key,buffer,{httpMetadata:{contentType:file.type}});
  try{await e.DB.prepare('INSERT INTO blog_images(id,post_id,object_key,mime,uploaded_by) VALUES(?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET id=excluded.id,object_key=excluded.object_key,mime=excluded.mime,uploaded_by=excluded.uploaded_by').bind(id,upload[1],key,file.type,actor.id).run()}catch(error){await e.FILES.delete(key).catch(()=>{});throw error}
  if(old&&!old.object_key.startsWith('asset:'))await e.FILES.delete(old.object_key).catch(()=>{});await audit(e,'blog_image_uploaded',upload[1]);return json({ok:true,id},201);
 }
 return null;
}

import {json,isAdmin,audit} from './admin-auth.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const text=(value,min,max,label)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(`Проверьте поле «${label}»`);return value.trim()};
export async function communityActor(r,e,required){
 if(await isAdmin(r,e))return {id:'admin',admin:true};
 const user=await required(r,e);if(user.role!=='moderator'||!user.email_verified_at)fail('Нет доступа к панели модератора',403);return {...user,admin:false};
}
export async function listReviewQueue(e){return (await e.DB.prepare("SELECT r.*,p.name master_name,f.id evidence_id,f.name evidence_name FROM reviews r JOIN profiles p ON p.id=r.master_id LEFT JOIN review_evidence f ON f.review_id=r.id ORDER BY CASE WHEN r.status='pending' OR r.evidence_status='unverified' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200").all()).results}
export async function moderateReview(e,data,actor){
 const {id,status}=data||{};if(typeof id!=='string'||!['approved','rejected'].includes(status))fail('Проверьте статус отзыва');
 const review=await e.DB.prepare('SELECT r.*,a.email_verified_at,f.id evidence_id FROM reviews r JOIN accounts a ON a.id=r.author_id LEFT JOIN review_evidence f ON f.review_id=r.id WHERE r.id=?').bind(id).first();if(!review)fail('Отзыв не найден',404);
 if(status==='approved'&&(!review.evidence_id||!review.email_verified_at||data.consultation_confirmed!==true||data.evidence_id!==review.evidence_id))fail('Для публикации проверьте документ, подтверждение email и подтвердите факт консультации');
 const note=typeof data.note==='string'?data.note.trim().slice(0,1000):'';
 await e.DB.prepare("UPDATE reviews SET status=?,evidence_status=?,moderation_note=?,evidence_verified_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE NULL END,moderated_by=? WHERE id=? AND (?='rejected' OR (EXISTS(SELECT 1 FROM review_evidence f WHERE f.review_id=reviews.id AND f.id=?) AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=reviews.author_id AND a.email_verified_at IS NOT NULL))) RETURNING id").bind(status,status==='approved'?'verified':'rejected',note,status,actor.id,id,status,review.evidence_id||'').first().then(row=>{if(!row)fail('Отзыв изменился. Обновите список.',409)});
 await audit(e,'review_'+status,id);return {ok:true};
}
async function saveReview(r,e,owner,masterId,existing,limit){
 if(masterId===owner.id)fail('Нельзя оставить отзыв о себе');
 if(!owner.email_verified_at)fail('Подтвердите email, чтобы оставить отзыв',403);
 await limit(r,e,'review',10);
 if(!r.headers.get('content-type')?.includes('multipart/form-data'))fail('Прикрепите документ, подтверждающий консультацию');
 if(+(r.headers.get('content-length')||0)>6*1024*1024)fail('Максимальный размер файла — 5 МБ',413);
 const form=await r.formData(),rating=Number(form.get('rating')),author=text(owner.display_name||form.get('author'),2,100,'Ваше имя'),review=text(form.get('text'),20,1500,'Отзыв'),file=form.get('evidence');
 if(!Number.isInteger(rating)||rating<1||rating>5)fail('Оценка от 1 до 5');
 if(!(file instanceof File)||!file.size||file.size>5*1024*1024)fail('Прикрепите подтверждение консультации: PDF, JPG или PNG, до 5 МБ');
 const buffer=await file.arrayBuffer(),a=new Uint8Array(buffer),signature=String.fromCharCode(...a.slice(0,8));
 if(!(file.type==='application/pdf'&&signature.startsWith('%PDF-')||file.type==='image/jpeg'&&a[0]===255&&a[1]===216&&a[2]===255||file.type==='image/png'&&a[0]===137&&signature.slice(1,4)==='PNG'))fail('Содержимое файла не соответствует формату PDF, JPG или PNG');
 const id=existing?.id||crypto.randomUUID(),evidenceId=crypto.randomUUID(),key=`review-evidence/${owner.id}/${evidenceId}`,old=existing?await e.DB.prepare('SELECT object_key FROM review_evidence WHERE review_id=?').bind(id).first():null;
 await e.FILES.put(key,buffer,{httpMetadata:{contentType:file.type}});
 try{
  const statements=existing?[e.DB.prepare("UPDATE reviews SET author=?,rating=?,text=?,status='pending',evidence_status='pending',moderation_note='',evidence_verified_at=NULL,moderated_by=NULL WHERE id=? AND author_id=?").bind(author,rating,review,id,owner.id),e.DB.prepare('DELETE FROM review_evidence WHERE review_id=?').bind(id)]:[e.DB.prepare("INSERT INTO reviews(id,master_id,author_id,author,rating,text,status,evidence_status) VALUES(?,?,?,?,?,?,'pending','pending')").bind(id,masterId,owner.id,author,rating,review)];
  statements.push(e.DB.prepare('INSERT INTO review_evidence(id,review_id,account_id,object_key,mime,name) VALUES(?,?,?,?,?,?)').bind(evidenceId,id,owner.id,key,file.type,file.name.slice(0,160)));
  await e.DB.batch(statements);
 }catch(error){await e.FILES.delete(key).catch(()=>{});if(String(error).includes('UNIQUE'))fail('Вы уже оставили отзыв об этом мастере',409);throw error}
 if(old)await e.FILES.delete(old.object_key).catch(()=>{});return json({ok:true,id,status:'pending'},existing?200:201);
}
export async function handleCommunity(r,e,{required,body,limit}){
 const url=new URL(r.url),path=url.pathname,method=r.method;
 if(path==='/api/member/preferences'&&method==='PUT'){
  const owner=await required(r,e),data=await body(r),name=text(data.name,2,100,'Имя');if(typeof data.newsletter!=='boolean')fail('Проверьте выбор подписки');
  await e.DB.prepare('UPDATE accounts SET display_name=?,newsletter_opt_in=?,newsletter_consent_at=CASE WHEN ?=1 AND newsletter_opt_in=0 THEN CURRENT_TIMESTAMP WHEN ?=0 THEN NULL ELSE newsletter_consent_at END WHERE id=?').bind(name,data.newsletter?1:0,data.newsletter?1:0,data.newsletter?1:0,owner.id).run();return json({ok:true});
 }
 if(path==='/api/member/reviews'&&method==='GET'){
  const owner=await required(r,e);return json({reviews:(await e.DB.prepare('SELECT r.*,p.name master_name,f.id evidence_id,f.name evidence_name FROM reviews r JOIN profiles p ON p.id=r.master_id LEFT JOIN review_evidence f ON f.review_id=r.id WHERE r.author_id=? ORDER BY r.created_at DESC LIMIT 100').bind(owner.id).all()).results});
 }
 const reviewPath=path.match(/^\/api\/masters\/([a-f0-9-]+)\/reviews$/);
 if(reviewPath&&method==='POST'){
  const owner=await required(r,e),id=reviewPath[1];if(!await e.DB.prepare("SELECT id FROM profiles WHERE id=? AND status='approved'").bind(id).first())fail('Мастер не найден',404);
  if(await e.DB.prepare('SELECT id FROM reviews WHERE master_id=? AND author_id=?').bind(id,owner.id).first())fail('Вы уже оставили отзыв об этом мастере',409);
  return saveReview(r,e,owner,id,null,limit);
 }
 const edit=path.match(/^\/api\/reviews\/([a-f0-9-]+)$/);
 if(edit&&method==='PUT'){
  const owner=await required(r,e),review=await e.DB.prepare('SELECT * FROM reviews WHERE id=? AND author_id=?').bind(edit[1],owner.id).first();if(!review)fail('Отзыв не найден',404);return saveReview(r,e,owner,review.master_id,review,limit);
 }
 const evidence=path.match(/^\/api\/review-evidence\/([a-f0-9-]+)$/);
 if(evidence&&method==='GET'){
  const file=await e.DB.prepare('SELECT * FROM review_evidence WHERE id=?').bind(evidence[1]).first();if(!file)fail('Файл не найден',404);
  if(!await isAdmin(r,e)){const owner=await required(r,e);if(owner.id!==file.account_id&&!(owner.role==='moderator'&&owner.email_verified_at))fail('Нет доступа',403)}
  const object=await e.FILES.get(file.object_key);if(!object)fail('Файл не найден',404);
  return new Response(object.body,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name)}});
 }
 if(path==='/api/blog'&&method==='GET')return json({posts:(await e.DB.prepare("SELECT id,slug,title,excerpt,published_at FROM blog_posts WHERE status='published' ORDER BY published_at DESC LIMIT 100").all()).results});
 const postPath=path.match(/^\/api\/blog\/([a-z0-9-]+)$/);
 if(postPath&&method==='GET'){const post=await e.DB.prepare("SELECT slug,title,excerpt,content,published_at FROM blog_posts WHERE slug=? AND status='published'").bind(postPath[1]).first();if(!post)fail('Новость не найдена',404);return json(post)}
 if(!path.startsWith('/api/moderator/'))return null;
 const actor=await communityActor(r,e,required);
 if(path==='/api/moderator/session'&&method==='GET')return json({ok:true,admin:actor.admin});
 if(path==='/api/moderator/reviews'&&method==='GET')return json({reviews:await listReviewQueue(e)});
 if(path==='/api/moderator/reviews'&&method==='POST')return json(await moderateReview(e,await body(r),actor));
 if(path==='/api/moderator/posts'&&method==='GET')return json({posts:(await e.DB.prepare('SELECT * FROM blog_posts WHERE ?=1 OR author_id=? ORDER BY updated_at DESC LIMIT 100').bind(actor.admin?1:0,actor.id).all()).results});
 if(path==='/api/moderator/posts'&&method==='POST'){
  await limit(r,e,'blog-write',60);const data=await body(r),title=text(data.title,3,160,'Заголовок'),content=text(data.content,20,6000,'Текст новости'),excerpt=typeof data.excerpt==='string'?data.excerpt.trim().slice(0,300):'';
  if(!['draft','published'].includes(data.status))fail('Проверьте статус новости');
  if(data.id!==undefined&&(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id)))fail('Проверьте ID новости');
  const id=data.id||crypto.randomUUID(),old=await e.DB.prepare('SELECT * FROM blog_posts WHERE id=?').bind(id).first();if(data.id&&!old)fail('Новость не найдена',404);if(old&&!actor.admin&&old.author_id!==actor.id)fail('Можно редактировать только свои новости',403);
  const slug=old?.slug||'news-'+id;
  await e.DB.prepare("INSERT INTO blog_posts(id,slug,title,excerpt,content,status,author_id,published_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?='published' THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(id) DO UPDATE SET title=excluded.title,excerpt=excluded.excerpt,content=excluded.content,status=excluded.status,published_at=CASE WHEN excluded.status='published' THEN COALESCE(blog_posts.published_at,CURRENT_TIMESTAMP) ELSE blog_posts.published_at END,updated_at=CURRENT_TIMESTAMP").bind(id,slug,title,excerpt,content,data.status,actor.id,data.status).run();await audit(e,'blog_'+data.status,id);return json({ok:true,id,slug});
 }
 fail('Не найдено',404);
}
export async function handleCommunityAdmin(r,e,{body}){
 const url=new URL(r.url),path=url.pathname;
 if(!['/api/admin/moderators','/api/admin/subscribers'].includes(path))return null;
 if(!await isAdmin(r,e))fail('Войдите в админ-панель',401);
 if(path==='/api/admin/subscribers'&&r.method==='GET')return json({subscribers:(await e.DB.prepare('SELECT id,display_name,email,newsletter_consent_at,email_verified_at FROM accounts WHERE newsletter_opt_in=1 AND email_verified_at IS NOT NULL ORDER BY newsletter_consent_at DESC LIMIT 10000').all()).results});
 if(path==='/api/admin/moderators'&&r.method==='GET')return json({accounts:(await e.DB.prepare("SELECT id,display_name,email,role,email_verified_at FROM accounts WHERE role='moderator' OR lower(email)=? ORDER BY email LIMIT 200").bind((url.searchParams.get('email')||'').trim().toLowerCase()).all()).results});
 if(path==='/api/admin/moderators'&&r.method==='POST'){
  const data=await body(r);if(!['user','moderator'].includes(data?.role)||typeof data.id!=='string')fail('Проверьте роль пользователя');
  const account=await e.DB.prepare('UPDATE accounts SET role=? WHERE id=? RETURNING id').bind(data.role,data.id).first();if(!account)fail('Пользователь не найден',404);await audit(e,'role_'+data.role,data.id);return json({ok:true});
 }
 return json({error:'Метод не поддерживается'},405);
}

import {json,audit,enqueue} from './admin-auth.js';
import {queueContact} from './google-contacts.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const group="CASE WHEN g.archived_at IS NOT NULL THEN 'archive' WHEN g.application_status='approved' THEN 'published' WHEN g.application_status='rejected' THEN 'rework' ELSE 'pending' END";
export async function applicationList(e,url,{admin=true}={}){
 const type=['master','user','all'].includes(url.searchParams.get('type'))?url.searchParams.get('type'):'master',section=['pending','published','rework','archive','all'].includes(url.searchParams.get('section'))?url.searchParams.get('section'):'all',offset=Math.max(0,Number.parseInt(url.searchParams.get('offset'),10)||0),search=String(url.searchParams.get('q')||'').trim().slice(0,100);
 const from=" FROM account_registrations g JOIN accounts a ON a.id=g.account_id LEFT JOIN profiles p ON p.id=a.id AND g.registration_type='master' LEFT JOIN profile_drafts d ON d.account_id=a.id AND g.registration_type='master' LEFT JOIN sync_jobs s ON s.account_id=a.id AND g.registration_type='master'";
 const where="g.deleted_at IS NULL AND (?='all' OR g.registration_type=?) AND (?='' OR a.email LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR g.display_name||' '||g.last_name LIKE ? ESCAPE '\\')";const q='%'+search.replace(/[\\%_]/g,'\\$&')+'%',args=[type,type,search,q,q,q];
 const fields="a.id,a.email,g.registration_type,g.display_name,g.last_name,g.created_at,g.email_verified_at,g.email_verification_sent_at,g.application_status,g.application_note,g.application_submitted_at,g.rework_since,g.archived_at,g.deleted_at,p.name,p.city_id,p.city_name,p.country_code,p.country,p.bio,p.credentials,p.phone,p.photo,p.updated_at,COALESCE(p.moderation_note,g.application_note) moderation_note,CASE WHEN g.archived_at IS NOT NULL THEN 'archived' WHEN g.registration_type='user' THEN g.application_status ELSE COALESCE(p.status,'not_submitted') END status,d.data draft,s.status sync_status,s.last_error sync_error,CASE WHEN g.application_status='rejected' AND g.rework_since<datetime('now','-7 days') AND g.archived_at IS NULL THEN 1 ELSE 0 END can_delete";
 const rows=(await e.DB.prepare('SELECT '+fields+from+' WHERE '+where+` AND (?='all' OR ${group}=?) ORDER BY COALESCE(g.application_submitted_at,g.created_at) DESC,a.id,g.registration_type LIMIT 50 OFFSET ?`).bind(...args,section,section,offset).all()).results;
 const masterIds=rows.filter(r=>r.registration_type==='master').map(r=>r.id),files=masterIds.length?(await e.DB.prepare(`SELECT id,account_id,kind,mime,name FROM files WHERE account_id IN (${masterIds.map(()=>'?').join(',')})`).bind(...masterIds).all()).results:[];
 for(const row of rows){row.overdue_rework=!!row.can_delete;row.can_delete=!!row.can_delete||admin&&row.application_status==='rejected'&&!row.archived_at;row.files=row.registration_type==='master'?files.filter(f=>f.account_id===row.id):[];if(row.draft){try{row.draft=JSON.parse(row.draft)}catch{row.draft=null}}if(row.registration_type==='user')row.name=[row.display_name,row.last_name].filter(Boolean).join(' ')}
 const counts=(await e.DB.prepare('SELECT '+group+' section,COUNT(*) n'+from+' WHERE '+where+' GROUP BY 1').bind(...args).all()).results;
 return {applications:rows,total:section==='all'?counts.reduce((n,c)=>n+c.n,0):counts.find(c=>c.section===section)?.n||0,counts:Object.fromEntries(counts.map(c=>[c.section,c.n])),offset,type,section};
}
async function masterReady(e,id){const p=await e.DB.prepare('SELECT photo FROM profiles WHERE id=?').bind(id).first();if(!p)fail('Мастер ещё не отправил анкету');const photo=p.photo&&await e.DB.prepare("SELECT id FROM files WHERE id=? AND account_id=? AND kind='photo'").bind(p.photo,id).first(),documents=await e.DB.prepare("SELECT COUNT(*) n FROM files WHERE account_id=? AND kind='document'").bind(id).first();if(!photo||!documents.n)fail('Для публикации нужны фото и диплом');return p}
export async function moderateApplication(e,data,actor={id:'admin'}){
 const {id,action}=data||{},type=data.registrationType||'master';if(typeof id!=='string'||!['master','user'].includes(type)||!['approve','reject','archive','restore','delete'].includes(action))fail('Проверьте действие с анкетой');
 const g=await e.DB.prepare('SELECT * FROM account_registrations WHERE account_id=? AND registration_type=? AND deleted_at IS NULL').bind(id,type).first();if(!g)fail('Анкета не найдена',404);
 const note=typeof data.note==='string'?data.note.trim().slice(0,1000):'';let changed;
 if(action==='approve'||action==='reject'){
  if(g.archived_at)fail('Сначала восстановите анкету из архива',409);if(action==='approve'&&type==='master')await masterReady(e,id);
  const status=action==='approve'?'approved':'rejected';
  const results=await e.DB.batch([
   e.DB.prepare("UPDATE account_registrations SET application_status=?,application_note=?,rework_since=CASE WHEN ?='rejected' THEN COALESCE(rework_since,CURRENT_TIMESTAMP) ELSE NULL END WHERE account_id=? AND registration_type=? AND archived_at IS NULL AND deleted_at IS NULL RETURNING account_id").bind(status,note,status,id,type),
   e.DB.prepare("UPDATE profiles SET status=?,moderation_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ?='master' AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profiles.id AND g.registration_type='master' AND g.archived_at IS NULL AND g.deleted_at IS NULL)").bind(status,note,id,type)
  ]);changed=results[0].results?.length;
 }else if(action==='archive'){
  if(g.application_status!=='approved'||g.archived_at)fail('В архив можно перенести опубликованную или одобренную анкету',409);
  const results=await e.DB.batch([
   e.DB.prepare("UPDATE account_registrations SET archived_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=? AND application_status='approved' AND archived_at IS NULL AND deleted_at IS NULL RETURNING account_id").bind(id,type),
   e.DB.prepare("UPDATE profiles SET status='draft',updated_at=CURRENT_TIMESTAMP WHERE id=? AND ?='master' AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profiles.id AND g.registration_type='master' AND g.archived_at IS NOT NULL)").bind(id,type)
  ]);changed=results[0].results?.length;
 }else if(action==='restore'){
  if(!g.archived_at)fail('Анкета не находится в архиве',409);if(type==='master'&&g.application_status==='approved')await masterReady(e,id);
  const results=await e.DB.batch([
   e.DB.prepare("UPDATE profiles SET status=(SELECT application_status FROM account_registrations g WHERE g.account_id=profiles.id AND g.registration_type='master'),updated_at=CURRENT_TIMESTAMP WHERE id=? AND ?='master' AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profiles.id AND g.registration_type='master' AND g.archived_at IS NOT NULL AND g.deleted_at IS NULL)").bind(id,type),
   e.DB.prepare('UPDATE account_registrations SET archived_at=NULL WHERE account_id=? AND registration_type=? AND archived_at IS NOT NULL AND deleted_at IS NULL RETURNING account_id').bind(id,type)
  ]);changed=results[1].results?.length;
 }else{
  const results=await e.DB.batch([
   e.DB.prepare("UPDATE account_registrations SET deleted_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=? AND application_status='rejected' AND (?=1 OR rework_since<datetime('now','-7 days')) AND archived_at IS NULL AND deleted_at IS NULL RETURNING account_id").bind(id,type,actor.admin||actor.id==='admin'?1:0),
   e.DB.prepare("UPDATE profiles SET status='draft',updated_at=CURRENT_TIMESTAMP WHERE id=? AND ?='master' AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profiles.id AND g.registration_type='master' AND g.deleted_at IS NOT NULL)").bind(id,type)
  ]);changed=results[0].results?.length;if(!changed)fail('Удаление доступно для анкет на доработке. Модератору — только спустя более 7 дней',409);
 }
 if(!changed)fail('Статус анкеты изменился. Обновите список.',409);await e.DB.prepare('UPDATE account_registrations SET application_moderated_by=?,application_moderated_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=?').bind(actor.id,id,type).run();await audit(e,'application_'+action,id+':'+type+':'+actor.id);await queueContact(e,id);if(type==='master')await enqueue(e,id);return {ok:true};
}
export async function handleMemberResubmission(r,e,{required}){
 if(new URL(r.url).pathname!=='/api/member/resubmit')return null;if(r.method!=='POST')return json({error:'Метод не поддерживается'},405);const owner=await required(r,e);if(!owner.display_name?.trim()||!owner.last_name?.trim())fail('Заполните и подтвердите имя и фамилию');
 const changed=await e.DB.prepare("UPDATE account_registrations SET application_status='pending',application_note='',rework_since=NULL,application_submitted_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type='user' AND application_status='rejected' AND archived_at IS NULL AND deleted_at IS NULL RETURNING account_id").bind(owner.id).first();if(!changed)fail('Анкета не ожидает доработки',409);return json({ok:true});
}

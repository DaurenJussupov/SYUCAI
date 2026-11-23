import {getUser} from './accounts.js';
import {isAdmin,json,audit} from './admin-auth.js';
const statuses=['new','in_progress','answered','customer_replied','closed'];
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const uuid=/^[a-f0-9-]{36}$/;
async function actor(r,e,staff){if(staff){if(!await isAdmin(r,e))fail('Войдите в админ-панель',401);return {id:'admin',staff:true}}const user=await getUser(r,e,'master');if(!user)fail('Войдите в кабинет мастера',401);return {id:user.id,staff:false}}
async function ticket(e,id,who){const row=await e.DB.prepare('SELECT * FROM support_tickets WHERE id=? AND (?=1 OR account_id=?)').bind(id,who.staff?1:0,who.id).first();if(!row)fail('Обращение не найдено',404);return row}
export async function supportList(e,who,url){
 const status=url.searchParams.get('status')||'all';if(status!=='all'&&!statuses.includes(status))fail('Выберите статус обращения');
 const offset=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('offset')))||0));
 const filter='(?=1 OR t.account_id=?) AND (?=\'all\' OR t.status=?)';
 const args=[who.staff?1:0,who.id,status,status];
 const rows=(await e.DB.prepare(`SELECT t.*,g.display_name,g.last_name,g.email FROM support_tickets t JOIN account_registrations g ON g.account_id=t.account_id AND g.registration_type='master' WHERE ${filter} ORDER BY t.updated_at DESC,t.id DESC LIMIT 30 OFFSET ?`).bind(...args,offset).all()).results;
 const total=(await e.DB.prepare(`SELECT COUNT(*) n FROM support_tickets t WHERE ${filter}`).bind(...args).first()).n;
 const counts=(await e.DB.prepare('SELECT status,COUNT(*) count FROM support_tickets WHERE (?=1 OR account_id=?) GROUP BY status').bind(who.staff?1:0,who.id).all()).results;
 return {tickets:rows,total,counts,nextOffset:offset+rows.length<total?offset+rows.length:null};
}
async function content(r){
 if(+(r.headers.get('content-length')||0)>16*1024*1024)fail('Общий размер вложений — до 15 МБ',413);
 let form;try{form=await r.formData()}catch{fail('Не удалось прочитать сообщение')}
 const text=form.get('text');if(typeof text!=='string'||!text.trim()||text.trim().length>5000)fail('Введите сообщение: от 1 до 5 000 символов');
 const rawSubject=form.get('subject');if(rawSubject!==null&&(typeof rawSubject!=='string'||rawSubject.trim().length>120))fail('Тема — до 120 символов');
 const files=form.getAll('files').filter(f=>f instanceof File&&f.size);if(files.length>3)fail('К сообщению можно прикрепить до 3 файлов');
 const checked=[];for(const file of files){
  if(file.size>5*1024*1024)fail('Один файл — до 5 МБ',413);
  if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))fail('Допустимы JPG, PNG, WebP и PDF');
  const buffer=await file.arrayBuffer(),a=new Uint8Array(buffer),sig=String.fromCharCode(...a.slice(0,12));
  if(!(file.type==='image/png'?a[0]===137&&sig.slice(1,4)==='PNG':file.type==='image/jpeg'?a[0]===255&&a[1]===216&&a[2]===255:file.type==='image/webp'?sig.startsWith('RIFF')&&sig.slice(8)==='WEBP':sig.startsWith('%PDF-')))fail('Содержимое файла не соответствует формату');
  checked.push({id:crypto.randomUUID(),name:file.name.replace(/[\r\n\0]/g,'').slice(0,160)||'file',mime:file.type,size:file.size,buffer});
 }
 return {text:text.trim(),subject:rawSubject?.trim()||text.trim().slice(0,80),files:checked,version:Number(form.get('version'))};
}
async function writeMessage(r,e,who,old){
 const data=await content(r),id=old?.id||crypto.randomUUID(),mid=crypto.randomUUID();
 if(old&&data.version!==old.version)fail('В обращении есть изменения. Обновите переписку.',409);
 if(old&&(await e.DB.prepare('SELECT COUNT(*) n FROM support_messages WHERE ticket_id=?').bind(id).first()).n>=500)fail('Создайте новое обращение для продолжения переписки');
 const stored=[];let committed=false;try{
  for(const f of data.files){f.key=`support/${id}/${f.id}`;await e.FILES.put(f.key,f.buffer,{httpMetadata:{contentType:f.mime}});stored.push(f.key)}
  const version=(old?.version||0)+1,status=who.staff?'answered':'customer_replied';
  const first=old?e.DB.prepare(`UPDATE support_tickets SET status=?,version=version+1,last_message_id=?,updated_at=CURRENT_TIMESTAMP,${who.staff?'last_staff_version=version+1,staff_read_version=version+1':'last_customer_version=version+1,customer_read_version=version+1'} WHERE id=? AND version=? RETURNING id`).bind(status,mid,id,old.version):e.DB.prepare('INSERT INTO support_tickets(id,account_id,subject,last_message_id) VALUES(?,?,?,?) RETURNING id').bind(id,who.id,data.subject,mid);
  const written='SELECT id FROM support_tickets WHERE id=? AND last_message_id=?';
  const results=await e.DB.batch([first,e.DB.prepare(`INSERT INTO support_messages(id,ticket_id,author_type,author_id,text) SELECT ?,id,?,?,? FROM support_tickets WHERE id IN(${written})`).bind(mid,who.staff?'staff':'master',who.id,data.text,id,mid),...data.files.map(f=>e.DB.prepare(`INSERT INTO support_attachments(id,message_id,object_key,mime,name,size) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_messages WHERE id=?)`).bind(f.id,mid,f.key,f.mime,f.name,f.size,mid))]);
  if(!results[0].results.length)fail('В обращении есть изменения. Обновите переписку.',409);
  committed=true;if(who.staff)await audit(e,'support_reply',id);
  return {ok:true,id,version};
 }catch(error){if(!committed)await Promise.all(stored.map(key=>e.FILES.delete(key).catch(()=>{})));throw error}
}
export async function handleSupport(r,e,{body,limit}){
 const url=new URL(r.url),path=url.pathname,staff=path.startsWith('/api/admin/support');
 if(!/^\/api\/(?:admin\/)?support(?:\/|$)/.test(path))return null;
 const who=await actor(r,e,staff),base=staff?'/api/admin/support':'/api/support',tail=path.slice(base.length);
 if(!tail&&r.method==='GET')return json(await supportList(e,who,url));
 if(!tail&&r.method==='POST'&&!staff){await limit(r,e,'support-new:'+who.id,10);return json(await writeMessage(r,e,who),201)}
 const file=tail.match(/^\/files\/([a-f0-9-]{36})$/);
 if(file&&r.method==='GET'){
  const f=await e.DB.prepare('SELECT f.*,m.ticket_id FROM support_attachments f JOIN support_messages m ON m.id=f.message_id WHERE f.id=?').bind(file[1]).first();if(!f)fail('Файл не найден',404);await ticket(e,f.ticket_id,who);const obj=await e.FILES.get(f.object_key);if(!obj)fail('Файл не найден',404);
  return new Response(obj.body,{headers:{'Content-Type':f.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(f.name)}});
 }
 const match=tail.match(/^\/([a-f0-9-]{36})(\/messages)?$/);if(!match||!uuid.test(match[1]))fail('Обращение не найдено',404);
 const row=await ticket(e,match[1],who);
 if(!match[2]&&r.method==='GET'){
  const messages=(await e.DB.prepare('SELECT id,author_type,text,created_at FROM support_messages WHERE ticket_id=? ORDER BY rowid').bind(row.id).all()).results;
  const files=(await e.DB.prepare('SELECT f.id,f.message_id,f.name,f.mime,f.size FROM support_attachments f JOIN support_messages m ON m.id=f.message_id WHERE m.ticket_id=?').bind(row.id).all()).results;
  await e.DB.prepare(`UPDATE support_tickets SET ${who.staff?'staff_read_version':'customer_read_version'}=MAX(${who.staff?'staff_read_version':'customer_read_version'},?) WHERE id=?`).bind(row.version,row.id).run();
  return json({ticket:row,messages:messages.map(m=>({...m,files:files.filter(f=>f.message_id===m.id)}))});
 }
 if(match[2]&&r.method==='POST'){await limit(r,e,'support-reply:'+who.id,60);return json(await writeMessage(r,e,who,row),201)}
 if(!match[2]&&r.method==='PATCH'&&staff){const data=await body(r);if(!['in_progress','closed'].includes(data.status))fail('Выберите статус обращения');const changed=await e.DB.prepare('UPDATE support_tickets SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=? RETURNING id').bind(data.status,row.id,data.version).first();if(!changed)fail('В обращении есть изменения. Обновите переписку.',409);await audit(e,'support_'+data.status,row.id);return json({ok:true})}
 fail('Метод не поддерживается',405);
}

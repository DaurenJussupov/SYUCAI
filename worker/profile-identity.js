import {hash,hex,equal,json,enqueue} from './admin-auth.js';
import {getUser,registrationType} from './accounts.js';
import {emailConfigured,emailSender} from './email-verification.js';
import {sixDigitCode} from './security-codes.js';
import {queueContact} from './google-contacts.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const invalid=()=>fail('Код неверный или срок его действия истёк. Запросите новый код.');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function handleProfileIdentity(r,e,{body,limit,text,now=Date.now(),request=fetch}){
 const path=new URL(r.url).pathname;if(!['/api/auth/name-change/request','/api/auth/name-change/verify'].includes(path))return null;
 if(r.method!=='POST')return json({error:'Метод не поддерживается'},405);
 const data=await body(r),type=registrationType(data.registrationType),user=await getUser(r,e,type);if(!user)fail('Войдите в свой профиль',401);
 if(path.endsWith('/request')){
  const given=text(data.name,1,100,'Имя'),last=text(data.lastName,1,100,'Фамилия');if(given===user.display_name&&last===user.last_name)return json({ok:true,unchanged:true});
  if(!emailConfigured(e))fail('Сервис отправки писем временно недоступен. Повторите позже.',503);
  await limit(r,e,'name-change-request:'+type,10);
  await e.DB.prepare('DELETE FROM profile_name_changes WHERE created_at<?').bind(now-86400000).run();await e.DB.prepare('DELETE FROM profile_name_change_limits WHERE last_sent<?').bind(now-86400000).run();
  const reservation=await e.DB.prepare('INSERT INTO profile_name_change_limits(account_id,registration_type,last_sent,window_start,hits) VALUES(?,?,?,?,1) ON CONFLICT(account_id,registration_type) DO UPDATE SET last_sent=excluded.last_sent,window_start=CASE WHEN profile_name_change_limits.window_start<=? THEN excluded.window_start ELSE profile_name_change_limits.window_start END,hits=CASE WHEN profile_name_change_limits.window_start<=? THEN 1 ELSE profile_name_change_limits.hits+1 END WHERE profile_name_change_limits.last_sent<=? AND (profile_name_change_limits.window_start<=? OR profile_name_change_limits.hits<5) RETURNING account_id').bind(user.id,type,now,now,now-3600000,now-3600000,now-60000,now-3600000).first();if(!reservation)fail('Повторный код можно запросить через минуту. Не более пяти писем в час.',429);
  const challenge=random(),code=sixDigitCode();await e.DB.batch([
   e.DB.prepare('UPDATE profile_name_changes SET completed_at=? WHERE account_id=? AND registration_type=? AND completed_at IS NULL').bind(now,user.id,type),
   e.DB.prepare('INSERT INTO profile_name_changes(id,account_id,registration_type,given_name,last_name,previous_given,previous_last,code_hash,created_at,expires) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(await hash(challenge),user.id,type,given,last,user.display_name,user.last_name||'',await hash(challenge+':'+code),now,now+600000)
  ]);
  const section=type==='master'?'профиле мастера':'профиле пользователя';let deliveryConfirmed=false;
  try{const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${e.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'name-'+random()},body:JSON.stringify({from:emailSender(e),to:[user.email],subject:'Подтвердите изменение имени и фамилии — SYUCAI',text:`Код подтверждения изменения имени и фамилии в ${section} на syucai.me: ${code}\n\nКод действует 10 минут. Никому его не сообщайте. Если Вы не меняли данные, проигнорируйте письмо. Без кода имя и фамилия не изменятся.`,html:`<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;line-height:1.7;color:#242427;padding:28px"><h1 style="font-size:24px">Подтверждение изменения данных</h1><p>Код для изменения имени и фамилии в ${section}:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>Код действует 10 минут. Никому его не сообщайте.</p><p>Если Вы не меняли данные, проигнорируйте письмо. Без кода имя и фамилия не изменятся.</p></body></html>`}),signal:AbortSignal.timeout(10000)});deliveryConfirmed=response.ok&&!!(await response.json()).id}catch{}
  if(!deliveryConfirmed)console.error('Name-change email was not acknowledged by provider.');
  return json({ok:true,challenge,codeLength:6,retryAfter:60,expiresIn:600,deliveryConfirmed});
 }
 await limit(r,e,'name-change-verify:'+type,30);if(typeof data.challenge!=='string'||!/^[a-f0-9]{64}$/.test(data.challenge)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))invalid();
 const id=await hash(data.challenge),attempt=await e.DB.prepare('UPDATE profile_name_changes SET attempts=attempts+1 WHERE id=? AND account_id=? AND registration_type=? AND expires>? AND completed_at IS NULL AND attempts<5 RETURNING code_hash').bind(id,user.id,type,now).first();if(!attempt||!equal(await hash(data.challenge+':'+data.code),attempt.code_hash))invalid();
 const completion=random(),owned='SELECT account_id FROM profile_name_changes WHERE id=? AND completion_id=?';
 const results=await e.DB.batch([
  e.DB.prepare('UPDATE profile_name_changes SET completed_at=?,completion_id=? WHERE id=? AND account_id=? AND registration_type=? AND expires>? AND completed_at IS NULL AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=profile_name_changes.account_id AND g.registration_type=profile_name_changes.registration_type AND g.deleted_at IS NULL AND g.display_name=profile_name_changes.previous_given AND g.last_name=profile_name_changes.previous_last) RETURNING account_id').bind(now,completion,id,user.id,type,now),
  e.DB.prepare(`UPDATE account_registrations SET display_name=(SELECT given_name FROM profile_name_changes WHERE id=?),last_name=(SELECT last_name FROM profile_name_changes WHERE id=?),email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP),application_status=CASE WHEN (registration_type='user' AND application_status='approved') OR archived_at IS NOT NULL THEN 'pending' ELSE application_status END,application_submitted_at=CURRENT_TIMESTAMP WHERE account_id IN(${owned}) AND registration_type=?`).bind(id,id,id,completion,type),
  e.DB.prepare(`UPDATE accounts SET display_name=(SELECT given_name FROM profile_name_changes WHERE id=?) WHERE id IN(${owned}) AND registration_type=?`).bind(id,id,completion,type),
  e.DB.prepare(`UPDATE profiles SET name=(SELECT given_name||' '||last_name FROM profile_name_changes WHERE id=?),status=CASE WHEN status='approved' THEN 'pending' ELSE status END,moderation_note=CASE WHEN status='approved' THEN '' ELSE moderation_note END,updated_at=CURRENT_TIMESTAMP WHERE id IN(${owned}) AND ?='master'`).bind(id,id,completion,type),
  e.DB.prepare(`DELETE FROM email_verification_tokens WHERE account_id IN(${owned}) AND registration_type=?`).bind(id,completion,type)
 ]);
 if(!results[0].results?.length)invalid();await queueContact(e,user.id);if(type==='master')await enqueue(e,user.id);return json({ok:true,user:await getUser(r,e,type)});
}

import {getUser,registrationType,requestAccountType} from './accounts.js';
import {sixDigitCode} from './security-codes.js';
import {queueContact} from './google-contacts.js';
import {hash,hex,json,equal} from './admin-auth.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const emailConfigured=e=>!!e.RESEND_API_KEY;
export const emailSender=e=>e.EMAIL_FROM||'SYUCAI <noreply@syucai.me>';
export function emailSite(e){
 const url=new URL(e.PUBLIC_SITE_URL||'https://syucai.me');
 if(url.protocol!=='https:'||url.username||url.password)throw Error('PUBLIC_SITE_URL must be an HTTPS origin');return url.origin;
}
export async function emailConfirmationState(e,user,now=Date.now()){
 if(user.email_verified_at)return {verified:true,codePending:false,retryAfter:0};
 const row=await e.DB.prepare('SELECT expires,attempts FROM email_confirmation_codes WHERE account_id=? AND registration_type=?').bind(user.id,user.registration_type||'master').first(),limit=await e.DB.prepare('SELECT last_sent FROM email_confirmation_limits WHERE account_id=? AND registration_type=?').bind(user.id,user.registration_type||'master').first();
 return {verified:false,codePending:!!row&&row.expires>now&&row.attempts<5,codeLength:6,expiresIn:row?Math.max(0,Math.ceil((row.expires-now)/1000)):0,retryAfter:limit?Math.max(0,Math.ceil((limit.last_sent+60000-now)/1000)):0};
}
export async function sendVerification(e,user,{request=fetch,now=Date.now()}={}){
 if(user.email_verified_at)return {sent:false,verified:true};
 if(!emailConfigured(e))return {sent:false,configured:false};
 const type=user.registration_type||'master';
 const claimed=await e.DB.prepare('INSERT INTO email_confirmation_limits(account_id,registration_type,last_sent,window_start,hits) VALUES(?,?,?,?,1) ON CONFLICT(account_id,registration_type) DO UPDATE SET last_sent=excluded.last_sent,window_start=CASE WHEN email_confirmation_limits.window_start<=? THEN excluded.window_start ELSE email_confirmation_limits.window_start END,hits=CASE WHEN email_confirmation_limits.window_start<=? THEN 1 ELSE email_confirmation_limits.hits+1 END WHERE email_confirmation_limits.last_sent<=? AND (email_confirmation_limits.window_start<=? OR email_confirmation_limits.hits<5) RETURNING account_id').bind(user.id,type,now,now,now-3600000,now-3600000,now-60000,now-3600000).first();
 if(!claimed)fail('Повторный код можно запросить через минуту. Не более пяти писем в час.',429);
 const nonce=hex(crypto.getRandomValues(new Uint8Array(32))),code=sixDigitCode();
 await e.DB.batch([
  e.DB.prepare('INSERT INTO email_confirmation_codes(account_id,registration_type,nonce,code_hash,created_at,expires,attempts) VALUES(?,?,?,?,?,?,0) ON CONFLICT(account_id,registration_type) DO UPDATE SET nonce=excluded.nonce,code_hash=excluded.code_hash,created_at=excluded.created_at,expires=excluded.expires,attempts=0').bind(user.id,type,nonce,await hash(nonce+':'+code),now,now+600000),
  e.DB.prepare('UPDATE account_registrations SET email_verification_requested_at=? WHERE account_id=? AND registration_type=?').bind(now,user.id,type),
  e.DB.prepare('DELETE FROM email_verification_tokens WHERE account_id=? AND registration_type=?').bind(user.id,type)
 ]);
 const section=type==='master'?'профиля мастера':'профиля пользователя',text=`Код подтверждения email для ${section} на syucai.me: ${code}\n\nКод действует 10 минут. Никому его не сообщайте. Если Вы не регистрировались, проигнорируйте письмо.`,html=`<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;line-height:1.7;padding:28px;color:#242427"><h1 style="font-size:24px">Подтвердите email</h1><p>Код подтверждения для ${section}:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>Введите код на сайте syucai.me. Код действует 10 минут. Никому его не сообщайте.</p><p>Если Вы не регистрировались, проигнорируйте это письмо.</p></body></html>`;
 const state={configured:true,codePending:true,codeLength:6,retryAfter:60,expiresIn:600};
 try{
  const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${e.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'verify-'+nonce},body:JSON.stringify({from:emailSender(e),to:[user.email],subject:'Код подтверждения email '+section+' — SYUCAI',text,html}),signal:AbortSignal.timeout(10000)});
  if(!response.ok||!(await response.json()).id)throw Error('Provider did not acknowledge delivery');
  await e.DB.prepare('UPDATE account_registrations SET email_verification_sent_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=?').bind(user.id,type).run();return {...state,sent:true};
 }catch{
  // A timeout may occur after delivery. Keep the hash until expiry, never log codes.
  console.error('Verification email was not acknowledged by provider.');return {...state,sent:false};
 }
}
export async function verifyEmailCode(e,user,code,now=Date.now()){
 const type=user.registration_type||'master',invalid=()=>fail('Код неверный или срок его действия истёк. Запросите новый код.');
 if(typeof code!=='string'||!/^\d{6}$/.test(code))invalid();
 const row=await e.DB.prepare('UPDATE email_confirmation_codes SET attempts=attempts+1 WHERE account_id=? AND registration_type=? AND expires>? AND attempts<5 RETURNING nonce,code_hash').bind(user.id,type,now).first();
 if(!row||!equal(await hash(row.nonce+':'+code),row.code_hash))invalid();
 const updated=await e.DB.prepare('UPDATE account_registrations SET email_verified_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=? AND email_verified_at IS NULL AND EXISTS(SELECT 1 FROM email_confirmation_codes c WHERE c.account_id=account_registrations.account_id AND c.registration_type=account_registrations.registration_type AND c.nonce=? AND c.expires>?) RETURNING account_id').bind(user.id,type,row.nonce,now).first();if(!updated)invalid();
 await e.DB.batch([e.DB.prepare('DELETE FROM email_confirmation_codes WHERE account_id=? AND registration_type=?').bind(user.id,type),e.DB.prepare('DELETE FROM email_verification_tokens WHERE account_id=? AND registration_type=?').bind(user.id,type)]);await queueContact(e,user.id);return {ok:true,registration_type:type};
}
export async function verifyEmail(e,token,now=Date.now()){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('Ссылка подтверждения недействительна. Запросите новое письмо в кабинете.');
 const digest=await hash(token);
 const pending=await e.DB.prepare('SELECT account_id,registration_type FROM email_verification_tokens WHERE token=? AND expires>?').bind(digest,now).first();
 if(!pending)fail('Ссылка истекла или уже использована. Запросите новое письмо в кабинете.');
 const updated=await e.DB.prepare('UPDATE account_registrations SET email_verified_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=? AND email_verified_at IS NULL AND EXISTS(SELECT 1 FROM email_verification_tokens WHERE token=? AND expires>?) RETURNING account_id').bind(pending.account_id,pending.registration_type,digest,now).first();
 if(!updated)fail('Ссылка истекла или уже использована. Запросите новое письмо в кабинете.');
 await e.DB.prepare('DELETE FROM email_verification_tokens WHERE account_id=? AND registration_type=?').bind(updated.account_id,pending.registration_type).run();await e.DB.prepare('DELETE FROM email_confirmation_codes WHERE account_id=? AND registration_type=?').bind(updated.account_id,pending.registration_type).run();await queueContact(e,pending.account_id);return {ok:true,registration_type:pending.registration_type};
}
export async function handleEmailVerification(r,e,{required,body,limit}){
 const path=new URL(r.url).pathname;
 if(!['/api/auth/verify-email','/api/auth/resend-verification','/api/auth/verify-email-code'].includes(path))return null;
 if(r.method!=='POST')return json({error:'Метод не поддерживается'},405);
 if(path==='/api/auth/verify-email'){await limit(r,e,'verify-email',30);const data=await body(r);return json(await verifyEmail(e,data?.token))}
 const data=await body(r),type=registrationType(data.registrationType||requestAccountType(r)),user=await getUser(r,e,type);if(!user)fail('Войдите в свой профиль',401);
 if(path==='/api/auth/verify-email-code'){await limit(r,e,'verify-email-code:'+type,30);return json(await verifyEmailCode(e,user,data.code))}
 await limit(r,e,'resend-email:'+type,20);const result=await sendVerification(e,user);
 if(result.verified)return json({ok:true,verified:true});
 return json({ok:true,...result,...(!result.sent?{error:'Сервис почты не подтвердил отправку. Проверьте почту и папку «Спам». Если письма нет, запросите новый код.'}:{})});
}

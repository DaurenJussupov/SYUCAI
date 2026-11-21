import {hash,hex,json} from './admin-auth.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const emailConfigured=e=>!!e.RESEND_API_KEY;
export const emailSender=e=>e.EMAIL_FROM||'SYUCAI <noreply@syucai.me>';
export function emailSite(e){
 const url=new URL(e.PUBLIC_SITE_URL||'https://syucai.me');
 if(url.protocol!=='https:'||url.username||url.password)throw Error('PUBLIC_SITE_URL must be an HTTPS origin');return url.origin;
}
export async function sendVerification(e,user,{request=fetch,now=Date.now()}={}){
 if(user.email_verified_at)return {sent:false,verified:true};
 if(!emailConfigured(e))return {sent:false,configured:false};
 const type=user.registration_type||'master';
 const claimed=await e.DB.prepare('UPDATE account_registrations SET email_verification_requested_at=? WHERE account_id=? AND registration_type=? AND email_verified_at IS NULL AND email_verification_requested_at<=? RETURNING account_id').bind(now,user.id,type,now-60000).first();
 if(!claimed)fail('Повторное письмо можно запросить через минуту',429);
 await e.DB.prepare('DELETE FROM email_verification_tokens WHERE expires<=?').bind(now).run();
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),digest=await hash(token),link=emailSite(e)+'/verify-email#token='+token+'&type='+type;
 await e.DB.prepare('INSERT INTO email_verification_tokens(token,account_id,expires,registration_type) VALUES(?,?,?,?)').bind(digest,user.id,now+86400000,type).run();
 const section=type==='master'?'профиля мастера':'профиля пользователя';
 const text=`Здравствуйте!\n\nПодтвердите email для ${section} на сайте SYUCAI:\n${link}\n\nСсылка действует 24 часа. Если Вы не регистрировались на сайте, просто проигнорируйте это письмо.`;
 const html=`<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;background:#fff;color:#242427;padding:32px;line-height:1.7"><h1 style="font-size:24px">Подтвердите email</h1><p>Здравствуйте!</p><p>Вы зарегистрировались на сайте SYUCAI (${section}). Нажмите кнопку, чтобы подтвердить адрес электронной почты.</p><p><a href="${escape(link)}" style="display:inline-block;padding:12px 22px;background:#242427;color:white;text-decoration:none;border-radius:8px">Подтвердить email</a></p><p>Ссылка действует 24 часа. Если кнопка не открывается, скопируйте адрес в браузер:</p><p style="word-break:break-all">${escape(link)}</p><p style="font-size:12px;color:#73737c">Если Вы не регистрировались на сайте, просто проигнорируйте это письмо.</p></body></html>`;
 try{
  const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${e.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'verify-'+digest},body:JSON.stringify({from:emailSender(e),to:[user.email],subject:'Подтвердите email '+section+' — SYUCAI',text,html}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Email provider returned HTTP '+response.status);
  const accepted=await response.json();if(typeof accepted.id!=='string'||!accepted.id)throw Error('Email provider did not acknowledge the message');
  await e.DB.prepare('UPDATE account_registrations SET email_verification_sent_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=?').bind(user.id,type).run();return {sent:true,configured:true};
 }catch(error){
  // Do not delete the token: a provider timeout may happen after successful delivery.
  // Never log recipient addresses, message bodies, API keys or confirmation tokens.
  console.error('Verification email was not acknowledged by provider.');return {sent:false,configured:true};
 }
}
export async function verifyEmail(e,token,now=Date.now()){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('Ссылка подтверждения недействительна. Запросите новое письмо в кабинете.');
 const digest=await hash(token);
 const pending=await e.DB.prepare('SELECT account_id,registration_type FROM email_verification_tokens WHERE token=? AND expires>?').bind(digest,now).first();
 if(!pending)fail('Ссылка истекла или уже использована. Запросите новое письмо в кабинете.');
 const updated=await e.DB.prepare('UPDATE account_registrations SET email_verified_at=CURRENT_TIMESTAMP WHERE account_id=? AND registration_type=? AND email_verified_at IS NULL AND EXISTS(SELECT 1 FROM email_verification_tokens WHERE token=? AND expires>?) RETURNING account_id').bind(pending.account_id,pending.registration_type,digest,now).first();
 if(!updated)fail('Ссылка истекла или уже использована. Запросите новое письмо в кабинете.');
 await e.DB.prepare('DELETE FROM email_verification_tokens WHERE account_id=? AND registration_type=?').bind(updated.account_id,pending.registration_type).run();return {ok:true,registration_type:pending.registration_type};
}
export async function handleEmailVerification(r,e,{required,body,limit}){
 const path=new URL(r.url).pathname;
 if(!['/api/auth/verify-email','/api/auth/resend-verification'].includes(path))return null;
 if(r.method!=='POST')return json({error:'Метод не поддерживается'},405);
 if(path==='/api/auth/verify-email'){await limit(r,e,'verify-email',30);const data=await body(r);return json(await verifyEmail(e,data?.token))}
 const user=await required(r,e);await limit(r,e,'resend-email',8);const result=await sendVerification(e,user);
 if(result.verified)return json({ok:true,verified:true});
 return result.sent?json({ok:true,sent:true}):json({error:'Сервис отправки писем временно недоступен. Повторите позже.'},503);
}

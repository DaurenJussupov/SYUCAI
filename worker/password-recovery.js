import {hash,hex,equal,json} from './admin-auth.js';
import {registrationType,findRegistration,loginSession} from './accounts.js';
import {emailConfigured,emailSender} from './email-verification.js';
import {queueContact} from './google-contacts.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const invalid=()=>fail('Код неверный или срок его действия истёк. Запросите новый код.');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const resetCookie=(r,type,value,age=600)=>`password_reset_${type}=${value}; Path=/api/auth/password-reset; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
export function sixDigitCode(){const sample=new Uint32Array(1);do{crypto.getRandomValues(sample)}while(sample[0]>=4294000000);return String(sample[0]%1000000).padStart(6,'0')}
async function sendCode(e,email,type,code,request){
 const section=type==='master'?'профиля мастера':'профиля пользователя';
 try{const response=await request('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${e.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':'recovery-'+random()},body:JSON.stringify({from:emailSender(e),to:[email],subject:'Код восстановления пароля '+section+' — SYUCAI',text:`Код для восстановления пароля ${section} на syucai.me: ${code}\n\nКод действует 10 минут. Никому его не сообщайте. Если Вы не запрашивали восстановление, проигнорируйте письмо. Ваш пароль не изменится без подтверждения.`,html:`<!doctype html><html lang="ru"><body style="font-family:Arial,sans-serif;line-height:1.7;color:#242427;padding:28px"><h1 style="font-size:24px">Восстановление пароля</h1><p>Код для ${section} на сайте SYUCAI:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>Код действует 10 минут. Никому его не сообщайте.</p><p>Если Вы не запрашивали восстановление, проигнорируйте письмо. Ваш пароль не изменится без подтверждения.</p></body></html>`}),signal:AbortSignal.timeout(10000)});
  if(!response.ok||!(await response.json()).id)throw Error('Provider did not acknowledge recovery email');
 }catch{console.error('Recovery email was not acknowledged by provider.');/* Generic response prevents account enumeration; a timed-out email may still arrive. */}
}
export async function handlePasswordRecovery(r,e,{body,limit,password,text,now=Date.now(),request=fetch,waitUntil}){
 const path=new URL(r.url).pathname;if(!path.startsWith('/api/auth/password-reset/'))return null;
 if(!['request','verify','complete'].some(action=>path==='/api/auth/password-reset/'+action))return null;
 if(r.method!=='POST')return json({error:'Метод не поддерживается'},405);
 const data=await body(r),type=registrationType(data?.registrationType);
 if(path.endsWith('/request')){
  await limit(r,e,'password-recovery-request:'+type,10);
  const email=text(data?.email,5,254,'Email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Введите корректный email');
  if(!emailConfigured(e))fail('Сервис отправки писем временно недоступен. Повторите позже.',503);
  const emailHash=await hash(type+':'+email);await e.DB.prepare('DELETE FROM password_recoveries WHERE created_at<?').bind(now-86400000).run();
  await e.DB.prepare('DELETE FROM password_recovery_limits WHERE last_sent<?').bind(now-86400000).run();
  const reservation=await e.DB.prepare('INSERT INTO password_recovery_limits(email_hash,registration_type,last_sent,window_start,hits) VALUES(?,?,?,?,1) ON CONFLICT(email_hash,registration_type) DO UPDATE SET last_sent=excluded.last_sent,window_start=CASE WHEN password_recovery_limits.window_start<=? THEN excluded.window_start ELSE password_recovery_limits.window_start END,hits=CASE WHEN password_recovery_limits.window_start<=? THEN 1 ELSE password_recovery_limits.hits+1 END WHERE password_recovery_limits.last_sent<=? AND (password_recovery_limits.window_start<=? OR password_recovery_limits.hits<5) RETURNING email_hash').bind(emailHash,type,now,now,now-3600000,now-3600000,now-60000,now-3600000).first();
  if(!reservation){const state=await e.DB.prepare('SELECT hits,window_start FROM password_recovery_limits WHERE email_hash=? AND registration_type=?').bind(emailHash,type).first();fail(state?.hits>=5&&state.window_start>now-3600000?'Слишком много запросов кода. Попробуйте через час.':'Повторный код можно запросить через минуту',429)}
  const account=await findRegistration(e,email,type),challenge=random(),code=sixDigitCode();
  await e.DB.batch([
   e.DB.prepare('UPDATE password_recoveries SET completed_at=? WHERE email_hash=? AND registration_type=? AND completed_at IS NULL').bind(now,emailHash,type),
   e.DB.prepare('INSERT INTO password_recoveries(id,account_id,registration_type,email_hash,code_hash,password_version,created_at,expires) VALUES(?,?,?,?,?,?,?,?)').bind(await hash(challenge),account?.id||null,type,emailHash,await hash(challenge+':'+code),account?.password||null,now,now+600000)
  ]);
  if(account){const delivery=sendCode(e,email,type,code,request);if(waitUntil)waitUntil(delivery);else await delivery}
  return json({ok:true,challenge,codeLength:6,expiresIn:600,retryAfter:60},200,{'Set-Cookie':resetCookie(r,type,'',0)});
 }
 const challenge=data?.challenge;if(typeof challenge!=='string'||!/^[a-f0-9]{64}$/.test(challenge))invalid();const id=await hash(challenge);
 if(path.endsWith('/verify')){
  await limit(r,e,'password-recovery-verify:'+type,30);
  if(typeof data.code!=='string'||!/^\d{6}$/.test(data.code))invalid();
  // Atomically reserve one of five guesses, including parallel requests.
  const attempt=await e.DB.prepare('UPDATE password_recoveries SET attempts=attempts+1 WHERE id=? AND registration_type=? AND expires>? AND completed_at IS NULL AND verified_at IS NULL AND attempts<5 RETURNING code_hash,account_id').bind(id,type,now).first();
  const digest=await hash(challenge+':'+data.code);if(!attempt||!equal(digest,attempt.code_hash)||!attempt.account_id)invalid();
  const grant=random();const claimed=await e.DB.prepare('UPDATE password_recoveries SET verified_at=?,reset_token=?,grant_expires=? WHERE id=? AND registration_type=? AND expires>? AND completed_at IS NULL AND verified_at IS NULL AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=password_recoveries.account_id AND g.registration_type=password_recoveries.registration_type AND g.password=password_recoveries.password_version) RETURNING account_id').bind(now,await hash(grant),now+600000,id,type,now).first();if(!claimed)invalid();
  return json({ok:true},200,{'Set-Cookie':resetCookie(r,type,grant)});
 }
 await limit(r,e,'password-recovery-complete:'+type,15);
 const grant=r.headers.get('cookie')?.match(new RegExp('(?:^|;\\s*)password_reset_'+type+'=([a-f0-9]{64})(?:;|$)'))?.[1];if(!grant)fail('Подтвердите код из письма перед сменой пароля',401);
 const pass=text(data.password,10,128,'Пароль');if(typeof data.passwordConfirm!=='string'||data.passwordConfirm!==data.password)fail('Пароли не совпадают');
 const salt=crypto.randomUUID(),digest=await password(pass,salt),completion=random();
 // D1 batch is a transaction. The unique completion marker gates every mutation,
 // so a replay or concurrent completion cannot change credentials or end sessions.
 const owned='SELECT account_id FROM password_recoveries WHERE id=? AND completion_id=?';
 const results=await e.DB.batch([
  e.DB.prepare('UPDATE password_recoveries SET completed_at=?,completion_id=? WHERE id=? AND registration_type=? AND reset_token=? AND grant_expires>? AND verified_at IS NOT NULL AND completed_at IS NULL AND EXISTS(SELECT 1 FROM account_registrations g WHERE g.account_id=password_recoveries.account_id AND g.registration_type=password_recoveries.registration_type AND g.password=password_recoveries.password_version) RETURNING account_id').bind(now,completion,id,type,await hash(grant),now),
  e.DB.prepare(`UPDATE account_registrations SET password=?,salt=?,email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP) WHERE account_id IN(${owned}) AND registration_type=?`).bind(digest,salt,id,completion,type),
  e.DB.prepare(`UPDATE accounts SET password=?,salt=? WHERE id IN(${owned}) AND registration_type=?`).bind(digest,salt,id,completion,type),
  e.DB.prepare(`DELETE FROM scoped_sessions WHERE account_id IN(${owned}) AND registration_type=?`).bind(id,completion,type),
  e.DB.prepare(`DELETE FROM sessions WHERE account_id IN(${owned}) AND account_id IN(SELECT id FROM accounts WHERE registration_type=?)`).bind(id,completion,type),
  e.DB.prepare(`DELETE FROM email_verification_tokens WHERE account_id IN(${owned}) AND registration_type=?`).bind(id,completion,type),
  e.DB.prepare(`UPDATE password_recoveries SET completed_at=? WHERE account_id IN(${owned}) AND registration_type=? AND completed_at IS NULL`).bind(now,id,completion,type)
 ]);
 const updated=results[0].results?.[0];if(!updated)fail('Подтверждение истекло или уже использовано. Запросите новый код.',400);
 await queueContact(e,updated.account_id);
 const account=await e.DB.prepare('SELECT a.id,a.email,g.registration_type FROM accounts a JOIN account_registrations g ON g.account_id=a.id WHERE a.id=? AND g.registration_type=?').bind(updated.account_id,type).first();
 const response=await loginSession(r,e,account);response.headers.append('Set-Cookie',resetCookie(r,type,'',0));return response;
}

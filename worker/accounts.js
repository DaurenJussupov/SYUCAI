import {hash,hex,json,isAdmin} from './admin-auth.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function registrationType(value){if(value===undefined)return 'master';if(!['master','user'].includes(value))fail('Выберите раздел регистрации');return value}
export function requestAccountType(r){
 const path=new URL(r.url).pathname;
 if(/^\/api\/(?:profile(?:\/|$)|files(?:\/|$)|promotions(?:\/|$))/.test(path))return 'master';
 if(/^\/api\/(?:member\/|reviews\/|review-evidence\/|moderator\/|masters\/[^/]+\/reviews$)/.test(path))return 'user';
 return registrationType(r.headers.get('X-Account-Type')||new URL(r.url).searchParams.get('section')||undefined);
}
const tokenFor=(r,name)=>r.headers.get('cookie')?.match(new RegExp('(?:^|;\\s*)'+name+'=([a-f0-9]{64})(?:;|$)'))?.[1];
const cookie=(r,type,token,age=604800)=>`${type?'session_'+type:'session'}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
export async function getUser(r,e,type=requestAccountType(r)){
 const scoped=tokenFor(r,'session_'+type),token=scoped||tokenFor(r,'session');if(!token)return null;
 const from=scoped?'scoped_sessions s JOIN accounts a ON a.id=s.account_id JOIN account_registrations g ON g.account_id=a.id AND g.registration_type=s.registration_type':'sessions s JOIN accounts a ON a.id=s.account_id JOIN account_registrations g ON g.account_id=a.id AND g.registration_type=a.registration_type';
 return e.DB.prepare('SELECT a.id,a.email,g.display_name,g.last_name,g.registration_type,g.role,g.newsletter_opt_in,g.newsletter_consent_at,g.created_at,g.email_verified_at,g.email_verification_sent_at,g.application_status,g.application_note,g.rework_since,g.archived_at,g.deleted_at FROM '+from+' WHERE s.token=? AND s.expires>? AND g.registration_type=?').bind(await hash(token),Date.now(),type).first();
}
export async function findRegistration(e,email,type){return e.DB.prepare('SELECT a.id,a.email,g.* FROM accounts a JOIN account_registrations g ON g.account_id=a.id WHERE a.email=? AND g.registration_type=?').bind(email,type).first()}
export async function moderatorActor(r,e){
 if(await isAdmin(r,e))return {id:'admin',admin:true};
 const user=await getUser(r,e,'user');if(!user)fail('Войдите в профиль пользователя',401);if(user.role!=='moderator'||!user.email_verified_at)fail('Нет доступа к панели модератора',403);return {...user,admin:false};
}
export async function createRegistration(e,{email,password,salt,type,displayName,subscribed,lastName=''}){
 const id=crypto.randomUUID();
 const created=await e.DB.prepare('INSERT INTO accounts(id,email,password,salt,display_name,registration_type,newsletter_opt_in,newsletter_consent_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(email) DO NOTHING RETURNING id').bind(id,email,password,salt,displayName,type,subscribed,subscribed).first();
 if(created){await e.DB.prepare('UPDATE account_registrations SET last_name=?,newsletter_opt_in=?,newsletter_consent_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE account_id=? AND registration_type=?').bind(lastName,subscribed,subscribed,id,type).run();return {id,email,registration_type:type}};
 const identity=await e.DB.prepare('SELECT id FROM accounts WHERE email=?').bind(email).first();if(!identity)fail('Повторите регистрацию',409);
 try{await e.DB.prepare('INSERT INTO account_registrations(account_id,registration_type,password,salt,display_name,last_name,newsletter_opt_in,newsletter_consent_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END)').bind(identity.id,type,password,salt,displayName,lastName,subscribed,subscribed).run()}catch(error){if(String(error).includes('UNIQUE'))fail('Этот email уже зарегистрирован в этом разделе',409);throw error}
 return {id:identity.id,email,registration_type:type};
}
async function clearLegacySession(r,e,type){
 const token=tokenFor(r,'session');if(!token)return false;
 return !!await e.DB.prepare('DELETE FROM sessions WHERE token=? AND account_id IN(SELECT id FROM accounts WHERE registration_type=?) RETURNING token').bind(await hash(token),type).first();
}
export async function loginSession(r,e,account,extra={}){
 const type=registrationType(account.registration_type),token=hex(crypto.getRandomValues(new Uint8Array(32))),cleared=await clearLegacySession(r,e,type);
 await e.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()).run();await e.DB.prepare('DELETE FROM scoped_sessions WHERE expires<?').bind(Date.now()).run();await e.DB.prepare('INSERT INTO scoped_sessions(token,account_id,expires,registration_type) VALUES(?,?,?,?)').bind(await hash(token),account.id,Date.now()+604800000,type).run();
 const response=json({user:{id:account.id,email:account.email,registration_type:type},...extra},200,{'Set-Cookie':cookie(r,type,token)});if(cleared)response.headers.append('Set-Cookie',cookie(r,'','',0));return response;
}
export async function logoutSession(r,e){
 const type=requestAccountType(r),cleared=await clearLegacySession(r,e,type),token=tokenFor(r,'session_'+type);
 if(token)await e.DB.prepare('DELETE FROM scoped_sessions WHERE token=? AND registration_type=?').bind(await hash(token),type).run();
 const response=json({ok:true},200,{'Set-Cookie':cookie(r,type,'',0)});if(cleared)response.headers.append('Set-Cookie',cookie(r,'','',0));return response;
}

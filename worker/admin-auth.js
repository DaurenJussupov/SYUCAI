const enc=new TextEncoder();
export const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
export const hash=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
export function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
export const adminCookie=r=>r.headers.get('cookie')?.match(/(?:^|;\s*)admin_session=([a-f0-9]{64})(?:;|$)/)?.[1];
export async function isAdmin(r,e){
 if(!e.ADMIN_TOKEN)return false;
 if(equal(r.headers.get('authorization')||'',`Bearer ${e.ADMIN_TOKEN}`))return true;
 const token=adminCookie(r);if(!token)return false;
 return !!await e.DB.prepare('SELECT token FROM admin_sessions WHERE token=? AND key_hash=? AND expires>?').bind(await hash(token),await hash(e.ADMIN_TOKEN),Date.now()).first();
}
export function requireAdmin(ok){if(!ok)throw Object.assign(Error('Войдите в админ-панель'),{status:401})}
export const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
export const getSetting=async(e,key)=>{const row=await e.DB.prepare('SELECT value FROM site_settings WHERE key=?').bind(key).first();return row?.value||''};
export const setSetting=(e,key,value)=>e.DB.prepare('INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(key,value).run();
export const audit=(e,action,target='')=>e.DB.prepare('INSERT INTO admin_audit(id,action,target_id) VALUES(?,?,?)').bind(crypto.randomUUID(),action,target).run();
export const enqueue=(e,id)=>e.DB.prepare("INSERT INTO sync_jobs(account_id,status) VALUES(?,'pending') ON CONFLICT(account_id) DO UPDATE SET status=CASE WHEN sync_jobs.status='running' THEN 'running' ELSE 'pending' END,rerun=CASE WHEN sync_jobs.status='running' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP").bind(id).run();
export function sessionCookie(r,value,age=28800){return `admin_session=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`}

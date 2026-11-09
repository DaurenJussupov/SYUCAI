import {isAdmin,requireAdmin,json,hash,hex,equal,adminCookie,sessionCookie,getSetting,setSetting,audit,enqueue} from './admin-auth.js';
import {googleConfigured,connectGoogle,googleCallback,createResources,processSync,analyticsAccounts,createAnalytics} from './google.js';
import {statistics} from './analytics.js';
export async function handleAdmin(r,e,{body,limit}){
 const url=new URL(r.url),path=url.pathname,method=r.method;
 if(!path.startsWith('/api/admin/'))return null;
 if(path==='/api/admin/login'&&method==='POST'){
  await limit(r,e,'admin-login',10);const b=await body(r);if(!e.ADMIN_TOKEN)return json({error:'В Cloudflare не настроен ADMIN_TOKEN'},503);
  if(typeof b.token!=='string'||!equal(b.token,e.ADMIN_TOKEN))return json({error:'Неверный ключ администратора'},401);
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));await e.DB.prepare('DELETE FROM admin_sessions WHERE expires<?').bind(Date.now()).run();await e.DB.prepare('INSERT INTO admin_sessions VALUES(?,?,?)').bind(await hash(token),await hash(e.ADMIN_TOKEN),Date.now()+28800000).run();return json({ok:true},200,{'Set-Cookie':sessionCookie(r,token)});
 }
 const authorized=await isAdmin(r,e);
 if(path==='/api/admin/session'&&method==='GET')return json({authenticated:authorized,configured:!!e.ADMIN_TOKEN});
 requireAdmin(authorized);
 if(path==='/api/admin/logout'&&method==='POST'){const token=adminCookie(r);if(token)await e.DB.prepare('DELETE FROM admin_sessions WHERE token=?').bind(await hash(token)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie(r,'',0)})}
 if(path==='/api/admin/stats'&&method==='GET'){const days=[7,30,90].includes(Number(url.searchParams.get('days')))?Number(url.searchParams.get('days')):30;return json(await statistics(e,days))}
 if(path==='/api/admin/applications'&&method==='GET'){
  const offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
  const rows=(await e.DB.prepare("SELECT a.id,a.email,a.created_at,p.name,p.city_id,p.country,p.bio,p.credentials,p.phone,p.photo,p.updated_at,p.moderation_note,COALESCE(p.status,'not_submitted') status,d.data draft,s.status sync_status,s.last_error sync_error FROM accounts a LEFT JOIN profiles p ON p.id=a.id LEFT JOIN profile_drafts d ON d.account_id=a.id LEFT JOIN sync_jobs s ON s.account_id=a.id ORDER BY CASE WHEN p.status='pending' THEN 0 WHEN p.id IS NULL THEN 1 ELSE 2 END,COALESCE(p.updated_at,a.created_at) DESC LIMIT 50 OFFSET ?").bind(offset).all()).results;
  const files=rows.length?(await e.DB.prepare(`SELECT id,account_id,kind,mime,name FROM files WHERE account_id IN (${rows.map(()=>'?').join(',')})`).bind(...rows.map(r=>r.id)).all()).results:[];
  for(const row of rows){row.files=files.filter(f=>f.account_id===row.id);if(row.draft){try{row.draft=JSON.parse(row.draft)}catch{row.draft=null}}}
  const total=await e.DB.prepare('SELECT COUNT(*) n FROM accounts').first();return json({applications:rows,total:total.n,offset});
 }
 if(path==='/api/admin/reviews'&&method==='GET')return json({reviews:(await e.DB.prepare('SELECT r.*,p.name master_name FROM reviews r JOIN profiles p ON p.id=r.master_id ORDER BY CASE WHEN r.status=\'pending\' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 200').all()).results});
 if(path==='/api/admin/reviews'&&method==='POST'){
  const b=await body(r);if(!['approved','rejected'].includes(b.status)||typeof b.id!=='string')return json({error:'Проверьте статус отзыва'},400);
  await e.DB.prepare('UPDATE reviews SET status=? WHERE id=?').bind(b.status,b.id).run();await audit(e,'review_'+b.status,b.id);return json({ok:true});
 }
 if(path==='/api/admin/settings'&&method==='GET')return json({google:{configured:googleConfigured(e),connected:!!await getSetting(e,'google_tokens'),folder:await getSetting(e,'google_folder_id'),sheet:await getSetting(e,'google_sheet_id')},measurementId:await getSetting(e,'ga_measurement_id')||e.GA_MEASUREMENT_ID||'',propertyId:await getSetting(e,'ga_property_id'),redirectUri:new URL('/api/admin/google/callback',r.url).href,sync:(await e.DB.prepare('SELECT status,COUNT(*) count FROM sync_jobs GROUP BY status').all()).results});
 if(path==='/api/admin/settings'&&method==='PUT'){
  const b=await body(r),measurement=String(b.measurementId||'').trim().toUpperCase(),property=String(b.propertyId||'').trim();
  if(measurement&&!/^G-[A-Z0-9]{4,20}$/.test(measurement))return json({error:'Идентификатор Google Analytics должен иметь вид G-…'},400);if(property&&!/^\d{1,20}$/.test(property))return json({error:'ID ресурса GA4 должен содержать только цифры'},400);
  await setSetting(e,'ga_measurement_id',measurement);await setSetting(e,'ga_property_id',property);await audit(e,'analytics_settings');return json({ok:true});
 }
 if(path==='/api/admin/google/connect'&&method==='POST')return json({url:await connectGoogle(r,e)});
 if(path==='/api/admin/google/callback'&&method==='GET'){
  try{await googleCallback(r,e);return new Response(null,{status:303,headers:{Location:'/admin?google=connected','Cache-Control':'no-store'}})}catch{return new Response(null,{status:303,headers:{Location:'/admin?google=error','Cache-Control':'no-store'}})}
 }
 if(path==='/api/admin/google/analytics-accounts'&&method==='GET')return json({accounts:await analyticsAccounts(e)});
 if(path==='/api/admin/google/analytics'&&method==='POST')return json(await createAnalytics(e,{...await body(r),siteUrl:new URL(r.url).origin}));
 if(path==='/api/admin/google/resources'&&method==='POST'){const resources=await createResources(e);await audit(e,'google_resources');return json(resources)}
 if(path==='/api/admin/google/sync'&&method==='POST'){
  const b=await body(r);if(b.all){await e.DB.prepare("INSERT INTO sync_jobs(account_id,status) SELECT id,'pending' FROM accounts a WHERE EXISTS(SELECT 1 FROM profiles WHERE id=a.id) OR EXISTS(SELECT 1 FROM profile_drafts WHERE account_id=a.id) OR EXISTS(SELECT 1 FROM files WHERE account_id=a.id) ON CONFLICT(account_id) DO UPDATE SET status=CASE WHEN sync_jobs.status='running' THEN 'running' ELSE 'pending' END,rerun=CASE WHEN sync_jobs.status='running' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP").run()}else if(b.id)await enqueue(e,String(b.id));
  return json(await processSync(e,1));
 }
 if(path==='/api/admin/audit'&&method==='GET')return json({audit:(await e.DB.prepare('SELECT action,target_id,created_at FROM admin_audit ORDER BY created_at DESC LIMIT 50').all()).results});
 return null;
}

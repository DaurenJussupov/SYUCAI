import {json,getSetting} from './admin-auth.js';
export const events=new Set(['page_view','calculation','calendar_open','calendar_day','master_search','master_view','contact_open','whatsapp_click','registration','profile_submit','review_submit','engagement','error']);
export const cleanLabel=value=>String(value||'').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,60);
export function safePath(value){const path=String(value||'');if(/^\/masters\/[a-f0-9-]{36}$/.test(path))return '/masters/:id';return ['/','/results','/calendar','/about','/masters','/account','/privacy'].includes(path)?path:null}
export async function collectEvent(r,e,b){
 if(!events.has(b.event)||!safePath(b.path)||!/^[a-f0-9-]{36}$/.test(b.session||'')||b.consent!==true)return json({error:'Некорректное событие'},400);
 const ua=r.headers.get('user-agent')||'';
 const device=/ipad|tablet/i.test(ua)?'tablet':/mobile|iphone|android/i.test(ua)?'mobile':'desktop';
 let referrer='';try{referrer=new URL(b.referrer).hostname.slice(0,253)}catch{}
 const country=/^[A-Z]{2}$/.test(r.cf?.country||'')?r.cf.country:'Unknown';
 await e.DB.prepare('INSERT INTO analytics_events(id,event,path,session,referrer,source,medium,campaign,device,country,language,master_id,duration) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),b.event,safePath(b.path),b.session,referrer,cleanLabel(b.source),cleanLabel(b.medium),cleanLabel(b.campaign),device,country,/^[a-zA-Z-]{2,10}$/.test(b.language||'')?b.language:'ru',/^[a-f0-9-]{36}$/.test(b.master_id||'')?b.master_id:null,Math.max(0,Math.min(1800,Number.isInteger(b.duration)?b.duration:0))).run();
 return json({ok:true},202);
}
export async function publicConfig(e){const id=await getSetting(e,'ga_measurement_id')||e.GA_MEASUREMENT_ID||'';return {measurementId:/^G-[A-Z0-9]{4,20}$/.test(id)?id:'',analytics:true}}
export async function statistics(e,days){
 const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,19).replace('T',' ');
 const statements=[
  e.DB.prepare("SELECT (SELECT COUNT(*) FROM accounts) accounts,(SELECT COUNT(*) FROM profiles WHERE status='pending') pending,(SELECT COUNT(*) FROM profiles WHERE status='approved') approved,(SELECT COUNT(*) FROM profiles WHERE status='rejected') rejected,(SELECT COUNT(*) FROM accounts a LEFT JOIN profiles p ON p.id=a.id WHERE p.id IS NULL AND (EXISTS(SELECT 1 FROM profile_drafts WHERE account_id=a.id) OR EXISTS(SELECT 1 FROM files WHERE account_id=a.id))) incomplete,(SELECT COUNT(*) FROM files WHERE kind='photo') photos,(SELECT COUNT(*) FROM files WHERE kind='document') documents,(SELECT COUNT(*) FROM reviews WHERE status='pending') pending_reviews,(SELECT COUNT(*) FROM reviews WHERE status='approved') published_reviews"),
  e.DB.prepare('SELECT event,COUNT(*) events,COUNT(DISTINCT session) sessions FROM analytics_events WHERE created_at>=? GROUP BY event').bind(cutoff),
  e.DB.prepare("SELECT substr(created_at,1,10) day,SUM(event='page_view') views,COUNT(DISTINCT session) sessions,SUM(event='whatsapp_click') contacts FROM analytics_events WHERE created_at>=? GROUP BY day ORDER BY day").bind(cutoff),
  e.DB.prepare("SELECT path,COUNT(*) views,COUNT(DISTINCT session) sessions FROM analytics_events WHERE event='page_view' AND created_at>=? GROUP BY path ORDER BY views DESC LIMIT 30").bind(cutoff),
  e.DB.prepare("SELECT CASE WHEN source<>'' THEN source WHEN referrer<>'' THEN referrer ELSE 'direct' END source,medium,campaign,COUNT(DISTINCT session) sessions FROM analytics_events WHERE event='page_view' AND created_at>=? GROUP BY 1,2,3 ORDER BY sessions DESC LIMIT 30").bind(cutoff),
  e.DB.prepare("SELECT country,COUNT(DISTINCT session) sessions FROM analytics_events WHERE event='page_view' AND created_at>=? GROUP BY country ORDER BY sessions DESC LIMIT 30").bind(cutoff),
  e.DB.prepare("SELECT device,COUNT(DISTINCT session) sessions FROM analytics_events WHERE event='page_view' AND created_at>=? GROUP BY device ORDER BY sessions DESC").bind(cutoff),
  e.DB.prepare("SELECT language,COUNT(DISTINCT session) sessions FROM analytics_events WHERE event='page_view' AND created_at>=? GROUP BY language ORDER BY sessions DESC").bind(cutoff),
  e.DB.prepare("SELECT p.name,a.master_id,SUM(a.event='master_view') views,SUM(a.event='whatsapp_click') contacts FROM analytics_events a LEFT JOIN profiles p ON p.id=a.master_id WHERE a.master_id IS NOT NULL AND a.created_at>=? GROUP BY a.master_id ORDER BY contacts DESC,views DESC LIMIT 30").bind(cutoff),
  e.DB.prepare("SELECT SUM(duration) seconds,COUNT(DISTINCT session) sessions FROM analytics_events WHERE event='engagement' AND created_at>=?").bind(cutoff)
 ];
 const rows=await e.DB.batch(statements);return {days,business:rows[0].results[0],events:rows[1].results,daily:rows[2].results,pages:rows[3].results,sources:rows[4].results,countries:rows[5].results,devices:rows[6].results,languages:rows[7].results,masters:rows[8].results,engagement:rows[9].results[0]};
}

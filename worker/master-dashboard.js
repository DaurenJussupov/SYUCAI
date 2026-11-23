import {getUser} from './accounts.js';
import {json} from './admin-auth.js';
export function masterStatsRange(period,now=Date.now()){
 if(!['today','7','30','90','all'].includes(String(period)))throw Object.assign(Error('Выберите период статистики'),{status:400});
 const today=new Date(now+5*3600000).toISOString().slice(0,10),days=period==='today'?1:Number(period);
 return {from:period==='all'?null:new Date(Date.parse(today+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10),until:today,timezone:'GMT+5'};
}
export async function masterDashboardStats(e,id,period='30',{now=Date.now()}={}){
 const range=masterStatsRange(period,now),rows=await e.DB.batch([
  e.DB.prepare('SELECT COALESCE(SUM(views),0) views,COALESCE(SUM(contacts),0) contacts FROM master_daily_stats WHERE master_id=? AND (? IS NULL OR day>=?) AND day<=?').bind(id,range.from,range.from,range.until),
  e.DB.prepare("SELECT COUNT(*) count,AVG(rating) rating FROM reviews WHERE master_id=? AND status='approved' AND evidence_status='verified'").bind(id),
  e.DB.prepare("SELECT author,rating,text,created_at FROM reviews WHERE master_id=? AND status='approved' AND evidence_status='verified' ORDER BY created_at DESC,id DESC LIMIT 5").bind(id),
  e.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(status<>'closed'),0) open,COALESCE(SUM(last_staff_version>customer_read_version),0) unread FROM support_tickets WHERE account_id=?").bind(id)
 ]);
 return {period,range,metrics:rows[0].results[0],reviews:{...rows[1].results[0],latest:rows[2].results},support:rows[3].results[0]};
}
export async function handleMasterDashboard(r,e){
 if(new URL(r.url).pathname!=='/api/profile/stats'||r.method!=='GET')return null;
 const user=await getUser(r,e,'master');if(!user)return json({error:'Войдите в кабинет мастера'},401);
 return json(await masterDashboardStats(e,user.id,new URL(r.url).searchParams.get('period')||'30'));
}

import {googleToken,googleFetch,sheetSafe} from './google.js';
import {getSetting,setSetting} from './admin-auth.js';
export const contactHeaders=['ID','Имя','Фамилия','Email','Email подтверждён','Согласие на рассылку','Можно отправлять рассылку','Дата согласия','Дата регистрации','Город','Страна','Обновлено'];
export const queueContact=(e,id)=>e.DB.prepare("INSERT INTO contact_sync_jobs(account_id) VALUES(?) ON CONFLICT(account_id) DO UPDATE SET status=CASE WHEN contact_sync_jobs.status='running' THEN 'running' ELSE 'pending' END,rerun=CASE WHEN contact_sync_jobs.status='running' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP").bind(id).run();
export const queueAllContacts=e=>e.DB.prepare("INSERT INTO contact_sync_jobs(account_id) SELECT DISTINCT account_id FROM account_registrations WHERE 1 ON CONFLICT(account_id) DO UPDATE SET status=CASE WHEN contact_sync_jobs.status='running' THEN 'running' ELSE 'pending' END,rerun=CASE WHEN contact_sync_jobs.status='running' THEN 1 ELSE 0 END,updated_at=CURRENT_TIMESTAMP").run();
const sheetId=value=>{const raw=String(value||'').trim(),id=raw.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1]||raw;if(!/^[A-Za-z0-9_-]{15,150}$/.test(id))throw Object.assign(Error('Укажите ссылку или ID Google-таблицы'),{status:400});return id};
const range=(tab,cells)=>encodeURIComponent("'"+tab.replaceAll("'","''")+"'!"+cells);
const api=(id,suffix)=>`https://sheets.googleapis.com/v4/spreadsheets/${id}${suffix}`;
async function context(e,id){const token=await googleToken(e),request=(url,options)=>googleFetch(e,url,options,token);return {id:sheetId(id),request}}
async function prepare({id,request}){
 const metadata=await request(api(id,'?fields=sheets.properties.title'));const names=(metadata.sheets||[]).map(s=>s.properties.title),tabs={};
 for(const [kind,preferred] of [['user','пользователи'],['master','Мастера']]){
  let title=names.find(n=>n.toLocaleLowerCase('ru')===preferred.toLocaleLowerCase('ru'));
  if(!title){await request(api(id,':batchUpdate'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:preferred}}}]})});title=preferred}
  const check=await request(api(id,'/values/'+range(title,'A1:L2'))),values=check.values||[];
  if(values.some(row=>row.some(Boolean))&&contactHeaders.some((label,i)=>values[0]?.[i]!==label))throw Error('Заголовки листа «'+title+'» отличаются от формата SYUCAI. Содержимое не перезаписано; используйте пустой лист или заголовки из инструкции.');
  if(!values.some(row=>row.some(Boolean)))await request(api(id,'/values/'+range(title,'A1:L1')+'?valueInputOption=RAW'),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[contactHeaders]})});
  tabs[kind]=title;
 }
 return tabs;
}
export async function configureContactSheet(e,value){const ctx=await context(e,value);await prepare(ctx);await setSetting(e,'google_contacts_sheet_id',ctx.id);await queueAllContacts(e);return {sheet:ctx.id}}
export async function syncContact(e,id,ctx,tabs){
 const rows=(await e.DB.prepare('SELECT a.id,a.email,g.registration_type,g.display_name,g.last_name,g.email_verified_at,g.newsletter_opt_in,g.newsletter_consent_at,g.created_at,p.name profile_name,p.city_name,p.country FROM accounts a JOIN account_registrations g ON g.account_id=a.id LEFT JOIN profiles p ON p.id=a.id WHERE a.id=?').bind(id).all()).results;
 for(const row of rows){
  const tab=tabs[row.registration_type],column=await ctx.request(api(ctx.id,'/values/'+range(tab,'A:A'))),found=(column.values||[]).findIndex(v=>v[0]===id),name=row.display_name||(row.registration_type==='master'?row.profile_name:'')||'';
  const eligible=!!row.email_verified_at&&row.newsletter_opt_in===1;
  const values=[[id,name,row.last_name,row.email,row.email_verified_at?'Да':'Нет',row.newsletter_opt_in?'Да':'Нет',eligible?'Да':'Нет',row.newsletter_consent_at,row.created_at,row.registration_type==='master'?row.city_name:'',row.registration_type==='master'?row.country:'',new Date().toISOString()].map(sheetSafe)];
  const url=api(ctx.id,'/values/'+range(tab,found>=1?`A${found+1}:L${found+1}`:'A:L')+(found>=1?'?valueInputOption=RAW':':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'));
  await ctx.request(url,{method:found>=1?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});
 }
}
export async function processContacts(e,max=1){
 if(!await getSetting(e,'google_tokens')||!await getSetting(e,'google_contacts_sheet_id'))return {processed:0,succeeded:0,connected:false};
 const jobs=(await e.DB.prepare("SELECT account_id FROM contact_sync_jobs WHERE status IN ('pending','error') ORDER BY updated_at,account_id LIMIT ?").bind(Math.min(3,max)).all()).results;
 if(!jobs.length)return {processed:0,succeeded:0,connected:true};let ctx,tabs,setupError;
 try{ctx=await context(e,await getSetting(e,'google_contacts_sheet_id'));tabs=await prepare(ctx)}catch(error){setupError=error}
 let succeeded=0;for(const job of jobs){const claimed=await e.DB.prepare("UPDATE contact_sync_jobs SET status='running',rerun=0,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND status IN ('pending','error') RETURNING account_id").bind(job.account_id).first();if(!claimed)continue;
  try{if(setupError)throw setupError;await syncContact(e,job.account_id,ctx,tabs);await e.DB.prepare("UPDATE contact_sync_jobs SET status=CASE WHEN rerun=1 THEN 'pending' ELSE 'done' END,rerun=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE account_id=?").bind(job.account_id).run();succeeded++}catch(error){await e.DB.prepare("UPDATE contact_sync_jobs SET status='error',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE account_id=?").bind(error.message,job.account_id).run()}
 }
 return {processed:jobs.length,succeeded,connected:true};
}

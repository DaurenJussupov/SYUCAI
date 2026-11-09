import {getSetting,setSetting,hash,hex,adminCookie,audit} from './admin-auth.js';
const encoder=new TextEncoder();
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64=value=>btoa(String.fromCharCode(...new Uint8Array(value)));
async function key(e){const secret=e.GOOGLE_TOKEN_KEY||e.ADMIN_TOKEN;if(!secret)throw Error('Не настроен ключ шифрования Google');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('syucai/google/'+secret)),'AES-GCM',false,['encrypt','decrypt'])}
export async function seal(e,value){const iv=crypto.getRandomValues(new Uint8Array(12));return JSON.stringify({iv:base64(iv),data:base64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(e),encoder.encode(JSON.stringify(value))))})}
export async function unseal(e,value){const data=JSON.parse(value);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(data.iv)},await key(e),bytes(data.data))))}
export const googleConfigured=e=>!!(e.GOOGLE_CLIENT_ID&&e.GOOGLE_CLIENT_SECRET);
const redirect=r=>new URL('/api/admin/google/callback',r.url).href;
async function tokenRequest(e,params,request=fetch){
 const r=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:e.GOOGLE_CLIENT_ID,client_secret:e.GOOGLE_CLIENT_SECRET})});
 if(!r.ok)throw Error('Google не выдал доступ. Проверьте OAuth-настройки и повторите подключение.');return r.json();
}
export async function connectGoogle(r,e){
 if(!googleConfigured(e))throw Object.assign(Error('В Cloudflare нужно добавить GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET'),{status:503});
 const cookie=adminCookie(r);if(!cookie)throw Object.assign(Error('Войдите в админ-панель повторно'),{status:401});
 const state=hex(crypto.getRandomValues(new Uint8Array(32)));
 await e.DB.prepare('DELETE FROM oauth_states WHERE expires<?').bind(Date.now()).run();
 await e.DB.prepare('INSERT INTO oauth_states VALUES(?,?,?)').bind(await hash(state),await hash(cookie),Date.now()+600000).run();
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID,redirect_uri:redirect(r),response_type:'code',access_type:'offline',prompt:'consent',state,scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/analytics.edit'});
 return url.href;
}
export async function googleCallback(r,e){
 const url=new URL(r.url),state=url.searchParams.get('state'),code=url.searchParams.get('code'),cookie=adminCookie(r);
 if(!state||!code||!cookie)throw Error('Подключение Google отменено или устарело');
 const stateHash=await hash(state);
 const consumed=await e.DB.prepare('DELETE FROM oauth_states WHERE state=? AND session=? AND expires>? RETURNING state').bind(stateHash,await hash(cookie),Date.now()).first();
 if(!consumed)throw Error('Подключение Google устарело. Повторите вход.');
 const token=await tokenRequest(e,{code,grant_type:'authorization_code',redirect_uri:redirect(r)});
 if(!token.refresh_token)throw Error('Google не выдал постоянный доступ. Повторите подключение с подтверждением разрешений.');
 await setSetting(e,'google_tokens',await seal(e,{refresh_token:token.refresh_token,access_token:token.access_token,expires:Date.now()+Number(token.expires_in)*1000}));await audit(e,'google_connected');
}
async function googleToken(e){
 const stored=await getSetting(e,'google_tokens');if(!stored)throw Error('Сначала подключите Google');const token=await unseal(e,stored);
 if(token.access_token&&token.expires>Date.now()+60000)return token.access_token;
 const next=await tokenRequest(e,{refresh_token:token.refresh_token,grant_type:'refresh_token'});const updated={...token,access_token:next.access_token,expires:Date.now()+Number(next.expires_in)*1000};
 await setSetting(e,'google_tokens',await seal(e,updated));return next.access_token;
}
async function googleFetch(e,url,options={},accessToken){
 const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${accessToken||await googleToken(e)}`,...options.headers}});
 if(!r.ok)throw Object.assign(Error(`Google вернул ошибку ${r.status}. Данные сайта сохранены, повторите синхронизацию.`),{status:r.status});return r.status===204?{}:r.json();
}
export function sheetSafe(value){const text=String(value??'');return /^[=+\-@\t\r]/.test(text)?"'"+text:text}
export async function createResources(e){
 const token=await googleToken(e),request=(url,options)=>googleFetch(e,url,options,token);
 let folder=await getSetting(e,'google_folder_id'),sheet=await getSetting(e,'google_sheet_id');
 if(!folder){const lookup=new URL('https://www.googleapis.com/drive/v3/files');lookup.searchParams.set('q',"trashed=false and appProperties has { key='syucai_resource' and value='folder' }");lookup.searchParams.set('fields','files(id)');folder=(await request(lookup)).files?.[0]?.id;if(folder)await setSetting(e,'google_folder_id',folder)}
 if(!folder){const data=await request('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'SYUCAI — анкеты и документы',mimeType:'application/vnd.google-apps.folder',appProperties:{syucai_resource:'folder'}})});folder=data.id;await setSetting(e,'google_folder_id',folder)}
 if(!sheet){const lookup=new URL('https://www.googleapis.com/drive/v3/files');lookup.searchParams.set('q',`trashed=false and '${folder}' in parents and appProperties has { key='syucai_resource' and value='sheet' }`);lookup.searchParams.set('fields','files(id)');sheet=(await request(lookup)).files?.[0]?.id;if(sheet)await setSetting(e,'google_sheet_id',sheet)}
 if(!sheet){const data=await request('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'SYUCAI — мастера',mimeType:'application/vnd.google-apps.spreadsheet',parents:[folder],appProperties:{syucai_resource:'sheet'}})});sheet=data.id;await setSetting(e,'google_sheet_id',sheet)}
 await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/A1:L1?valueInputOption=RAW`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[['ID','Имя','Email','Город','Страна','WhatsApp','Квалификация','Описание','Статус','Обновлено','Фото и дипломы','Примечание модератора']]})});
 return {folder,sheet};
}
export async function syncAccount(e,id){
 const token=await googleToken(e),request=(url,options)=>googleFetch(e,url,options,token);
 const sheet=await getSetting(e,'google_sheet_id'),folder=await getSetting(e,'google_folder_id');if(!sheet||!folder)throw Error('Создайте таблицу и папку Google');
 const p=await e.DB.prepare('SELECT a.id,a.email,p.name,p.city_id,p.country,p.phone,p.credentials,p.bio,p.status,p.updated_at,p.moderation_note FROM accounts a LEFT JOIN profiles p ON p.id=a.id WHERE a.id=?').bind(id).first();if(!p)throw Error('Аккаунт не найден');
 if(!p.name){const draft=await e.DB.prepare('SELECT data FROM profile_drafts WHERE account_id=?').bind(id).first();if(draft){try{Object.assign(p,JSON.parse(draft.data))}catch{}}}
 const files=(await e.DB.prepare('SELECT f.*,g.drive_id,g.uploaded FROM files f LEFT JOIN google_file_links g ON g.file_id=f.id WHERE f.account_id=?').bind(id).all()).results;const links=[];
 for(const f of files){let driveId=f.drive_id,uploaded=!!f.uploaded;
  if(!driveId){const generated=await request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive');driveId=generated.ids[0];await e.DB.prepare('INSERT INTO google_file_links(file_id,drive_id) VALUES(?,?)').bind(f.id,driveId).run()}
  else if(!uploaded){try{await request(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=id`);uploaded=true}catch(error){if(error.status!==404)throw error}}
  if(!uploaded){const object=await e.FILES.get(f.object_key);if(!object)throw Error('Файл отсутствует в R2. Синхронизация остановлена.');
   // Persist the generated ID before upload, so an interrupted upload can be recovered.
   const boundary='syucai_'+crypto.randomUUID();
   const metadata=JSON.stringify({id:driveId,name:`${p.name||p.id} — ${f.name}`,parents:[folder],description:`SYUCAI file ${f.id}`});
   const multipart=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${f.mime}\r\n\r\n`,await object.arrayBuffer(),`\r\n--${boundary}--`]);
   await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart});
  }
  if(!f.uploaded)await e.DB.prepare('UPDATE google_file_links SET uploaded=1 WHERE file_id=?').bind(f.id).run();
  links.push(`https://drive.google.com/file/d/${driveId}/view`);
 }
 // Resolve the account ID on every write so manually sorted rows cannot overwrite another master.
 const column=await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/A:A`);
 const found=(column.values||[]).findIndex(v=>v[0]===id),row=found>=0?found+1:null;
 const values=[[p.id,p.name,p.email,p.city_id,p.country,p.phone,p.credentials,p.bio,p.status||'not_submitted',p.updated_at,links.join('\n'),p.moderation_note].map(sheetSafe)];
 let n=row;
 if(row)await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/A${row}:L${row}?valueInputOption=RAW`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});
 else{const result=await request(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/A:L:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});
  n=Number(result.updates?.updatedRange?.match(/![A-Z]+(\d+):/)?.[1]);if(!n)throw Error('Google не подтвердил строку таблицы');
 }
 await e.DB.prepare('INSERT INTO google_sheet_rows VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET row_number=excluded.row_number').bind(id,n).run();
}
export async function processSync(e,max=1){
 const jobs=(await e.DB.prepare("SELECT account_id FROM sync_jobs WHERE status IN ('pending','error') ORDER BY updated_at LIMIT ?").bind(max).all()).results;
 let succeeded=0;for(const job of jobs){const claimed=await e.DB.prepare("UPDATE sync_jobs SET status='running',rerun=0,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND status IN ('pending','error') RETURNING account_id").bind(job.account_id).first();if(!claimed)continue;
  try{await syncAccount(e,job.account_id);await e.DB.prepare("UPDATE sync_jobs SET status=CASE WHEN rerun=1 THEN 'pending' ELSE 'done' END,rerun=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND status='running'").bind(job.account_id).run();succeeded++}catch(err){await e.DB.prepare("UPDATE sync_jobs SET status='error',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND status='running'").bind(err.message,job.account_id).run()}
 }
 return {processed:jobs.length,succeeded};
}

export async function analyticsAccounts(e){
 const token=await googleToken(e),request=(url,options)=>googleFetch(e,url,options,token);
 const data=await request('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200');
 return (data.accountSummaries||[]).map(a=>({id:a.account,name:a.displayName}));
}
export async function createAnalytics(e,{account,timeZone,siteUrl}){
 const token=await googleToken(e),request=(url,options)=>googleFetch(e,url,options,token);
 if(!/^accounts\/\d+$/.test(account||''))throw Object.assign(Error('Выберите аккаунт Google Analytics'),{status:400});
 try{new Intl.DateTimeFormat('en',{timeZone})}catch{throw Object.assign(Error('Проверьте часовой пояс'),{status:400})}
 let property=await getSetting(e,'ga_property_id');
 if(!property){const p=await request('https://analyticsadmin.googleapis.com/v1beta/properties',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parent:account,displayName:'SYUCAI',timeZone,currencyCode:'KZT'})});property=p.name.split('/')[1];await setSetting(e,'ga_property_id',property)}
 let id=await getSetting(e,'ga_measurement_id')||await getSetting(e,'ga_pending_measurement_id');
 if(!id){const existing=await request(`https://analyticsadmin.googleapis.com/v1beta/properties/${property}/dataStreams`);
  let stream=(existing.dataStreams||[]).find(s=>s.type==='WEB_DATA_STREAM'&&s.webStreamData?.defaultUri===siteUrl);
  if(!stream)stream=await request(`https://analyticsadmin.googleapis.com/v1beta/properties/${property}/dataStreams`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:'SYUCAI — сайт',type:'WEB_DATA_STREAM',webStreamData:{defaultUri:siteUrl}})});
  id=stream.webStreamData.measurementId;await setSetting(e,'ga_pending_measurement_id',id);
 }
 // Disable automatic form, search, outbound-link and history tracking: explicit safe events only.
 const streams=await request(`https://analyticsadmin.googleapis.com/v1beta/properties/${property}/dataStreams`);
 const stream=streams.dataStreams?.find(s=>s.webStreamData?.measurementId===id);
 if(!stream)throw Error('Не найден веб-поток GA4. Проверьте ID ресурса и потока.');
 await request(`https://analyticsadmin.googleapis.com/v1alpha/${stream.name}/enhancedMeasurementSettings?updateMask=streamEnabled`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:stream.name+'/enhancedMeasurementSettings',streamEnabled:false})});
 await setSetting(e,'ga_measurement_id',id);await setSetting(e,'ga_pending_measurement_id','');await setSetting(e,'ga_configured_safely','true');await audit(e,'ga_created',property);return {property,measurementId:id};
}

import { cities, rankMasters } from '../shared/cities.js';
const enc=new TextEncoder();
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
async function password(value,salt){const key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256))}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function text(v,min,max,label){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail(`Проверьте поле «${label}»`);return v.trim()}
async function body(r){if(+(r.headers.get('content-length')||0)>20000)fail('Слишком большой запрос',413);try{return await r.json()}catch{fail('Некорректный запрос')}}
async function user(r,e){const token=r.headers.get('cookie')?.match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];if(!token)return null;return e.DB.prepare('SELECT a.id,a.email FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires>?').bind(await hash(token),Date.now()).first()}
async function required(r,e){const u=await user(r,e);if(!u)fail('Войдите в аккаунт',401);return u}
async function limit(r,e,type,max=15){const ip=r.headers.get('CF-Connecting-IP')||'local',key=await hash(`${type}:${ip}:${Math.floor(Date.now()/3600000)}`);await e.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(Date.now()).run();const result=await e.DB.prepare('INSERT INTO rate_limits(key,hits,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,Date.now()+3600000).first();if(result.hits>max)fail('Слишком много попыток. Попробуйте через час.',429)}
const select='SELECT p.id,p.name,p.city_id,p.country,p.lat,p.lon,p.bio,p.credentials,p.photo,COALESCE(AVG(r.rating),0) rating,COUNT(r.id) review_count FROM profiles p LEFT JOIN reviews r ON r.master_id=p.id';
async function api(r,e){
 const url=new URL(r.url),path=url.pathname,method=r.method;
 if(!['GET','HEAD'].includes(method)){
  const origin=r.headers.get('origin');if(!origin||origin!==url.origin)fail('Запрос с другого сайта запрещён',403);
 }
 if(path==='/api/auth/register'&&method==='POST'){
  await limit(r,e,'register',8);const b=await body(r),email=text(b.email,5,254,'Email').toLowerCase(),pass=text(b.password,10,128,'Пароль');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Введите корректный email');
  const salt=crypto.randomUUID(),id=crypto.randomUUID();
  try{await e.DB.prepare('INSERT INTO accounts(id,email,password,salt) VALUES(?,?,?,?)').bind(id,email,await password(pass,salt),salt).run()}catch(err){if(String(err).includes('UNIQUE'))fail('Этот email уже зарегистрирован',409);throw err}
  return loginSession(r,e,{id,email});
 }
 if(path==='/api/auth/login'&&method==='POST'){
  await limit(r,e,'login');const b=await body(r),email=text(b.email,5,254,'Email').toLowerCase(),pass=text(b.password,1,128,'Пароль');
  const a=await e.DB.prepare('SELECT * FROM accounts WHERE email=?').bind(email).first();const digest=await password(pass,a?.salt||'unknown-account-salt');
  if(!a||!equal(digest,a.password))fail('Неверный email или пароль',401);return loginSession(r,e,a);
 }
 if(path==='/api/auth/logout'&&method==='POST'){const token=r.headers.get('cookie')?.match(/(?:^|;\s*)session=([a-f0-9]+)/)?.[1];if(token)await e.DB.prepare('DELETE FROM sessions WHERE token=?').bind(await hash(token)).run();return json({ok:true},200,{'Set-Cookie':cookie(r,'',0)})}
 if(path==='/api/me'&&method==='GET'){const u=await user(r,e);if(!u)return json({user:null});return json({user:u,profile:await e.DB.prepare('SELECT * FROM profiles WHERE id=?').bind(u.id).first(),files:(await e.DB.prepare('SELECT id,kind,mime,name FROM files WHERE account_id=?').bind(u.id).all()).results})}
 if(path==='/api/profile'&&method==='PUT'){
  const u=await required(r,e),b=await body(r),city=cities.find(c=>c.id===b.city_id);if(!city)fail('Выберите город из списка');
  const name=text(b.name,3,100,'Имя'),bio=text(b.bio,80,4000,'Описание'),credentials=text(b.credentials,5,1000,'Квалификация'),phone=text(b.phone,10,16,'WhatsApp').replace(/^\+/,'');if(!/^\d{10,15}$/.test(phone))fail('Телефон: от 10 до 15 цифр с кодом страны');
  const files=(await e.DB.prepare('SELECT * FROM files WHERE account_id=?').bind(u.id).all()).results;
  const photo=files.find(f=>f.kind==='photo');if(!photo||!files.some(f=>f.kind==='document'))fail('Загрузите фото и хотя бы один диплом');
  await e.DB.prepare(`INSERT INTO profiles(id,name,city_id,country,lat,lon,bio,credentials,phone,photo,status) VALUES(?,?,?,?,?,?,?,?,?,?,'pending') ON CONFLICT(id) DO UPDATE SET name=excluded.name,city_id=excluded.city_id,country=excluded.country,lat=excluded.lat,lon=excluded.lon,bio=excluded.bio,credentials=excluded.credentials,phone=excluded.phone,photo=excluded.photo,status='pending',updated_at=CURRENT_TIMESTAMP`).bind(u.id,name,city.id,city.country,city.lat,city.lon,bio,credentials,phone,photo.id).run();return json({ok:true,status:'pending'});
 }
 if(path==='/api/files'&&method==='POST'){
  const u=await required(r,e);await limit(r,e,'upload',40);
  if(+(r.headers.get('content-length')||0)>6*1024*1024)fail('Максимальный размер файла — 5 МБ',413);
  const form=await r.formData(),file=form.get('file'),kind=form.get('kind');if(!(file instanceof File)||!['photo','document'].includes(kind))fail('Выберите файл');
  if(file.size>5*1024*1024||!file.size)fail('Размер файла: до 5 МБ',413);
  const allowed=kind==='photo'?['image/jpeg','image/png','image/webp']:['application/pdf','image/jpeg','image/png'];if(!allowed.includes(file.type))fail('Поддерживаются JPG, PNG, WebP (фото) и PDF (дипломы)');
  const buffer=await file.arrayBuffer(),a=new Uint8Array(buffer),sig=String.fromCharCode(...a.slice(0,12));
  const valid=file.type==='image/jpeg'?a[0]===255&&a[1]===216&&a[2]===255:file.type==='image/png'?a[0]===137&&sig.slice(1,4)==='PNG':file.type==='application/pdf'?sig.startsWith('%PDF-'):sig.startsWith('RIFF')&&sig.slice(8,12)==='WEBP';if(!valid)fail('Содержимое файла не соответствует формату');
  const count=await e.DB.prepare('SELECT COUNT(*) n FROM files WHERE account_id=? AND kind=?').bind(u.id,kind).first();if(kind==='document'&&count.n>=5)fail('Можно загрузить до 5 документов');
  const id=crypto.randomUUID(),key=`${u.id}/${id}`;await e.FILES.put(key,buffer,{httpMetadata:{contentType:file.type}});
  const old=kind==='photo'?(await e.DB.prepare("SELECT * FROM files WHERE account_id=? AND kind='photo'").bind(u.id).all()).results:[];
  await e.DB.batch([e.DB.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').bind(id,u.id,kind,key,file.type,file.name.slice(0,160)),e.DB.prepare("UPDATE profiles SET status='pending' WHERE id=?").bind(u.id)]);
  for(const f of old){await e.DB.prepare('DELETE FROM files WHERE id=?').bind(f.id).run();await e.FILES.delete(f.object_key)}
  return json({id,kind,name:file.name},201);
 }
 if(path.startsWith('/api/files/')&&method==='GET'){
  const id=path.slice('/api/files/'.length),file=await e.DB.prepare('SELECT * FROM files WHERE id=?').bind(id).first();if(!file)fail('Файл не найден',404);
  const p=file.kind==='photo'?await e.DB.prepare("SELECT id FROM profiles WHERE photo=? AND status='approved'").bind(id).first():null;
  if(!p && !(e.ADMIN_TOKEN && equal(r.headers.get('authorization')||'',`Bearer ${e.ADMIN_TOKEN}`))){const u=await required(r,e);if(u.id!==file.account_id)fail('Нет доступа',403)}
  const obj=await e.FILES.get(file.object_key);if(!obj)fail('Файл не найден',404);
  return new Response(obj.body,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':file.kind==='document'?'attachment':'inline'}});
 }
 if(path==='/api/masters'&&method==='GET'){
  const city=cities.find(c=>c.id===url.searchParams.get('city'));if(!city)fail('Выберите город из списка');
  const rows=(await e.DB.prepare(select+" WHERE p.status='approved' AND p.country=? GROUP BY p.id").bind(city.country).all()).results;
  return json({masters:rankMasters(rows,city),city});
 }
 const match=path.match(/^\/api\/masters\/([a-f0-9-]+)(\/reviews)?$/);
 if(match){const id=match[1],p=await e.DB.prepare(select+" WHERE p.status='approved' AND p.id=? GROUP BY p.id").bind(id).first();if(!p)fail('Мастер не найден',404);
  if(method==='GET'&&!match[2]){const contact=await e.DB.prepare('SELECT phone FROM profiles WHERE id=?').bind(id).first();const reviews=(await e.DB.prepare('SELECT id,author,rating,text,created_at FROM reviews WHERE master_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all()).results;return json({...p,phone:contact.phone,reviews})}
  if(method==='POST'&&match[2]){const u=await required(r,e);if(u.id===id)fail('Нельзя оставить отзыв о себе');await limit(r,e,'review',10);const b=await body(r),rating=Number(b.rating),author=text(b.author,2,70,'Ваше имя'),review=text(b.text,20,1500,'Отзыв');if(!Number.isInteger(rating)||rating<1||rating>5)fail('Оценка от 1 до 5');try{await e.DB.prepare('INSERT INTO reviews(id,master_id,author_id,author,rating,text) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,u.id,author,rating,review).run()}catch(err){if(String(err).includes('UNIQUE'))fail('Вы уже оставили отзыв',409);throw err}return json({ok:true},201)}
 }
 if(path==='/api/admin/profiles'&&method==='GET'){
  if(!e.ADMIN_TOKEN||!equal(r.headers.get('authorization')||'',`Bearer ${e.ADMIN_TOKEN}`))fail('Нет доступа',403);
  const profiles=(await e.DB.prepare('SELECT p.*,a.email FROM profiles p JOIN accounts a ON a.id=p.id ORDER BY p.updated_at DESC LIMIT 200').all()).results;
  for(const p of profiles)p.files=(await e.DB.prepare('SELECT id,kind,name FROM files WHERE account_id=?').bind(p.id).all()).results;
  return json({profiles});
 }
 if(path==='/api/admin/moderate'&&method==='POST'){
  if(!e.ADMIN_TOKEN||!equal(r.headers.get('authorization')||'',`Bearer ${e.ADMIN_TOKEN}`))fail('Нет доступа',403);const b=await body(r);if(!['approved','rejected'].includes(b.status))fail('Недопустимый статус');
  const p=await e.DB.prepare('SELECT * FROM profiles WHERE id=?').bind(b.id).first();if(!p)fail('Анкета не найдена',404);await e.DB.prepare('UPDATE profiles SET status=? WHERE id=?').bind(b.status,b.id).run();return json({ok:true});
 }
 fail('Не найдено',404);
}
function cookie(r,token,age=604800){return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`}
async function loginSession(r,e,a){const token=hex(crypto.getRandomValues(new Uint8Array(32)));await e.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()).run();await e.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await hash(token),a.id,Date.now()+604800000).run();return json({user:{id:a.id,email:a.email}},200,{'Set-Cookie':cookie(r,token)})}
export default {async fetch(r,e){let response;try{response=new URL(r.url).pathname.startsWith('/api/')?await api(r,e):await e.ASSETS.fetch(r)}catch(err){if(!err.status)console.error('Request failed:',err.message);response=json({error:err.status?err.message:'Сервис временно недоступен. Попробуйте ещё раз.'},err.status||500)}const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Frame-Options','DENY');headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers})}};

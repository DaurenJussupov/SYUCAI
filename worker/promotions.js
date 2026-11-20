import {json,audit} from './admin-auth.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export const expirePromotions=e=>e.DB.prepare("UPDATE promotions SET status='completed' WHERE status='active' AND ends_at<=CURRENT_TIMESTAMP").run();
export async function ownPromotions(e,id){
 await expirePromotions(e);
 return (await e.DB.prepare('SELECT id,days,status,created_at,starts_at,ends_at,moderation_note FROM promotions WHERE master_id=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(id).all()).results;
}
export async function handlePromotions(r,e,{required,body,limit}){
 if(new URL(r.url).pathname!=='/api/promotions')return null;
 const owner=await required(r,e);
 if(r.method==='GET')return json({promotions:await ownPromotions(e,owner.id)});
 if(r.method!=='POST')return json({error:'Метод не поддерживается'},405);
 await limit(r,e,'promotion',10);const data=await body(r);
 if(!data||!Number.isInteger(data.days)||data.days<1||data.days>30)fail('Выберите срок продвижения от 1 до 30 дней');
 const profile=await e.DB.prepare('SELECT status FROM profiles WHERE id=?').bind(owner.id).first();
 if(profile?.status!=='approved')fail('Продвижение доступно после публикации анкеты');
 await expirePromotions(e);const id=crypto.randomUUID();
 try{await e.DB.prepare('INSERT INTO promotions(id,master_id,days) VALUES(?,?,?)').bind(id,owner.id,data.days).run()}catch(error){if(String(error).includes('UNIQUE'))fail('У Вас уже есть заявка или активное продвижение',409);throw error}
 return json({ok:true,id,status:'pending'},201);
}
export async function listPromotionRequests(e){
 await expirePromotions(e);
 return (await e.DB.prepare("SELECT b.*,p.name,p.city_id,p.city_name,p.country_code,p.status profile_status,a.email FROM promotions b JOIN profiles p ON p.id=b.master_id JOIN accounts a ON a.id=p.id ORDER BY CASE b.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,b.created_at DESC LIMIT 200").all()).results;
}
export async function moderatePromotion(e,data){
 const {id,action}=data||{};if(typeof id!=='string'||!['activate','reject','cancel'].includes(action))fail('Проверьте действие с продвижением');
 await expirePromotions(e);
 const request=await e.DB.prepare('SELECT b.*,p.status profile_status FROM promotions b JOIN profiles p ON p.id=b.master_id WHERE b.id=?').bind(id).first();if(!request)fail('Заявка не найдена',404);
 const note=typeof data.note==='string'?data.note.trim().slice(0,1000):'';
 let changed;
 if(action==='activate'){
  if(request.profile_status!=='approved')fail('Для продвижения анкета должна быть опубликована');
  changed=await e.DB.prepare("UPDATE promotions SET status='active',starts_at=CURRENT_TIMESTAMP,ends_at=datetime('now','+'||days||' days'),moderation_note=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM profiles WHERE id=promotions.master_id AND status='approved') RETURNING id").bind(note,id).first();
 }else changed=await e.DB.prepare(`UPDATE promotions SET status=?,moderation_note=? WHERE id=? AND status=? RETURNING id`).bind(action==='reject'?'rejected':'cancelled',note,id,action==='reject'?'pending':'active').first();
 if(!changed)fail('Статус заявки уже изменился. Обновите список.',409);
 await audit(e,'promotion_'+action,id);return {ok:true};
}

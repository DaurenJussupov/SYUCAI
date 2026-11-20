import {countryCode,countryName} from './countries.js';
// Optional offline suggestions, never a restriction on which city can be entered.
export const cities = [
 ['almaty','Алматы','Казахстан',43.24,76.89],['astana','Астана','Казахстан',51.17,71.43],['shymkent','Шымкент','Казахстан',42.32,69.59],['karaganda','Караганда','Казахстан',49.8,73.1],['aktobe','Актобе','Казахстан',50.28,57.17],['atyrau','Атырау','Казахстан',47.1,51.92],['aktau','Актау','Казахстан',43.65,51.2],['kyzylorda','Кызылорда','Казахстан',44.85,65.5],['taraz','Тараз','Казахстан',42.9,71.37],['pavlodar','Павлодар','Казахстан',52.29,76.97],['semey','Семей','Казахстан',50.41,80.25],['oskemen','Усть-Каменогорск','Казахстан',49.95,82.61],['kostanay','Костанай','Казахстан',53.21,63.63],['oral','Уральск','Казахстан',51.23,51.37],['petropavl','Петропавловск','Казахстан',54.87,69.15],['kokshetau','Кокшетау','Казахстан',53.28,69.38],['turkistan','Туркестан','Казахстан',43.3,68.27],
 ['moscow','Москва','Россия',55.75,37.62],['spb','Санкт-Петербург','Россия',59.93,30.31],['kazan','Казань','Россия',55.8,49.1],['novosibirsk','Новосибирск','Россия',55.03,82.92],['sochi','Сочи','Россия',43.6,39.73],['yekaterinburg','Екатеринбург','Россия',56.84,60.6],['omsk','Омск','Россия',54.99,73.37],['ufa','Уфа','Россия',54.74,55.97],['tashkent','Ташкент','Узбекистан',41.3,69.24],['samarkand','Самарканд','Узбекистан',39.65,66.96],['bishkek','Бишкек','Кыргызстан',42.87,74.6],['osh','Ош','Кыргызстан',40.53,72.8],['dushanbe','Душанбе','Таджикистан',38.56,68.79],['baku','Баку','Азербайджан',40.41,49.87],['tbilisi','Тбилиси','Грузия',41.72,44.83],['yerevan','Ереван','Армения',40.18,44.51],['minsk','Минск','Беларусь',53.9,27.56],['kyiv','Киев','Украина',50.45,30.52],['dubai','Дубай','ОАЭ',25.2,55.27],['abudhabi','Абу-Даби','ОАЭ',24.45,54.38],['istanbul','Стамбул','Турция',41.01,28.98],['antalya','Анталья','Турция',36.9,30.7],['london','Лондон','Великобритания',51.51,-0.13],['berlin','Берлин','Германия',52.52,13.41],['paris','Париж','Франция',48.86,2.35],['newyork','Нью-Йорк','США',40.71,-74.01],['toronto','Торонто','Канада',43.65,-79.38],['seoul','Сеул','Южная Корея',37.57,126.98],['bangkok','Бангкок','Таиланд',13.76,100.5],['bali','Денпасар','Индонезия',-8.65,115.22]
].map(([id,name,country,lat,lon])=>({id,name,country,country_code:countryCode(country),lat,lon}));
export const normalizeCity=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu,'');
const cityAliases={spb:['Saint Petersburg','St Petersburg','Санкт Петербург'],newyork:['NYC','New York City'],kyiv:['Kiev'],bali:['Bali'],abudhabi:['Abu Dhabi'],oskemen:['Oskemen','Ust Kamenogorsk'],oral:['Uralsk']};
export function stripCountry(value,code){
 const text=String(value||'').trim(),parts=text.split(',');
 return parts.length>1&&countryCode(parts.at(-1))===code?parts.slice(0,-1).join(',').trim():text;
}
export function findCity(value,code=''){
 code=code||countryCode(String(value||'').split(',').at(-1));
 const key=normalizeCity(stripCountry(value,code));
 return cities.find(c=>(!code||c.country_code===code)&&[c.id,c.name,...(cityAliases[c.id]||[])].some(name=>normalizeCity(name)===key));
}
export function profileLocation(profile={}){
 const known=cities.find(c=>c.id===(profile.city_id||profile.id)),code=countryCode(profile.country_code||profile.country)||known?.country_code||'';
 return {id:profile.city_id||known?.id||'',name:profile.city_name||known?.name||'',country_code:code,country:countryName(code),lat:profile.coordinates_known===0?null:profile.lat??known?.lat??null,lon:profile.coordinates_known===0?null:profile.lon??known?.lon??null};
}
const hasCoordinates=p=>p.coordinates_known!==0&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&typeof p.lon==='number'&&Number.isFinite(p.lon);
export function distance(a,b){const rad=x=>x*Math.PI/180;const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;return Math.round(6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)))}
export function rankMasters(masters,city){
 const code=countryCode(city.country_code||city.country),key=normalizeCity(city.name||city.city_name);
 return masters.filter(m=>countryCode(m.country_code||m.country)===code).map(m=>{
  const location=profileLocation(m),same=!!key&&(city.id===location.id||normalizeCity(location.name)===key||findCity(location.name,code)?.id===city.id);
  return {...m,same_city:same,distance:same?0:hasCoordinates(city)&&hasCoordinates(location)?distance(city,location):null};
 }).sort((a,b)=>Number(b.same_city)-Number(a.same_city)||(a.distance??Infinity)-(b.distance??Infinity)||Number(b.promoted||0)-Number(a.promoted||0)||a.id.localeCompare(b.id));
}

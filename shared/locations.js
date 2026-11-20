import {countryName,validCountryCode} from './countries.js';
import {cities,findCity,normalizeCity,stripCountry} from './cities.js';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
export function resolveLocation(data,{requireCity=true}={}){
 const code=data?.country_code;if(!validCountryCode(code))fail('Выберите страну');
 const known=cities.find(c=>c.id===data.city_id&&c.country_code===code);
 const name=stripCountry(typeof data.city_name==='string'?data.city_name:known?.name||'',code).replace(/\s+/gu,' ').trim();
 if(!name&&!requireCity)return {id:'',name:'',country_code:code,country:countryName(code),lat:null,lon:null};
 if(!name)fail('Введите город');
 if(name.length>120||!/[\p{L}]/u.test(name)||/[<>\p{Cc}\p{Cf}]/u.test(name))fail('Введите корректное название города');
 const match=findCity(name,code);
 return {id:match?.id||`custom:${code}:${normalizeCity(name)}`,name,country_code:code,country:countryName(code),lat:match?.lat??null,lon:match?.lon??null};
}

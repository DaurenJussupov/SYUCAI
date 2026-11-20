import {sortedCountries,countryName,countryCode} from '../shared/countries.js';
import {cities,findCity,normalizeCity,profileLocation} from '../shared/cities.js';
import {resolveLocation} from '../shared/locations.js';
import {currentLanguage,translateText} from './i18n/runtime.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countryId=id=>id.replace(/-city$/,'-country');
const options=code=>`<option value="">${escape(translateText('Выберите страну'))}</option>`+sortedCountries(currentLanguage()).map(c=>`<option data-i18n-skip value="${c.code}" ${code===c.code?'selected':''}>${escape(c.name)}</option>`).join('');
export function locationFields(id,value='',{cityRequired=true}={}){
 const location=typeof value==='string'?profileLocation({city_id:value}):profileLocation(value);
 const name=typeof value==='object'?(value.city_name||value.city_text||location.name):location.name;
 return `<div class="location-fields" data-location="${id}"><label class="form-label" for="${countryId(id)}">Страна<select class="control" id="${countryId(id)}" name="country_code" required autocomplete="country">${options(location.country_code)}</select></label><label class="form-label" for="${id}">Ваш город<input id="${id}" class="control" name="city_name" list="${id}-suggestions" placeholder="Введите город" value="${escape(name)}" ${cityRequired?'required':''} maxlength="120" autocomplete="address-level2"><datalist id="${id}-suggestions"></datalist></label>${cityRequired?'':'<p class="fineprint">Город необязателен. Можно найти мастеров по всей стране.</p>'}</div>`;
}
function matchInput(input,code){return findCity(input.value,code)||cities.find(c=>(!code||c.country_code===code)&&normalizeCity(translateText(c.name))===normalizeCity(input.value))}
function suggestions(id){
 const select=document.getElementById(countryId(id)),list=document.getElementById(id+'-suggestions');if(!select||!list)return;
 list.innerHTML=cities.filter(c=>!select.value||c.country_code===select.value).map(c=>`<option value="${escape(translateText(c.name))}"></option>`).join('');
}
export function mountLocation(id){
 const input=document.getElementById(id),select=document.getElementById(countryId(id));if(!input||!select)return;
 input.addEventListener('input',()=>{if(!select.value){const known=matchInput(input,'');if(known){select.value=known.country_code;suggestions(id)}}});
 select.addEventListener('change',()=>suggestions(id));suggestions(id);
}
export function readLocation(id,{requireCity=true}={}){
 const input=document.getElementById(id),select=document.getElementById(countryId(id));
 const known=matchInput(input,select.value);
 // Send the known canonical spelling when a translated offline suggestion is used.
 const raw=input.value.trim(),name=known&&normalizeCity(raw)===normalizeCity(translateText(known.name))?known.name:raw;
 return resolveLocation({country_code:select.value,city_name:name},{requireCity});
}
export const locationPayload=location=>({city_id:location.id,city_name:location.name,country_code:location.country_code});
export function locationLabel(profile){
 const location=profileLocation(profile);
 return `<span data-i18n-skip>${escape(location.name)}</span>${location.name?' · ':''}<span data-location-country="${location.country_code}" data-i18n-skip>${escape(countryName(location.country_code,currentLanguage()))}</span>`;
}
export function refreshLocations(){
 for(const root of document.querySelectorAll('[data-location]')){const id=root.dataset.location,select=document.getElementById(countryId(id)),value=select.value;select.innerHTML=options(value);suggestions(id)}
 for(const span of document.querySelectorAll('[data-location-country]'))span.textContent=countryName(countryCode(span.dataset.locationCountry),currentLanguage());
}

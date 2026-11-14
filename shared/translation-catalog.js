// An exact source string is its own version. Changes elsewhere must not invalidate it.
const placeholders=text=>(text.match(/\{\d+\}/g)||[]).sort().join('|');
export function catalogTranslations(catalog,source,locale){
 if(catalog?.locale!==locale||!catalog.translations||typeof catalog.translations!=='object')return {};
 return Object.fromEntries(source.strings.filter(key=>{
  const value=catalog.translations[key];
  return typeof value==='string'&&value.trim().length>0&&placeholders(value)===placeholders(key)&&!/<\/?(?:script|iframe|img|svg)\b/i.test(value);
 }).map(key=>[key,catalog.translations[key]]));
}
export function catalogState(catalog,source,locale){
 const translations=catalogTranslations(catalog,source,locale),translated=Object.keys(translations).length,total=source.strings.length;
 return {translations,translated,total,status:translated===total?'ready':translated?'partial':'unavailable'};
}

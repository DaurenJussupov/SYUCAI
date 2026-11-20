// ISO 3166-1 countries and territories. This is a geographic directory,
// not a claim about where the institute has deposited its methodology.
export const countryCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const codes=new Set(countryCodes),displayNames=new Map();
const legacy={US:'США',AE:'ОАЭ',GB:'Великобритания',KG:'Кыргызстан',KR:'Южная Корея'};
export const validCountryCode=value=>typeof value==='string'&&codes.has(value);
export function countryName(code,locale='ru'){
 if(!validCountryCode(code))return '';
 if(locale==='ru'&&legacy[code])return legacy[code];
 if(!displayNames.has(locale)){try{displayNames.set(locale,new Intl.DisplayNames([locale,'en'],{type:'region'}))}catch{displayNames.set(locale,new Intl.DisplayNames(['en'],{type:'region'}))}}
 return displayNames.get(locale).of(code);
}
const normalize=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase('en');
const aliases=new Map();
for(const code of countryCodes){for(const locale of ['ru','en'])aliases.set(normalize(countryName(code,locale)),code);aliases.set(normalize(code),code)}
for(const [name,code] of Object.entries({'Соединённые Штаты':'US','Соединенные Штаты Америки':'US','United States of America':'US','USA':'US','UK':'GB','Киргизия':'KG','Республика Корея':'KR','Объединённые Арабские Эмираты':'AE'}))aliases.set(normalize(name),code);
export const countryCode=value=>aliases.get(normalize(value))||'';
export const sortedCountries=(locale='ru')=>countryCodes.map(code=>({code,name:countryName(code,locale)})).sort((a,b)=>a.name.localeCompare(b.name,locale));

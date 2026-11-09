// Russian labels provide a predictable alphabetical order in the original interface.
export const languages = [
 ['ru','Русский','Русский','RU','ru'],
 ['en','Английский','English','ENG','gb'],
 ['de','Немецкий','Deutsch','DE','de'],
 ['fr','Французский','Français','FR','fr'],
 ['ko','Корейский','한국어','KR','kr'],
 ['zh-CN','Китайский','简体中文','CN','cn'],
 ['es','Испанский','Español','ES','es'],
 ['pt','Португальский','Português','PT','pt'],
 ['pl','Польский','Polski','PL','pl'],
 ['cs','Чешский','Čeština','CZ','cz'],
 ['hy','Армянский','Հայերեն','AM','am'],
 ['ka','Грузинский','ქართული','GE','ge'],
 ['az','Азербайджанский','Azərbaycanca','AZ','az'],
 ['tr','Турецкий','Türkçe','TR','tr'],
 ['kk','Казахский','Қазақша','KZ','kz'],
 ['ky','Киргизский','Кыргызча','KG','kg'],
 ['tg','Таджикский','Тоҷикӣ','TJ','tj'],
 ['tk','Туркменский','Türkmençe','TM','tm'],
 ['ja','Японский','日本語','JP','jp'],
 ['sk','Словацкий','Slovenčina','SK','sk'],
 ['ro-MD','Молдавский','Română (Moldova)','MD','md'],
 ['be','Белорусский','Беларуская','BY','by'],
 ['sv','Шведский','Svenska','SE','se'],
 ['nl','Нидерландский','Nederlands','NL','nl'],
 ['tt','Татарский','Татарча','TAT','ru'],
 ['ce','Чеченский','Нохчийн','CHE','ru'],
 ['inh','Ингушский','ГӀалгӀай','ING','ru'],
 ['ar','Арабский','العربية','AR','sa'],
 ['hi','Хинди','हिन्दी','HI','in'],
 ['it','Итальянский','Italiano','IT','it'],
 ['uk','Украинский','Українська','UKR','ua'],
 ['fa','Персидский','فارسی','FA','ir'],
 ['uz','Узбекский','Oʻzbekcha','UZ','uz'],
 ['hu','Венгерский','Magyar','HU','hu'],
 ['el','Греческий','Ελληνικά','GR','gr']
].map(([code,ru,native,short,flag])=>({code,ru,native,short,flag,dir:['ar','fa'].includes(code)?'rtl':'ltr',target:code==='ro-MD'?'ro':code}));
export const languageByCode = code => languages.find(l=>l.code===code);
export function languageName(language, locale='ru') {
 if(locale==='ru')return language.ru;
 if(language.code==='ro-MD')return language.native;
 try{return new Intl.DisplayNames([locale],{type:'language'}).of(language.code)||language.native}catch{return language.native}
}
export function sortedLanguages(locale='ru') {
 const collator=new Intl.Collator(locale,{sensitivity:'base'});
 return [...languages].sort((a,b)=>collator.compare(languageName(a,locale),languageName(b,locale)));
}

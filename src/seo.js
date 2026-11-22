import {seoPages,guideQuestions} from '../shared/seo-content.js';
import {SITE_ORIGIN,basePath,localePath,publicRoute} from '../shared/site-routing.js';
import {currentLanguage,translateText,languageReady,readyLocaleCodes} from './i18n/runtime.js';
const metadata=new Map();
function set(selector,attrs){let el=document.head.querySelector(selector);if(!el){el=document.createElement(selector.startsWith('link')?'link':'meta');document.head.append(el)}for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el}
export function updateSeo(data={}){
 const path=basePath(location.pathname);if(Object.keys(data).length)metadata.set(path,data);data=metadata.get(path)||data;
 const locale=currentLanguage(),definition=seoPages[path],t=translateText,isPublic=publicRoute(path),article=/^\/blog\/.+/.test(path),canonical=SITE_ORIGIN+localePath(path,article?'ru':locale),title=data.title?data.title+' — SYUCAI':definition?t(definition.title):document.title,description=data.description||(definition?t(definition.description):'');
 const eligible=languageReady(locale)&&location.hostname==='syucai.me';document.title=title;
 set('link[rel=canonical]',{rel:'canonical',href:canonical});set('meta[name=description]',{name:'description',content:description});set('meta[name=robots]',{name:'robots',content:eligible&&isPublic&&(!article||locale==='ru')?'index,follow,max-image-preview:large':'noindex,follow'});
 for(const [property,content] of Object.entries({'og:title':title,'og:description':description,'og:url':canonical,'og:type':data.type||'website','og:image':data.image||SITE_ORIGIN+'/logo.PNG','og:site_name':'SYUCAI'}))set(`meta[property="${property}"]`,{property,content});set('meta[name="twitter:card"]',{name:'twitter:card',content:'summary_large_image'});
 const schema={'@type':path==='/guide'?'FAQPage':'WebPage',name:title,description,url:canonical,inLanguage:article?'ru':locale,...(path==='/guide'?{mainEntity:guideQuestions.map(([q,a])=>({'@type':'Question',name:t(q),acceptedAnswer:{'@type':'Answer',text:t(a)}}))}:{})};
 const rich=data.schema?{...data.schema,url:canonical}:path==='/'?{'@type':'WebApplication',name:'SYUCAI',url:canonical,applicationCategory:'LifestyleApplication',operatingSystem:'Web browser',offers:{'@type':'Offer',price:'0',priceCurrency:'KZT'}}:null;
 const graph=[{'@type':'Organization','@id':SITE_ORIGIN+'/#organization',name:'Syucai Training Institute LLC',url:SITE_ORIGIN,logo:SITE_ORIGIN+'/logo.PNG'},{'@type':'WebSite',name:'SYUCAI',url:SITE_ORIGIN},schema,...(rich?[rich]:[])];
 let script=document.querySelector('#seo-structured-data');if(!script){script=document.createElement('script');script.id='seo-structured-data';script.type='application/ld+json';document.head.append(script)}script.textContent=JSON.stringify({'@context':'https://schema.org','@graph':graph});
 for(const el of document.querySelectorAll('link[rel=alternate][hreflang]'))el.remove();
 if(isPublic&&languageReady(locale)){const codes=article?['ru']:readyLocaleCodes();for(const code of [...codes,'x-default']){const el=document.createElement('link');el.rel='alternate';el.hreflang=code;el.href=SITE_ORIGIN+localePath(path,code==='x-default'?'ru':code);document.head.append(el)}}
}

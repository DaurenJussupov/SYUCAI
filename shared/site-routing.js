import {languages,languageByCode} from '../src/i18n/languages.js';
export const SITE_ORIGIN='https://syucai.me';
export function splitLocale(pathname){const clean=String(pathname||'/').split('?')[0],parts=clean.split('/').filter(Boolean),language=languageByCode(parts[0]);return {locale:language?.code||null,path:('/'+(language?parts.slice(1):parts).join('/'))||'/'};}
export function publicRoute(path){const p=splitLocale(path).path;return ['/','/about','/masters','/blog','/calendar','/privacy','/guide'].includes(p)||/^\/blog\/[a-z0-9-]+$/.test(p)||/^\/masters\/[a-f0-9-]{36}$/.test(p);}
export function localePath(value,locale='ru'){const u=new URL(value,SITE_ORIGIN);if(u.origin!==SITE_ORIGIN)return value;const path=splitLocale(u.pathname).path;return (publicRoute(path)&&locale!=='ru'?'/'+locale+(path==='/'?'/':path):path)+u.search+u.hash;}
export function readyLanguages(manifest){return languages.filter(l=>l.code==='ru'||manifest?.languages?.[l.code]?.status==='ready');}
export const basePath=value=>splitLocale(value).path;

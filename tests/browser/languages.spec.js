import {test,expect} from '@playwright/test';
import source from '../../src/i18n/source.json' with {type:'json'};
import {languages,sortedLanguages} from '../../src/i18n/languages.js';
// Synthetic catalogs exercise rendering and input safety without claiming to validate provider quality.
const labels={en:{'Введите дату рождения':'Enter your date of birth','Введите название / имя':'Enter a name / title','Рассчитать':'Calculate','Результаты расчёта':'Calculation results','О SYUCAI':'About SYUCAI','Личный день':'Personal day','Число имени':'Name number','Найти язык':'Find a language','Язык сайта':'Site language','Изменить данные':'Edit details','Перевод обновляется. Часть новых текстов пока отображается на русском.':'Translation is updating. Some new text is temporarily shown in Russian.'},de:{'Введите дату рождения':'Geburtsdatum eingeben','Рассчитать':'Berechnen','Результаты расчёта':'Berechnungsergebnisse'},ar:{'Введите дату рождения':'أدخل تاريخ الميلاد','Рассчитать':'احسب'},fa:{'Введите дату рождения':'تاریخ تولد را وارد کنید','Рассчитать':'محاسبه'}};
function catalog(locale){return {locale,status:'ready',sourceHash:source.sourceHash,translations:Object.fromEntries(source.strings.map((s,i)=>[s,labels[locale]?.[s]||`${locale} text ${i}${(s.match(/\{\d+\}/g)||[]).join(' ')}`]))}}
async function mockTranslations(page){
 await page.route('**/i18n/manifest.json*',r=>r.fulfill({json:{sourceHash:source.sourceHash,languages:Object.fromEntries(languages.map(l=>[l.code,{status:'ready'}]))}}));
 await page.route(/\/i18n\/(?!manifest)[^/?]+\.json/,r=>{const code=new URL(r.request().url()).pathname.split('/').at(-1).replace('.json','');return r.fulfill({json:catalog(code)})});
}
test('language picker is before burger, lists every language once in alphabetical order and filters',async({page})=>{
 await mockTranslations(page);await page.goto('/');
 await page.locator('#language-button').click();await expect(page.locator('.language-option')).toHaveCount(35);
 expect(await page.locator('.language-option').evaluateAll(nodes=>nodes.map(n=>n.dataset.language))).toEqual(sortedLanguages().map(l=>l.code));
 const position=await page.evaluate(()=>({language:document.querySelector('#language-button').getBoundingClientRect().right,burger:document.querySelector('.menu-button').getBoundingClientRect().left}));expect(position.language).toBeLessThan(position.burger);
 await page.locator('#language-search').fill('KZ');await expect(page.locator('.language-option')).toHaveCount(1);await expect(page.locator('.language-option')).toHaveAttribute('data-language','kk');
 await page.keyboard.press('Escape');await expect(page.locator('#language-panel')).toBeHidden();await expect(page.locator('#language-button')).toBeFocused();
});
test('switching and restoring language preserves entered values, routes, calculations and selected locale',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockTranslations(page);await page.goto('/');
 await page.locator('#birth').fill('24091987');await page.locator('#name').fill('Anna');
 await page.locator('#language-button').click();await page.locator('[data-language=en]').click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('label[for=birth]')).toHaveText('Enter your date of birth');
 await expect(page.locator('#birth')).toHaveValue('24.09.1987');await expect(page.locator('#name')).toHaveValue('Anna');
 await page.getByRole('button',{name:'Calculate',exact:true}).click();await expect(page.locator('h1')).toHaveText('Calculation results');await expect(page.locator('[data-result=name] .number')).toHaveText('3');
 expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.locator('#name').fill('Anna');await page.getByRole('button',{name:'Calculate',exact:true}).click();await expect(page.locator('[data-result=name] .number')).toHaveText('3');
 await page.locator('#language-button').click();await page.locator('[data-language=ru]').click();await expect(page.locator('h1')).toHaveText('Результаты расчёта');
 expect(errors).toEqual([]);
});
test('Arabic and Persian set RTL without losing form data or causing mobile overflow',async({page})=>{
 await mockTranslations(page);await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#name').fill('Anna');
 for(const locale of ['ar','fa']){
  await page.locator('#language-button').click();await page.locator(`[data-language=${locale}]`).click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.locator('html')).toHaveAttribute('lang',locale);await expect(page.locator('#name')).toHaveValue('Anna');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.locator('.menu-button').click();await expect(page.locator('#language-panel')).toBeHidden();await expect(page.locator('nav')).toBeVisible();
});
test('unavailable or stale catalog leaves current language intact and shows an explicit message',async({page})=>{
 await page.route('**/i18n/**',r=>r.fulfill({json:{locale:'en',sourceHash:'stale',status:'ready',translations:{}}}));await page.goto('/');await page.locator('#language-button').click();await page.locator('[data-language=en]').click();
 await expect(page.locator('html')).toHaveAttribute('lang','ru');await expect(page.locator('.toast')).toContainText('Перевод временно недоступен');
 expect(await page.evaluate(()=>localStorage.getItem('syucai.language'))).toBeNull();
});

test('a failed manifest cannot disable every language and preserved exact translations survive new Russian copy',async({page})=>{
 await page.route('**/i18n/manifest.json*',r=>r.fulfill({json:{sourceHash:source.sourceHash,languages:Object.fromEntries(languages.map(l=>[l.code,{status:l.code==='ru'?'ready':'unavailable'}]))}}));
 const old=catalog('en');old.status='unavailable';old.sourceHash='before-last-copy-edit';delete old.translations['Мы используем cookies для работы сайта и аналитики.'];
 await page.route('**/i18n/en.json*',r=>r.fulfill({json:old}));
 const loaded=page.waitForResponse(r=>r.url().includes('/i18n/manifest.json'));await page.goto('/');await loaded;
 await page.locator('#birth').fill('24091987');await page.locator('#language-button').click();await expect(page.locator('.language-option:disabled')).toHaveCount(0);
 await page.locator('[data-language=en]').click();await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('label[for=birth]')).toHaveText('Enter your date of birth');await expect(page.locator('#birth')).toHaveValue('24.09.1987');
 await expect(page.locator('.toast')).toContainText('Some new text is temporarily shown in Russian.');await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','en');
});
test('a language can retry loading after a transient catalog error without another deployment',async({page})=>{
 await page.route('**/i18n/manifest.json*',r=>r.fulfill({json:{sourceHash:source.sourceHash,languages:{en:{status:'unavailable'}}}}));let attempts=0;
 await page.route('**/i18n/en.json*',r=>++attempts===1?r.fulfill({status:503,json:{error:'Temporary failure'}}):r.fulfill({json:catalog('en')}));
 await page.goto('/');await page.locator('#language-button').click();await page.locator('[data-language=en]').click();await expect(page.locator('.toast')).toContainText('Перевод временно недоступен');await expect(page.locator('html')).toHaveAttribute('lang','ru');
 await page.locator('#language-button').click();await page.locator('[data-language=en]').click();await expect(page.locator('html')).toHaveAttribute('lang','en');expect(attempts).toBe(2);
});

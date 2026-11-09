import {test,expect} from '@playwright/test';
import source from '../../src/i18n/source.json' with {type:'json'};
test.use({timezoneId:'Asia/Qyzylorda'});
async function today(page){await page.clock.install({time:new Date('2026-11-09T07:00:00Z')})}
test('separate home calendar button uses birth date and ignores the optional name',async({page})=>{
 await today(page);await page.goto('/');await page.locator('#birth').fill('24091987');await page.locator('#name').fill('Анна');
 await page.locator('main').getByRole('link',{name:'МОЙ КАЛЕНДАРЬ',exact:true}).click();await expect(page).toHaveURL(/\/calendar$/);
 await expect(page.locator('#calendar-birth')).toHaveValue('24.09.1987');await expect(page.locator('#calendar-panel')).toBeVisible();
 await expect(page.locator('[data-calendar-result] .number')).toHaveText(['9','3']);await expect(page.locator('.calendar-cell')).toHaveCount(30);
});
test('calendar supports direct entry, leap month, day selection, birth edits and return to today',async({page})=>{
 await today(page);await page.goto('/calendar');await expect(page.locator('#calendar-panel')).toBeHidden();
 await expect(page.getByRole('button',{name:'Открыть календарь'})).toHaveCount(0);await page.locator('#calendar-birth').press('Enter');await expect(page.locator('#calendar-error')).toContainText('ДД.ММ.ГГГГ');
 await page.locator('#calendar-birth').fill('24091987');await expect(page.locator('#calendar-panel')).toBeVisible();
 await page.locator('#calendar-year').selectOption('2024');await page.locator('#calendar-month').selectOption('2');await expect(page.locator('.calendar-cell')).toHaveCount(29);
 await page.locator('[data-date="2024-02-01"]').click();await expect(page.locator('[data-calendar-result] .number')).toHaveText(['8','2']);
 await page.locator('[data-date="2024-02-29"]').click();await expect(page.locator('.calendar-selected time')).toHaveAttribute('datetime','2024-02-29');await expect(page.locator('[data-calendar-result] .number')).toHaveText(['9','3']);
 await page.locator('#calendar-birth').fill('01012000');await expect(page.locator('[data-calendar-result] .number')).toHaveText(['5','3']);await expect(page.locator('[data-date="2024-02-29"]')).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Вернуться к сегодня',exact:true}).click();await expect(page.locator('#calendar-year')).toHaveValue('2026');await expect(page.locator('#calendar-month')).toHaveValue('11');await expect(page.locator('.calendar-selected time')).toHaveAttribute('datetime','2026-11-09');
 await expect(page.locator('.calendar-reference')).toHaveCount(0);await expect(page.getByText('Все значения дней от 1 до 9',{exact:true})).toHaveCount(0);
 await page.locator('#calendar-birth').fill('31022000');await expect(page.locator('#calendar-panel')).toBeHidden();await expect(page.locator('#calendar-error')).toContainText('Проверьте дату');
});
test('month arrows cross year boundaries and respect original range',async({page})=>{
 await today(page);await page.goto('/calendar');await page.locator('#calendar-birth').fill('24091987');
 await page.locator('#calendar-month').selectOption('12');await page.locator('#calendar-next').click();await expect(page.locator('#calendar-year')).toHaveValue('2027');await expect(page.locator('#calendar-month')).toHaveValue('1');
 await page.locator('#calendar-prev').click();await expect(page.locator('#calendar-year')).toHaveValue('2026');await expect(page.locator('#calendar-month')).toHaveValue('12');
 await page.locator('#calendar-year').selectOption('1996');await page.locator('#calendar-month').selectOption('1');await expect(page.locator('#calendar-prev')).toBeDisabled();
 await page.locator('#calendar-year').selectOption('2056');await page.locator('#calendar-month').selectOption('12');await expect(page.locator('#calendar-next')).toBeDisabled();
});
test('master discovery follows the content on every page',async({page})=>{
 for(const path of ['/','/about','/masters','/account','/privacy','/calendar','/admin','/missing']){
  await page.goto(path);if(path==='/account')await page.locator('#auth-form').waitFor();
  await expect(page.locator('main > .master-discovery')).toHaveCount(1);
  await expect(page.locator('main > :last-child')).toHaveClass('master-discovery');
  await expect(page.locator('.master-discovery a')).toHaveAttribute('href','/masters');
 }
});
test('calendar translates and preserves selected day and form on mobile, including RTL',async({page})=>{
 const labels={en:{'МОЙ КАЛЕНДАРЬ':'MY CALENDAR','Личный день':'Personal day','Общий день':'General day'},ar:{'МОЙ КАЛЕНДАРЬ':'تقويمي'}};
 await page.route('**/i18n/manifest.json*',r=>r.fulfill({json:{sourceHash:source.sourceHash,languages:{ru:{status:'ready'},en:{status:'ready'},ar:{status:'ready'}}}}));
 await page.route(/\/i18n\/(en|ar)\.json/,r=>{const code=new URL(r.request().url()).pathname.split('/').at(-1).replace('.json','');return r.fulfill({json:{locale:code,status:'ready',sourceHash:source.sourceHash,translations:Object.fromEntries(source.strings.map((s,i)=>[s,labels[code][s]||`${code} text ${i} ${(s.match(/\{\d+\}/g)||[]).join(' ')}`]))}})});
 await today(page);await page.setViewportSize({width:390,height:844});await page.goto('/calendar');await page.locator('#calendar-birth').fill('24091987');await page.locator('#calendar-year').selectOption('2024');await page.locator('#calendar-month').selectOption('2');await page.locator('[data-date="2024-02-29"]').click();
 await page.locator('#language-button').click();await page.locator('[data-language=en]').click();await expect(page.locator('h1')).toHaveText('MY CALENDAR');await expect(page.locator('#calendar-month option:checked')).toHaveText('February');await expect(page.locator('#calendar-year')).toHaveValue('2024');await expect(page.locator('[data-calendar-result] .number')).toHaveText(['9','3']);await expect(page.locator('#calendar-birth')).toHaveValue('24.09.1987');
 expect(await page.locator('main').innerText()).not.toMatch(/[А-Яа-яЁё]/);
 await page.locator('#language-button').click();await page.locator('[data-language=ar]').click();await expect(page.locator('html')).toHaveAttribute('dir','rtl');await expect(page.locator('.calendar-selected time')).toHaveAttribute('datetime','2024-02-29');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('calendar links reject missing, partial, impossible and future birth dates before navigation',async({page})=>{
 await today(page);
 for(const [value,message] of [['','введите дату рождения'],['31022000','Проверьте дату'],['01012999','Проверьте дату'],['1203','ДД.ММ.ГГГГ']]){
  await page.goto('/');await page.locator('#name').fill('Anna');if(value)await page.locator('#birth').fill(value);
  await page.locator('main').getByRole('link',{name:'МОЙ КАЛЕНДАРЬ',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:8787/');await expect(page.locator('#birth-error')).toContainText(message);await expect(page.locator('#birth')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#birth')).toBeFocused();await expect(page.locator('#name')).toHaveValue('Anna');
 }
 await page.locator('#birth').fill('24091987');await page.locator('main').getByRole('link',{name:'МОЙ КАЛЕНДАРЬ',exact:true}).click();await expect(page).toHaveURL(/\/calendar$/);
});
test('menu calendar link without a stored birth date opens the home form with an error',async({page})=>{
 await page.goto('/about');await page.locator('.menu-button').click();await page.locator('nav').getByRole('link',{name:'МОЙ КАЛЕНДАРЬ',exact:true}).click();
 await expect(page).toHaveURL('http://127.0.0.1:8787/');await expect(page.locator('#birth-error')).toHaveText('введите дату рождения');await expect(page.locator('#birth')).toBeFocused();
});

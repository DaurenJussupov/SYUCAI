import {test,expect} from '@playwright/test';
import source from '../../src/i18n/source.json' with {type:'json'};
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3,timezoneId:'Asia/Qyzylorda'});
test('touch language picker avoids automatic keyboard focus and keeps mobile viewport scale',async({page})=>{
 await page.route('**/i18n/manifest.json*',r=>r.fulfill({json:{sourceHash:source.sourceHash,languages:{ru:{status:'ready'},en:{status:'ready'}}}}));
 await page.route('**/i18n/en.json*',r=>r.fulfill({json:{locale:'en',sourceHash:source.sourceHash,status:'ready',translations:Object.fromEntries(source.strings.map((s,i)=>[s,`English ${i} ${(s.match(/\{\d+\}/g)||[]).join(' ')}`]))}}));
 await page.goto('/');
 expect(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(true);
 const initialScale=await page.evaluate(()=>visualViewport.scale);
 await page.locator('#language-button').tap();await expect(page.locator('#language-search')).not.toBeFocused();
 expect(await page.locator('#language-search').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
 await page.locator('#language-search').tap();await page.locator('#language-search').fill('English');await page.locator('[data-language=en]').tap();
 await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('#language-panel')).toBeHidden();
 expect(await page.evaluate(()=>document.activeElement.tagName)).not.toBe('INPUT');expect(await page.evaluate(()=>visualViewport.scale)).toBe(initialScale);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const viewport=await page.locator('meta[name=viewport]').getAttribute('content');expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/);
});
test('touch month and year choices update once without refocusing and reopening a native select',async({page})=>{
 await page.clock.install({time:new Date('2026-11-09T07:00:00Z')});await page.goto('/calendar');await page.locator('#calendar-birth').fill('24091987');
 for(const selector of ['#calendar-birth','#calendar-month','#calendar-year'])expect(await page.locator(selector).evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
 await page.locator('#calendar-month').focus();await page.locator('#calendar-month').selectOption('2');await expect(page.locator('#calendar-month')).toHaveValue('2');await expect(page.locator('#calendar-month')).not.toBeFocused();await expect(page.locator('.calendar-cell')).toHaveCount(28);
 await page.locator('#calendar-year').focus();await page.locator('#calendar-year').selectOption('2024');await expect(page.locator('#calendar-year')).not.toBeFocused();await expect(page.locator('.calendar-cell')).toHaveCount(29);
 await page.locator('#calendar-month').selectOption('12');await expect(page.locator('#calendar-month')).not.toBeFocused();await expect(page.locator('.calendar-cell')).toHaveCount(31);
 expect(await page.evaluate(()=>document.activeElement.tagName)).not.toBe('SELECT');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:8787';
const admin={Origin:origin,Authorization:'Bearer local-test-admin'};
test('unfinished form autosaves across reload; admin sees draft and integration setup',async({page,browser})=>{
 const email=`draft-${Date.now()}@example.com`;
 await page.goto('/account');await page.locator('#email').fill(email);await page.locator('#password').fill('TestPassword123!');await page.locator('.consent input').check();await page.getByRole('button',{name:'Создать аккаунт'}).click();await expect(page.locator('#profile-form')).toBeVisible();
 await page.locator('[name=name]').fill('Anara Draft');await page.locator('[name=credentials]').fill('Diploma draft');await page.locator('#profile-city').fill('Алматы, Казахстан');await expect(page.locator('#draft-status')).toHaveText('Черновик сохранён');
 await page.reload();await expect(page.locator('[name=name]')).toHaveValue('Anara Draft');await expect(page.locator('[name=credentials]')).toHaveValue('Diploma draft');
 const ctx=await browser.newContext(),manager=await ctx.newPage();await manager.goto(origin+'/admin');await manager.locator('#admin-token').fill('local-test-admin');await manager.getByRole('button',{name:'Открыть анкеты'}).click();const card=manager.locator('.admin-profile').filter({hasText:email});await expect(card).toContainText('Anara Draft');await expect(card.getByRole('button',{name:'Опубликовать'})).toHaveCount(0);
 await manager.getByRole('button',{name:'Аналитика',exact:true}).click();await expect(manager.locator('.admin-metrics').first()).toContainText('Анкеты на проверке');await expect(manager.locator('#stats-period')).toHaveValue('30');await manager.locator('#stats-period').selectOption('7');await expect(manager.locator('#stats-period')).toHaveValue('7');
 await manager.getByRole('button',{name:'Google и настройки',exact:true}).click();await expect(manager.locator('#admin-content')).toContainText('GOOGLE_CLIENT_ID');await expect(manager.locator('#connect-google')).toBeDisabled();await expect(manager.locator('#create-google')).toBeDisabled();
 await manager.setViewportSize({width:390,height:844});expect(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await manager.getByRole('button',{name:'Выйти',exact:true}).click();await expect(manager.locator('#admin-token')).toBeVisible();await ctx.close();
});
test('analytics and Google load only with consent, exclude input values, and stop when withdrawn',async({page})=>{
 const events=[],google=[];await page.request.put('/api/admin/settings',{headers:admin,data:{measurementId:'G-TEST123456',propertyId:'12345'}});
 await page.route('https://www.googletagmanager.com/**',async route=>{google.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:''})});
 page.on('request',r=>{if(r.url().endsWith('/api/events'))events.push(r.postDataJSON())});
 const config=page.waitForResponse(r=>r.url().endsWith('/api/public-config'));await page.goto('/?utm_source=test_campaign');await config;await expect(page.locator('#analytics-consent')).toBeVisible();expect(events.length).toBe(0);expect(google.length).toBe(0);
 await page.locator('#name').fill('PrivateName');await page.locator('#birth').fill('07091975');await page.locator('[data-consent=yes]').click();await expect.poll(()=>events.length).toBeGreaterThan(0);await expect.poll(()=>google.length).toBe(1);
 await page.getByRole('button',{name:'Рассчитать',exact:true}).click();await expect(page).toHaveURL(/\/results$/);await expect.poll(()=>events.some(e=>e.event==='calculation')).toBe(true);await expect.poll(()=>events.some(e=>e.path==='/results')).toBe(true);
 const payloads=JSON.stringify(events);expect(payloads).not.toContain('PrivateName');expect(payloads).not.toContain('1975');expect(events.some(e=>e.source==='test_campaign')).toBe(true);
 const ga=await page.evaluate(()=>JSON.stringify(window.dataLayer));expect(ga).not.toContain('PrivateName');expect(ga).not.toContain('1975');expect(ga).not.toContain('utm_source');
 await page.locator('[data-analytics-settings]').click();await page.locator('[data-consent=no]').click();const count=events.length;await page.getByRole('button',{name:'Изменить данные'}).click();await expect(page.locator('#calculator')).toBeVisible();expect(events.length).toBe(count);expect(await page.evaluate(()=>window['ga-disable-G-TEST123456'])).toBe(true);
 await page.goto('/admin');expect(events.length).toBe(count);await page.request.put('/api/admin/settings',{headers:admin,data:{measurementId:'',propertyId:''}});
});

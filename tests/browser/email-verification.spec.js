import {test,expect} from '@playwright/test';
const id='00000000-0000-4000-8000-000000000001';
const unverified={id,email:'verification@example.test',created_at:'2026-11-21 01:00:00',email_verified_at:null,email_verification_sent_at:'2026-11-21 01:00:00'};
test('account shows unverified state, allows resend and refreshes verification when returning to the account',async({page})=>{
 let verified=false,resends=0;await page.route('**/api/me',r=>r.fulfill({json:{user:{...unverified,email_verified_at:verified?'2026-11-21 02:00:00':null},files:[],profile:null,promotions:[]}}));await page.route('**/api/auth/resend-verification',r=>{resends++;return r.fulfill({json:{ok:true,sent:true}})});
 await page.goto('/account');await expect(page.locator('#email-verification')).toHaveAttribute('data-email-status','unverified');await expect(page.locator('#email-verification')).toContainText('Email не подтверждён');await page.locator('#resend-verification').click();await expect(page.locator('#email-verification-notice')).toContainText('Письмо отправлено');expect(resends).toBe(1);await expect(page.locator('#resend-verification')).toBeDisabled();
 verified=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('#email-verification')).toHaveAttribute('data-email-status','verified');await expect(page.locator('#email-verification')).toContainText('Email подтверждён');await expect(page.locator('#resend-verification')).toHaveCount(0);
});
test('email link is confirmed by an explicit POST; token stays out of analytics and the URL is cleaned',async({page})=>{
 const token='a'.repeat(64),requests=[];await page.addInitScript(()=>localStorage.setItem('syucai-analytics-consent','yes'));page.on('request',r=>requests.push(r));let confirmations=0;
 await page.route('**/api/auth/verify-email',r=>{confirmations++;expect(r.request().method()).toBe('POST');expect(r.request().postDataJSON()).toEqual({token});return r.fulfill({json:{ok:true}})});
 await page.route('**/api/public-config',r=>r.fulfill({json:{measurementId:'G-TEST123456',analytics:true}}));
 await page.goto('/verify-email#token='+token);await expect(page).toHaveURL(/\/verify-email$/);expect(confirmations).toBe(0);await page.getByRole('button',{name:'Подтвердить email',exact:true}).click();await expect(page.locator('#verification-message')).toContainText('Email успешно подтверждён');expect(confirmations).toBe(1);
 expect(requests.some(r=>r.url().includes('googletagmanager.com')||r.url().endsWith('/api/events'))).toBe(false);expect(requests.every(r=>!r.url().includes(token))).toBe(true);
});
test('expired links and email service failures show actionable errors instead of a false success',async({page})=>{
 await page.route('**/api/auth/verify-email',r=>r.fulfill({status:400,json:{error:'Ссылка истекла или уже использована. Запросите новое письмо в кабинете.'}}));await page.goto('/verify-email#token='+'b'.repeat(64));await page.getByRole('button',{name:'Подтвердить email',exact:true}).click();await expect(page.locator('#verification-error')).toContainText('Запросите новое письмо');
 await page.route('**/api/me',r=>r.fulfill({json:{user:unverified,files:[],profile:null,promotions:[]}}));await page.route('**/api/auth/resend-verification',r=>r.fulfill({status:503,json:{error:'Сервис отправки писем временно недоступен. Повторите позже.'}}));await page.goto('/account');await page.locator('#resend-verification').click();await expect(page.locator('#email-verification-error')).toContainText('временно недоступен');await expect(page.locator('#email-verification-notice')).toBeEmpty();
});

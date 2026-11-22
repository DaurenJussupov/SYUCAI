import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
// Only the isolated local emulator is seeded. Confirmation uses the real code API.
export async function verifyTestAccount(page){
 const state=process.env.SYUCAI_E2E_STATE;if(!state?.startsWith('.wrangler/test-state-'))throw Error('Missing isolated test state');
 const user=(await(await page.request.get('/api/me',{headers:{'X-Account-Type':page.url().includes('/account')?'master':'user'}})).json()).user;if(!/^[a-f0-9-]{36}$/.test(user?.id||''))throw Error('Missing test account');if(user.email_verified_at)return;
 const nonce=randomBytes(32).toString('hex'),code='012345',hash=createHash('sha256').update(nonce+':'+code).digest('hex'),now=Date.now();
 const sql=`INSERT INTO email_confirmation_codes(account_id,registration_type,nonce,code_hash,created_at,expires) VALUES('${user.id}','${user.registration_type}','${nonce}','${hash}',${now},${now+600000}) ON CONFLICT(account_id,registration_type) DO UPDATE SET nonce=excluded.nonce,code_hash=excluded.code_hash,expires=excluded.expires,attempts=0`;
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','syucai','--local','--persist-to',state,'--command',sql],{stdio:'pipe'});
 const response=await page.request.post('/api/auth/verify-email-code',{headers:{Origin:'http://127.0.0.1:8787'},data:{registrationType:user.registration_type,code}});if(response.status()!==200)throw Error('Test confirmation failed');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));if(await page.locator('#email-code-dialog[open]').count())await page.waitForFunction(()=>!document.querySelector('#email-code-dialog[open]'));
}

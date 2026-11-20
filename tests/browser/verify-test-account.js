import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
// Seed only the isolated local emulator, then exercise the real confirmation API.
export async function verifyTestAccount(page){
 const state=process.env.SYUCAI_E2E_STATE;if(!state?.startsWith('.wrangler/test-state-'))throw Error('Missing isolated test state');
 const user=(await(await page.request.get('/api/me')).json()).user;if(!/^[a-f0-9-]{36}$/.test(user?.id||''))throw Error('Missing test account');
 const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
 const sql=`INSERT INTO email_verification_tokens(token,account_id,expires) VALUES('${hash}','${user.id}',${Date.now()+60000})`;
 execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','syucai','--local','--persist-to',state,'--command',sql],{stdio:'pipe'});
 const response=await page.request.post('/api/auth/verify-email',{headers:{Origin:'http://127.0.0.1:8787'},data:{token}});if(response.status()!==200)throw Error('Test confirmation failed');
}

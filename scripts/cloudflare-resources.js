import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

// Runs inside the authenticated Cloudflare build, before Wrangler uploads the Worker.
// Never log the build token, response headers, or process environment.
export async function prepareResources({accountId,token,request=fetch,applyMigrations,root=process.cwd()}) {
  if(!/^[a-f0-9]{32}$/.test(accountId||''))throw Error('CLOUDFLARE_ACCOUNT_ID is required for deployment.');
  if(!token)throw Error('Cloudflare build token is missing. Configure the Workers build token.');
  const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  async function api(path,options={}) {
    const response=await request(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
    let data;try{data=await response.json()}catch{throw Error(`Cloudflare returned HTTP ${response.status} for ${path.split('?')[0]}.`)}
    if(!response.ok||!data.success){const codes=(data.errors||[]).map(e=>Number(e.code)).filter(Number.isFinite);throw Object.assign(Error(`Cloudflare resource setup failed: HTTP ${response.status}, code ${codes.join(',')||'unknown'}. Check build-token D1/R2 permissions and whether R2 is enabled.`),{status:response.status,codes})}
    return data.result;
  }
  let database;
  try{database=await api('/d1/database/syucai')}catch(e){if(e.status!==404&&!e.codes?.includes(7404))throw e;database=await api('/d1/database',{method:'POST',body:JSON.stringify({name:'syucai'})})}
  if(!database?.uuid)throw Error('Cloudflare did not return a D1 database ID. Deployment stopped.');
  try{await api('/r2/buckets/syucai-files')}catch(e){if(e.status!==404&&!e.codes?.includes(10006))throw e;await api('/r2/buckets',{method:'POST',body:JSON.stringify({name:'syucai-files'})})}
  await applyMigrations(database.uuid);
  console.log('Cloudflare D1 schema and private R2 bucket are ready.');
  return database.uuid;
}

export async function setupFromEnvironment() {
  const root=process.cwd(),config=JSON.parse(await readFile(resolve(root,'wrangler.jsonc'),'utf8'));
  // Local dev and explicitly requested dry runs build assets without remote mutations.
  if(process.env.SYUCAI_SKIP_REMOTE_SETUP==='1'||!process.env.CLOUDFLARE_API_TOKEN){console.log('Local asset build: remote resources are unchanged.');return}
  const accountId=process.env.CLOUDFLARE_ACCOUNT_ID||config.account_id;
  await prepareResources({accountId,token:process.env.CLOUDFLARE_API_TOKEN,root,applyMigrations:async databaseId=>{
    const dir=resolve(root,'.wrangler');await mkdir(dir,{recursive:true});
    const configPath=resolve(dir,'resources.json');
    await writeFile(configPath,JSON.stringify({name:'syucai',account_id:accountId,compatibility_date:config.compatibility_date,d1_databases:[{binding:'DB',database_name:'syucai',database_id:databaseId,migrations_dir:resolve(root,'migrations')}]}));
    const result=spawnSync(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'d1','migrations','apply','syucai','--remote','--config',configPath],{stdio:'inherit',env:process.env});
    if(result.error)throw result.error;if(result.status!==0)throw Error('D1 migration failed; Worker deployment stopped.');
  }});
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))setupFromEnvironment().catch(e=>{console.error(e.message);process.exitCode=1});

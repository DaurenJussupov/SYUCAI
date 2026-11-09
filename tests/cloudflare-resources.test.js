import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareResources} from '../scripts/cloudflare-resources.js';
const accountId='a'.repeat(32);
const response=(result,status=200,code)=>({ok:status<400,status,json:async()=>({success:status<400,result,errors:code?[{code}]:[]})});
test('deployment reuses existing resources and applies schema before returning',async()=>{
 const calls=[];const id=await prepareResources({accountId,token:'not-a-real-token',request:async(url,options)=>{calls.push(options.method||'GET');return response(url.includes('/d1/')?{uuid:'existing-database'}:{name:'syucai-files'})},applyMigrations:async id=>calls.push('migrate:'+id)});
 assert.equal(id,'existing-database');assert.deepEqual(calls,['GET','GET','migrate:existing-database']);
});
test('first deployment creates only missing D1 and R2 resources',async()=>{
 const calls=[];await prepareResources({accountId,token:'not-a-real-token',request:async(url,options)=>{const path=new URL(url).pathname;calls.push([options.method||'GET',path.split('/').at(-1)]);if(path.endsWith('/syucai')||path.endsWith('/syucai-files'))return response(null,404);return response(path.endsWith('/database')?{uuid:'new-database'}:{name:'syucai-files'})},applyMigrations:async id=>calls.push(['migrate',id])});
 assert.deepEqual(calls,[['GET','syucai'],['POST','database'],['GET','syucai-files'],['POST','buckets'],['migrate','new-database']]);
});
test('permission failures and migration errors stop deployment without pretending success',async()=>{
 let migrated=false;await assert.rejects(prepareResources({accountId,token:'not-a-real-token',request:async()=>response(null,403,10000),applyMigrations:async()=>migrated=true}),/HTTP 403/);assert.equal(migrated,false);
 await assert.rejects(prepareResources({accountId,token:'not-a-real-token',request:async()=>response({uuid:'existing-database'}),applyMigrations:async()=>{throw Error('migration failed')}}),/migration failed/);
});

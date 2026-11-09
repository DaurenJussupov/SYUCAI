import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database({migrate=true}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync('migrations/0001_init.sql','utf8'));if(migrate)sqlite.exec(readFileSync('migrations/0002_admin_integrations.sql','utf8'));
 const DB={prepare(sql){let values=[];const statement={bind(...args){values=args;return statement},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},async run(){return sqlite.prepare(sql).run(...values)}};return statement},batch(statements){return Promise.all(statements.map(s=>s.all()))}};
 return {DB,sqlite,close:()=>sqlite.close()};
}

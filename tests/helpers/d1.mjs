import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database() {
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 db.exec(readFileSync(new URL('../../migrations/0003_accounts_profiles.sql',import.meta.url),'utf8'));
 const prepare=(sql,params=[])=>({
  bind(...values){return prepare(sql,values)},
  async first(){return db.prepare(sql).get(...params)||null},
  async all(){return {results:db.prepare(sql).all(...params)}},
  async run(){return {meta:db.prepare(sql).run(...params)}}
 });
 return {prepare,async batch(queries){db.exec('BEGIN');try{const result=[];for(const query of queries)result.push(await query.run());db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}},db};
}

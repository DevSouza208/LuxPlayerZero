import test from 'node:test';
import assert from 'node:assert/strict';
import {channelCountry,tvCountryIndex,emptyTvSchedule,cleanTvSchedule,channelsForDay,saoPauloDay} from '../public/tv-feature-model.js';
import {groupTvEntries} from '../public/cinema-tv-groups.js';
import {tvHighlightsApi} from '../src/tv-highlights.js';
import {editorialApi} from '../src/editorial-api.js';
import {accountApi} from '../src/account-api.js';
import {database} from './helpers/d1.mjs';
const entry=(id,name,epgId='',group='TV')=>({id,name,group,epgId,url:'https://source.example/live/private/'+id+'.m3u8'});
test('siglas explícitas reconhecem países e aliases sem inferir país ambíguo',()=>{
 for(const [name,code]of [['EC: CANAL UNO','EC'],['US: NBC','US'],['USA: ABC HD','US'],['ARG : Canal 1','AR'],['PR | WAPA HD','PR'],['MX: Canal','MX'],['CO: Canal','CO'],['DR: Canal','DO'],['SP: USA: Canal','US'],['[PT] RTP','PT']])assert.equal(channelCountry(name).code,code,name);
 assert.deepEqual(channelCountry('BR: Globo'),{international:false,code:'BR',label:'Brasil'});
 assert.equal(channelCountry('SporTV').international,false);assert.equal(channelCountry('Record TV').international,false);
 assert.equal(channelCountry('LA: Canal').code,'unknown');assert.equal(channelCountry('LT: Canal').code,'unknown');
 assert.equal(channelCountry('Canal sem sigla','CANAIS INTERNACIONAIS').international,true);
});
test('Todos Internacionais e Outros particionam canais lógicos sem perder variantes ou URLs',()=>{
 const values=[entry('a','US: NBC HD','nbc.us'),entry('b','US: NBC SD','nbc.us'),entry('c','EC: CANAL UNO'),entry('d','Globo'),entry('e','LA: AXN')];const before=structuredClone(values);
 const grouped=groupTvEntries(values),index=tvCountryIndex(grouped.groups);
 assert.equal(grouped.groups.length,4);assert.equal(index.international.length,3);assert.equal(index.other.length,1);assert.equal(index.countries.find(row=>row.code==='US').count,1);
 assert.deepEqual(values,before);assert.equal(grouped.byItemId.get('a').variants.length,2);assert.equal(index.international[0].primary.url,values[0].url);
});
test('agenda conserva ordem do dia e só retorna canais presentes na playlist',()=>{
 const groups=groupTvEntries([entry('a','SporTV','sportv.br'),entry('b','Canal de Notícias','news.br')]).groups;
 const schedule=emptyTvSchedule();schedule.days[3]=[{key:groups[1].key,title:groups[1].title},{key:'name:ausente',title:'Ausente'},{key:groups[0].key,title:groups[0].title}];
 assert.deepEqual(channelsForDay(groups,schedule,3).map(row=>row.key),[groups[1].key,groups[0].key]);assert.deepEqual(channelsForDay(groups,schedule,4),[]);
 const otherSource=[{...groups[0],key:'name:sportv'}];assert.equal(channelsForDay(otherSource,schedule,3)[0],otherSource[0]);
 assert.equal(saoPauloDay(new Date('2026-10-29T01:00:00Z')),3);assert.equal(saoPauloDay(new Date('2026-10-29T03:00:00Z')),4);
});
test('validação limita seis por dia e rejeita URLs ou duplicações na agenda',()=>{
 const schedule=emptyTvSchedule();schedule.days[1]=[{key:'epg:sportv.br',title:'SporTV',url:'https://secret.example'}];const clean=cleanTvSchedule(schedule);assert.equal(clean.days[1][0].url,undefined);
 assert.throws(()=>cleanTvSchedule({...schedule,days:{1:[...schedule.days[1],...schedule.days[1]]}}));
 assert.throws(()=>cleanTvSchedule({...schedule,days:{1:Array.from({length:7},(_,i)=>({key:'name:canal '+i,title:'Canal '+i}))}}));
 assert.throws(()=>cleanTvSchedule({...schedule,days:{1:[{key:'epg:https://private.example',title:'Canal'}]}}));
 assert.throws(()=>cleanTvSchedule({...schedule,days:{1:[{key:'name:canal',title:'https://private.example'}]}}));
});
function setup(){let saved=null,puts=0;return {env:{CATALOG_BUCKET:{get:async()=>saved?{json:async()=>JSON.parse(saved)}:null,put:async(key,value)=>{assert.equal(key,'editorial/tv-highlights-v1.json');saved=value;puts++}}},get puts(){return puts},get saved(){return saved}}}
const origin='https://lux.example';
const request=(body,site=origin)=>new Request(origin+'/api/editorial/tv-highlights',{method:body?'POST':'GET',headers:{origin:site,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
test('agenda R2 é compartilhada mas só administrador autenticado pode gravar',async()=>{
 const ctx=setup();assert.equal((await tvHighlightsApi(request(),ctx.env,null)).status,401);
 const member={role:'member'},admin={role:'admin'};
 assert.equal((await tvHighlightsApi(request({schedule:emptyTvSchedule()}),ctx.env,member)).status,403);assert.equal(ctx.puts,0);
 const schedule=emptyTvSchedule();schedule.days[3]=[{key:'name:sportv',title:'SporTV'}];
 assert.equal((await tvHighlightsApi(request({schedule},'https://other.example'),ctx.env,admin)).status,403);assert.equal(ctx.puts,0);
 const response=await tvHighlightsApi(request({schedule}),ctx.env,admin);assert.equal(response.status,200);assert.equal(ctx.puts,1);
 const value=await (await tvHighlightsApi(request(),ctx.env,member)).json();assert.equal(value.canEdit,false);assert.equal(value.schedule.days[3][0].title,'SporTV');assert.ok(value.schedule.updatedAt>0);assert.ok(!ctx.saved.includes('url'));
 assert.equal((await tvHighlightsApi(request({schedule:{days:{}}}),ctx.env,admin)).status,400);assert.equal(ctx.puts,1);
});
test('rota editorial valida sessão real antes de acessar agenda compartilhada',async()=>{
 const ctx=setup();ctx.env.DB=database();ctx.env.LUX_AUTH_PEPPER='test-only-strong-pepper-more-than-32-characters';ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD='test-only-strong-admin-password';
 assert.equal((await editorialApi(request(),ctx.env)).status,401);
 const login=await accountApi(new Request(origin+'/api/account/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({identity:'admin',password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD})}),ctx.env);assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0],req=request();req.headers.set('cookie',cookie);
 const response=await editorialApi(req,ctx.env);assert.equal(response.status,200);assert.equal((await response.json()).canEdit,true);assert.equal(ctx.puts,0);
});
test('bucket ausente tem mensagem real e nenhuma agenda é fingida como salva',async()=>{
 const response=await tvHighlightsApi(request({schedule:emptyTvSchedule()}),{}, {role:'admin'});assert.equal(response.status,503);assert.match((await response.json()).error,/CATALOG_BUCKET/);
});

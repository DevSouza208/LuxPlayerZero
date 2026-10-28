import test from 'node:test';
import assert from 'node:assert/strict';
import {groupTvEntries} from '../public/cinema-tv-groups.js';
import {providerTvGroups} from '../public/tv-feature-model.js';
import {liveStreamIdentity,providerIdentity,sanitizeProviderCategories,categoriesForEntries,attachProviderCategories,createTvProviderCategoryClient} from '../public/tv-provider-categories.js';
const item=(id,name,streamId=id,epgId='')=>({id,name,epgId,group:'CANAIS COMPLETO(SD,HD,FHD,4K)',url:'http://provider.example/live/demo/secret-password/'+streamId+'.m3u8'});
const categories=[{category_id:'1',category_name:'GLOBO SUDESTE'},{category_id:'2',category_name:'GLOBO SUL'},{category_id:'3',category_name:'ESPORTES'}];
const streams=[{stream_id:101,name:'Globo São Paulo HD',epg_channel_id:'globo.sp',category_id:'1',direct_source:'https://private.example/secret'},{stream_id:102,name:'Globo Porto Alegre',epg_channel_id:'globo.rs',category_id:'2'},{stream_id:103,name:'SporTV',category_ids:['3']}];
const data=sanitizeProviderCategories(categories,streams);
const makeGroups=()=>groupTvEntries([item('c0','Globo São Paulo HD',101,'globo.sp'),item('c1','Globo Porto Alegre',102,'globo.rs'),item('c2','SporTV',103)]).groups;
test('identifica a conta pela fonte sem modificar URL e aceita origem get.php da mesma conta',()=>{
 const entry=item('c0','Globo',101);const before=structuredClone(entry),identity=liveStreamIdentity(entry);assert.equal(identity.id,'101');assert.equal(identity.username,'demo');assert.deepEqual(entry,before);
 assert.equal(providerIdentity(makeGroups(),'http://master.example/get.php?username=demo&password=secret-password').origin,'http://master.example');
 assert.equal(providerIdentity(makeGroups(),'http://other.example/get.php?username=another&password=secret-password').origin,'http://provider.example');
 assert.equal(liveStreamIdentity({url:'https://example.com/live/1.m3u8'}),null);
});
test('normalização descarta URLs da API e conserva os rótulos reais das categorias',()=>{
 assert.deepEqual(data.categories.map(row=>row.category_name),['GLOBO SUDESTE','GLOBO SUL','ESPORTES']);assert.ok(!JSON.stringify(data).includes('private.example'));assert.ok(!JSON.stringify(data).includes('direct_source'));
 assert.throws(()=>sanitizeProviderCategories({auth:0},[]));assert.throws(()=>sanitizeProviderCategories([],[]));
});
test('vínculo por stream ID separa regiões e não altera os canais originais',()=>{
 const groups=makeGroups(),before=structuredClone(groups),identity=providerIdentity(groups),mapped=categoriesForEntries(groups,data,identity),index=providerTvGroups(attachProviderCategories(groups,mapped));
 assert.deepEqual(index.categories.map(row=>row.label),['GLOBO SUDESTE','GLOBO SUL','ESPORTES']);assert.equal(index.categories[1].channels[0].id,'c1');assert.deepEqual(groups,before);assert.equal(index.channels.length,3);
});
test('UUID da playlist usa EPG ou nome inequívoco quando stream ID da API é diferente',()=>{
 const groups=groupTvEntries([item('c0','Globo São Paulo HD','uuid-a','globo.sp'),item('c1','Globo Porto Alegre SD','uuid-b')]).groups;
 const mapped=categoriesForEntries(groups,data,providerIdentity(groups));assert.deepEqual(mapped.get('c0'),['GLOBO SUDESTE']);assert.deepEqual(mapped.get('c1'),['GLOBO SUL']);
});
test('não cruza outra conta ou host e não adivinha nome ou EPG ambíguo',()=>{
 const entries=[item('a','Globo','uuid-a','0'),{...item('b','Globo',101),url:'http://other.example/live/demo/secret-password/101.m3u8'}, {...item('c','Globo',102),url:'http://provider.example/live/another/secret-password/102.m3u8'}],groups=groupTvEntries(entries).groups;
 const ambiguous=sanitizeProviderCategories(categories,[{stream_id:1,name:'Globo',category_id:'1',epg_channel_id:'0'},{stream_id:2,name:'Globo',category_id:'2',epg_channel_id:'0'}]);
 assert.equal(categoriesForEntries(groups,ambiguous,providerIdentity(groups)).size,0);
});
test('categoria regional usa a variante daquela região, mesmo se o EPG agrupou ambas',()=>{
 const groups=groupTvEntries([item('a','Globo HD',101,'shared'),item('b','Globo SD',102,'shared')]).groups;
 const mapped=categoriesForEntries(groups,data,providerIdentity(groups)),index=providerTvGroups(attachProviderCategories(groups,mapped));
 assert.equal(index.categories[0].channels[0].id,'a');assert.equal(index.categories[1].channels[0].id,'b');assert.equal(groups[0].variants.length,2);assert.equal(groups[0].primary.id,'a');
});
test('categorias internacionais declaradas na API continuam ocultas da navegação',()=>{
 const group=makeGroups()[0];const enriched=attachProviderCategories([group],new Map([['c0',['CANAIS INTERNACIONAIS']]]));assert.equal(providerTvGroups(enriched).channels.length,0);assert.equal(group.variants.length,1);
});
function clientSetup(){let calls=0,clock=100;const saved=new Map();const options={profileId:()=> 'profile-demo',now:()=>clock,hash:async()=> 'test-hash',storage:{get:async key=>saved.get(key),set:async(key,value)=>saved.set(key,value)},read:async url=>{calls++;const value=new URL(url);assert.equal(value.pathname,'/player_api.php');assert.equal(value.searchParams.get('username'),'demo');return JSON.stringify(value.searchParams.get('action')==='get_live_categories'?categories:streams)}};return {options,saved,get calls(){return calls},set clock(value){clock=value}}}
test('duas consultas atendem múltiplas chamadas e cache diário não persiste credenciais',async()=>{
 const ctx=clientSetup(),client=createTvProviderCategoryClient(ctx.options),groups=makeGroups();
 const [a,b]=await Promise.all([client.load(groups),client.load(groups)]);assert.equal(a.byItem.size,3);assert.equal(b.byItem.size,3);assert.equal(ctx.calls,2);await client.load(groups);assert.equal(ctx.calls,2);
 assert.ok(!JSON.stringify([...ctx.saved.values()]).includes('secret-password'));assert.ok(!JSON.stringify([...ctx.saved.values()]).includes('http://'));assert.ok(!JSON.stringify([...ctx.saved.values()]).includes('https://'));
 const restored=createTvProviderCategoryClient(ctx.options);const reordered=[groups[1],groups[0],groups[2]].map(group=>({...group,primary:{...group.primary}}));assert.equal((await restored.load(reordered)).byItem.get('c1')[0],'GLOBO SUL');assert.equal(ctx.calls,2);
 ctx.clock=86400200;await restored.load(groups);assert.equal(ctx.calls,4);
});
test('falha temporária preserva a M3U e evita uma tempestade de novas consultas',async()=>{
 const ctx=clientSetup();let calls=0;const client=createTvProviderCategoryClient({...ctx.options,read:async()=>{calls++;throw Error('private-url-must-not-leak')}}),groups=makeGroups(),before=structuredClone(groups);
 const first=await client.load(groups);assert.equal(first.available,false);assert.ok(!first.reason.includes('private-url'));const count=calls;await client.load(groups);assert.equal(calls,count);assert.deepEqual(groups,before);
});

test('usa credenciais originais do get.php no mesmo fornecedor sem trocar as credenciais da mídia',async()=>{
 const groups=makeGroups(),hint='http://provider.example/get.php?username=original-user&password=original-secret';const identity=providerIdentity(groups,hint);
 assert.equal(identity.username,'original-user');assert.equal(identity.mediaUsername,'demo');assert.equal(categoriesForEntries(groups,data,identity).size,3);
 const saved=new Map(),client=createTvProviderCategoryClient({profileId:()=> 'p1',hash:async()=> 'opaque',storage:{get:async key=>saved.get(key),set:async(key,value)=>saved.set(key,value)},read:async url=>{const parsed=new URL(url);assert.equal(parsed.searchParams.get('username'),'original-user');assert.equal(parsed.searchParams.get('password'),'original-secret');return parsed.searchParams.get('action')==='get_live_categories'?categories:streams}});
 assert.equal((await client.load(groups,hint)).byItem.size,3);assert.ok(!JSON.stringify([...saved.values()]).includes('original-secret'));
});

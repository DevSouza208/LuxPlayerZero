import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTvCuratedCatalog,curatedTvGroups,providerChannelId,createTvCuratedLoader} from '../public/tv-curated-catalog.js';
import {groupTvEntries} from '../public/cinema-tv-groups.js';
const row=(id,nome,grupo='Esportes',subgrupo='Premiere',visivel=true)=>({id,nome,grupo,subgrupo,visivel});
const document=rows=>({versao:1,grupos:[...new Set(rows.map(x=>x.grupo))].map(nome=>({nome,subgrupos:[...new Set(rows.filter(x=>x.grupo===nome).map(x=>x.subgrupo))].map(nome=>({nome}))})),canais:rows});
const source=(id,name,epgId='',group='CANAIS COMPLETO')=>({id:'local-'+id,name,group,epgId,url:'https://example.org/live/test-only/password/'+id+'.m3u8'});
const asset=JSON.parse(readFileSync(new URL('../public/data/tv-channel-groups.json',import.meta.url),'utf8'));
test('JSON embarcado cobre 2289 IDs sem credenciais ou links de mídia',()=>{
 const catalog=parseTvCuratedCatalog(asset);assert.equal(catalog.byId.size,2289);assert.equal(asset.resumo.total_entradas_tv,2289);
 assert.equal(asset.grupos.length,16);assert.equal(catalog.order.has('24h'),true);assert.ok(catalog.order.get('Esportes').includes('Premiere'));assert.ok(catalog.order.get('Esportes').includes('SporTV'));
 assert.equal(asset.grupos.reduce((n,row)=>n+row.total,0),2289);assert.doesNotMatch(JSON.stringify(asset),/https?:\/\/|username=|password=/i);
 assert.equal(curatedTvGroups([],catalog).channels.length,0);
});
test('IDs e famílias preservam canais lógicos e todas as variantes sem duplicar contagens',()=>{
 const values=[source('p1','Premiere 1 HD','premiere'),source('p2','Premiere 1 SD','premiere'),source('s1','SporTV','sportv'),source('24','24H-POKEMON','pokemon'),source('foreign','US: NBC','nbc'),source('unknown','Canal novo','new')];
 const before=structuredClone(values),catalog=parseTvCuratedCatalog(document([row('p1','Premiere 1 HD'),row('p2','Premiere 1 SD'),row('s1','SporTV','Esportes','SporTV'),row('24','24H-POKEMON','24h','Animes'),row('foreign','US: NBC','Internacionais','Estados Unidos',false),row('absent','Ausente')]));
 const index=curatedTvGroups(groupTvEntries(values).groups,catalog);assert.equal(index.channels.length,4);assert.equal(index.groups[0].variants.length,2);
 const sports=index.categories.find(x=>x.label==='Esportes');assert.deepEqual(sports.subgroups.map(x=>[x.label,x.channels.length]),[['Premiere',1],['SporTV',1]]);
 assert.equal(sports.channels.length,2);assert.equal(index.categories.find(x=>x.label==='Outros').subgroups[0].label,'Não mapeados');
 assert.deepEqual(values,before);assert.equal(index.channels[0],values[0]);assert.equal(index.groups[0].variants[1].item.url,values[1].url);
});
test('fonte principal oculta não impede fonte visível da mesma identidade',()=>{
 const values=[source('hidden','Canal X','same'),source('shown','Canal Y','same')];const grouped=groupTvEntries(values).groups;
 const index=curatedTvGroups(grouped,parseTvCuratedCatalog(document([row('hidden','Canal X','Internacionais','Não identificado',false),row('shown','Canal Y')])));
 assert.equal(index.channels[0],values[1]);assert.equal(grouped[0].primary,values[0]);assert.equal(index.groups[0].variants.length,2);
});
test('fallback aceita só nome normalizado inequívoco e ID tem prioridade',()=>{
 const catalog=parseTvCuratedCatalog(document([row('one','Mesmo canal HD'),row('two','Mesmo canal SD','Filmes','Cinema'),row('three','Outro canal HD')]));
 const values=[source('new1','Mesmo canal FHD'),source('new2','Outro canal SD'),source('two','Nome diferente')];const index=curatedTvGroups(groupTvEntries(values).groups,catalog);
 assert.equal(index.categories.find(x=>x.label==='Outros').channels[0],values[0]);assert.equal(index.categories.find(x=>x.label==='Esportes').channels[0],values[1]);assert.equal(index.categories.find(x=>x.label==='Filmes').channels[0],values[2]);
});
test('parser rejeita IDs repetidos rótulos inválidos e referências inexistentes',()=>{
 assert.throws(()=>parseTvCuratedCatalog(document([row('same','A'),row('same','B')])));
 assert.throws(()=>parseTvCuratedCatalog(document([row(undefined,'A')])));
 assert.throws(()=>parseTvCuratedCatalog(document([row('id','A','https://example.org','S')])));
 const value=document([row('id','A')]);value.canais[0].subgrupo='Ausente';assert.throws(()=>parseTvCuratedCatalog(value));
 assert.equal(providerChannelId(source('uuid','A')),'uuid');assert.equal(providerChannelId({url:'javascript:alert(1)'}),'');assert.equal(providerChannelId({url:'https://example.org/live/a/b/%ZZ.m3u8'}),'');
});
test('mapa estático carrega uma vez sem API privada e falhas têm pausa antes de nova tentativa',async()=>{
 let calls=0,time=100,fail=false;
 const loader=createTvCuratedLoader({now:()=>time,fetcher:async(url,options)=>{calls++;assert.equal(url,'/data/tv-channel-groups.json');assert.equal(options.credentials,'omit');if(fail)throw Error('Offline');return Response.json(document([row('id','A')]))}});
 const [a,b]=await Promise.all([loader(),loader()]);assert.equal(a,b);assert.equal(calls,1);await loader();assert.equal(calls,1);
 fail=true;const retry=createTvCuratedLoader({now:()=>time,fetcher:async()=>{calls++;if(fail)throw Error('Offline');return Response.json(document([]))}});
 await assert.rejects(retry());await assert.rejects(retry());assert.equal(calls,2);time+=30001;fail=false;await retry();assert.equal(calls,3);
});

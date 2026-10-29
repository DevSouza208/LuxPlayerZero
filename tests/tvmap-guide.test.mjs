import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTvMap,loadTvGuide,tvMapGuideApi} from '../src/tvmap-guide.js';
import {cleanTvGuide,matchGuideChannels,GUIDE_TTL} from '../public/tvmap-model.js';
import {accountGate} from '../src/account-gate.js';
const NOW=Date.parse('2026-10-29T01:45:00Z');
// Estrutura dos elementos públicos observada na fonte; títulos sintéticos.
const html=(channel='AXN')=>`<h1>Programação da TV - Agora</h1><div id="zc-tn-top-1">22:30hs 23:00hs 23:30hs 00:00hs</div><table id="zc-st-1" class="zc-row"><tr><td><a class="zc-st-a" href="/AXN"><img src="/images/ch/505.jpg"></a><a class="zc-st-a" href="/AXN">${channel}</a></td><td><table><tr><td class="current-exhibition"><a class="zc-pg-t" href="/c100/Programa-atual">Programa &amp; episódio</a><p>35min/50min</p></td><td><a class="zc-pg-t" href="/c101/Proximo">A seguir</a><span class="zc-pg-e">23:00</span></td><td><a class="zc-pg-t" href="/c102/Madrugada">Madrugada</a><span class="zc-pg-e">00:30</span></td></tr></table></td></tr></table>`;
function bucket(){const rows=new Map();return {rows,async get(key){return rows.has(key)?{json:async()=>structuredClone(rows.get(key))}:null},async put(key,value){rows.set(key,JSON.parse(value))}};}
test('extrai somente nomes e horários publicados, com virada do dia em Brasília',()=>{
 const guide=parseTvMap(html(),NOW),row=guide.channels[0];assert.equal(row.name,'AXN');assert.equal(row.programs[0].title,'Programa & episódio');assert.equal(row.programs[0].start,Date.parse('2026-10-29T01:10:00Z'));assert.equal(row.programs[0].end,Date.parse('2026-10-29T02:00:00Z'));assert.equal(row.programs[2].start,Date.parse('2026-10-29T03:30:00Z'));assert.equal(row.programs[2].end,null);assert.equal(guide.windowEnd-guide.windowStart,3*3600000);assert.ok(!JSON.stringify(guide).includes('<table'));
});
test('recusa página sem grade, fora da janela ou maior que o limite',()=>{
 assert.throws(()=>parseTvMap('<html>Indisponível</html>',NOW));assert.throws(()=>parseTvMap(html(),NOW+6*3600000));assert.throws(()=>parseTvMap('x'.repeat(1500001),NOW));
});
test('sem horário final mantém fim desconhecido, sem inventar duração',()=>{
 const one=html().replace(/<td><a class="zc-pg-t" href="\/c101[\s\S]*?<\/table><\/td>/,'</tr></table></td>');const value=parseTvMap(one,NOW).channels[0].programs[0];assert.equal(value.start,null);assert.equal(value.end,null);assert.equal(value.progress,.7);
});
test('mapeamento preserva item e URL, reconhece aliases e não mistura afiliadas regionais',()=>{
 const guide=parseTvMap(html('SporTV2'),NOW),item={name:'SporTV 2 FHD',url:'https://private.test/original'},other={name:'Globo SP HD'};const mapped=matchGuideChannels(guide,[item,other]);assert.equal(mapped.length,1);assert.equal(mapped[0].item,item);assert.equal(item.url,'https://private.test/original');assert.equal(matchGuideChannels(parseTvMap(html('Globo'),NOW),[other]).length,0);
 assert.equal(matchGuideChannels(parseTvMap(html('Sony'),NOW),[{name:'Sony Channel HD'}]).length,1);assert.equal(matchGuideChannels(guide,[]).length,0);
});
test('limpa links e HTML estranhos sem publicar URLs de playlist',()=>{
 const raw=parseTvMap(html(),NOW);raw.channels[0].logo='https://private.test/image';raw.channels[0].programs[0].sourceUrl='https://evil.test/?key=private';raw.channels[0].url='https://private.test/stream';const clean=cleanTvGuide(raw);assert.equal(clean.channels[0].logo,'');assert.equal(clean.channels[0].programs[0].sourceUrl,'');assert.ok(!JSON.stringify(clean).includes('private'));assert.throws(()=>cleanTvGuide({version:1}));
});
test('cache R2 coalesce consultas e reaproveita a grade por quinze minutos, sem DB',async()=>{
 const CATALOG_BUCKET=bucket(),env={CATALOG_BUCKET,DB:{prepare(){assert.fail('Guia não deve usar D1')}}};let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(url,'https://tvmap.com.br/Principais');assert.equal(init.redirect,'manual');return new Response(html());};
 const results=await Promise.all([loadTvGuide(env,{now:NOW,fetcher}),loadTvGuide(env,{now:NOW,fetcher})]);assert.equal(calls,1);assert.equal(results[0].guide.channels.length,1);await loadTvGuide(env,{now:NOW+GUIDE_TTL-1,fetcher:()=>assert.fail()});assert.equal(calls,1);
});
test('falha da fonte preserva grade ainda válida e aplica pausa sem repetir fetch',async()=>{
 const CATALOG_BUCKET=bucket(),env={CATALOG_BUCKET};await loadTvGuide(env,{now:NOW,fetcher:async()=>new Response(html())});let calls=0;
 const result=await loadTvGuide(env,{now:NOW+GUIDE_TTL,fetcher:async()=>{calls++;return new Response('',{status:503})}});assert.equal(result.stale,true);assert.equal(result.guide.channels[0].name,'AXN');const second=await loadTvGuide(env,{now:NOW+GUIDE_TTL+1,fetcher:()=>assert.fail()});assert.equal(second.stale,true);assert.equal(calls,1);
});
test('API pública retorna só grade pública, sem consultar sessão, e não aceita POST',async()=>{
 const env={CATALOG_BUCKET:bucket(),DB:{prepare(){assert.fail('Não deve consultar usuário')}}};const now=Date.now();env.CATALOG_BUCKET.rows.set('editorial/tvmap-guide-v1.json',{version:1,fetchedAt:now,windowStart:now-60000,windowEnd:now-60000+3*3600000,channels:[{name:'AXN',programs:[{title:'Programa de teste',start:now-60000,end:now+60000,current:true}]}]});
 const request=new Request('https://lux.test/api/metadata/tv-guide');assert.equal(await accountGate(request,env),null);const response=await tvMapGuideApi(request,env);assert.equal(response.status,200);assert.equal((await response.json()).guide.channels[0].name,'AXN');
 // Teste de método não precisa de rede ou banco. Dados do endpoint usam a grade validada pelo cache.
 assert.equal((await tvMapGuideApi(new Request(request.url,{method:'POST'}),env)).status,405);
});

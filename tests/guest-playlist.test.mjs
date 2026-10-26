import test from 'node:test';
import assert from 'node:assert/strict';
import { importGuestPlaylist } from '../src/guest-playlist.js';
import { catalog, sign } from '../src/bridge-core.js';
import { syncCatalog, serveCatalog } from '../src/catalog-snapshot.js';
import { createBridge } from '../public/gateway.js';
const origin='https://lux.example';
const env={BRIDGE_ACCESS_KEY:'test-only-server-bridge-secret-123456',BRIDGE_ALLOWED_HOSTS:'source.example',DB:{prepare(){throw Error('Guest must not query D1')}},CATALOG_BUCKET:{get(){throw Error('Guest must not read R2')},put(){throw Error('Guest must not write R2')}}};
const req=(body={url:'http://source.example/get.php?username=test&password=private'},o=origin)=>new Request(origin+'/api/bridge/import',{method:'POST',headers:{origin:o,'content-type':'application/json'},body:JSON.stringify(body)});
const m3u='#EXTM3U\r\n#EXTINF:-1 group-title="TV",Canal\r\nhttp://source.example/live/original.ts\r\n';
test('visitante recebe M3U intacta sem chave, cookie ou acesso ao armazenamento',async()=>{
 let hits=0;const response=await importGuestPlaylist(req(),env,async(url,options)=>{hits++;assert.equal(options.redirect,'manual');return new Response(m3u)});
 assert.equal(response.status,200);assert.equal(await response.text(),m3u);assert.equal(hits,1);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
});
test('visitante não ganha sessão nem acesso aos endpoints privados',async()=>{
 assert.equal((await catalog(req(),env)).status,401);
 assert.equal((await syncCatalog(req(),env)).status,401);
 assert.equal((await serveCatalog(new Request(origin+'/api/bridge/playlist?id=other'),env)).status,401);
});
test('importação rejeita CSRF, URL externa, rede privada e redirecionamento externo',async()=>{
 const never=async()=>{throw Error('must not fetch')};
 assert.equal((await importGuestPlaylist(req({},'https://evil.example'),env,never)).status,403);
 for(const url of ['http://evil.example/list','http://127.0.0.1/list','file:///private'])assert.equal((await importGuestPlaylist(req({url}),env,never)).status,400);
 const r=await importGuestPlaylist(req(),env,async()=>new Response(null,{status:302,headers:{location:'http://evil.example/private'}}));assert.equal(r.status,502);
});
test('payload, resposta inválida e tamanho declarado são limitados sem expor URLs',async()=>{
 assert.equal((await importGuestPlaylist(req({url:'a'.repeat(9000)}),env)).status,400);
 const bad=await importGuestPlaylist(req(),env,async()=>new Response('<html>source password private</html>'));assert.equal(bad.status,502);assert.doesNotMatch(await bad.text(),/source\.example|password|private/);
 assert.equal((await importGuestPlaylist(req(),env,async()=>new Response(m3u,{headers:{'content-length':String(257*1024*1024)}}))).status,413);
});
test('M3U com cabeçalho dividido em chunks permanece intacta',async()=>{
 const encoder=new TextEncoder();const chunks=['#EX','TM3U\n','#EXTINF:-1,Canal\nhttp://source.example/live/1'];
 const response=await importGuestPlaylist(req(),env,async()=>new Response(new ReadableStream({pull(c){if(chunks.length)c.enqueue(encoder.encode(chunks.shift()));else c.close()}})));
 assert.equal(response.status,200);assert.match(await response.text(),/^#EXTM3U\n#EXTINF/);
});
test('cliente de importação não solicita connect nem envia chave',async()=>{
 const original=globalThis.fetch;const calls=[];
 try{globalThis.fetch=async(path,options)=>{calls.push({path,body:JSON.parse(options.body)});return new Response(m3u)};
 const bridge=createBridge();assert.equal(await bridge.importPlaylist('http://source.example/list'),m3u);
 assert.deepEqual(calls,[{path:'/api/bridge/import',body:{url:'http://source.example/list'}}]);assert.equal(bridge.isConnected(),false);
 }finally{globalThis.fetch=original}
});

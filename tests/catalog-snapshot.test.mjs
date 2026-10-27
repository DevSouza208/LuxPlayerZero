import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCatalog, serveCatalog, snapshotReady } from '../src/catalog-snapshot.js';
import { connect, status } from '../src/bridge-core.js';

const origin = 'https://luxzero.example';
const baseEnv = {
  BRIDGE_ACCESS_KEY: 'senha-de-teste-forte-apenas-para-ambiente-de-testes',
  BRIDGE_ALLOWED_HOSTS: 'lista.example.org:8080'
};
const original = 'http://lista.example.org:8080/get.php?username=cliente&password=privada';
const m3u = '#EXTM3U\n#EXTINF:-1 group-title="Ao vivo",Canal de teste\nhttp://lista.example.org:8080/live/cliente/privada/1.m3u8\n';

function mockResources() {
  const objects = new Map();
  const rows = new Map();
  let failD1 = false;
  const database = {
    prepare(query) {
      const sql = String(query).replace(/\s+/g, ' ').trim().toUpperCase();
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('WHERE SOURCE_HASH =')) return rows.get(params[0]) || null;
              if (sql.includes('WHERE CATALOG_ID =')) return [...rows.values()].find(x => x.catalog_id === params[0]) || null;
              throw new Error('Consulta inesperada: ' + sql);
            },
            async run() {
              if (!sql.startsWith('INSERT INTO')) throw new Error('Comando inesperado');
              if (failD1) throw new Error('Falha do banco de teste');
              const [source_hash, catalog_id, r2_key, synced_at, item_count, size_bytes] = params;
              rows.set(source_hash, { source_hash, catalog_id, r2_key, synced_at, item_count, size_bytes });
              return { success: true };
            }
          };
        },
        async run() {
          if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) return { success: true };
          throw new Error('Comando inesperado: ' + sql);
        }
      };
    }
  };
  const bucket = {
    async put(key, value) { objects.set(key, String(value)); },
    async createMultipartUpload(key) {
      const uploaded = new Map();
      return {
        async uploadPart(number, value) {
          uploaded.set(number, Uint8Array.from(value));
          return { partNumber: number, etag: 'test-' + number };
        },
        async complete(parts) {
          const ordered = parts.map(part => uploaded.get(part.partNumber));
          const total = ordered.reduce((sum, bytes) => sum + bytes.byteLength, 0);
          const result = new Uint8Array(total);
          let offset = 0;
          for (const bytes of ordered) { result.set(bytes, offset); offset += bytes.byteLength; }
          objects.set(key, new TextDecoder().decode(result));
          return { key };
        },
        async abort() { uploaded.clear(); }
      };
    },
    async get(key) {
      const content = objects.get(key);
      if (content === undefined) return null;
      return { body: new Response(content).body, size: new TextEncoder().encode(content).length };
    },
    async delete(key) { objects.delete(key); }
  };
  return {
    env: { ...baseEnv, DB: database, CATALOG_BUCKET: bucket },
    objects, rows, failDatabase(value) { failD1 = value; }
  };
}
function req(path, method='GET', body, cookie='') {
  return new Request(origin + '/api/bridge/' + path, {
    method,
    headers: { ...(method==='POST' ? { origin, 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    ...(method==='POST' ? { body: JSON.stringify(body) } : {})
  });
}
async function cookie(env) {
  const result = await connect(req('connect','POST',{key:env.BRIDGE_ACCESS_KEY}), env);
  assert.equal(result.status, 200);
  return result.headers.get('set-cookie').split(';')[0];
}
const fetchMock = async url => {
  assert.equal(url, original);
  return new Response(m3u, { headers: { 'content-type': 'audio/x-mpegurl' } });
};

test('sem R2 ou D1, a sincronização permanece desativada com erro claro', async () => {
  assert.equal(snapshotReady(baseEnv), false);
  const r=await syncCatalog(req('sync','POST',{url:original}), baseEnv);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /R2|D1/);
});

test('status da ponte informa quando R2 e D1 estão ligados', async () => {
  const {env}=mockResources();
  assert.equal(snapshotReady(env), true);
  const response=await status(req('status'),env);
  assert.equal((await response.json()).snapshotReady, true);
});

test('não recebe nem serve lista privada sem sessão autenticada', async () => {
  const {env}=mockResources();
  assert.equal((await syncCatalog(req('sync','POST',{url:original}),env,fetchMock)).status,401);
  assert.equal((await serveCatalog(req('playlist?id=00000000-0000-4000-8000-000000000000'),env)).status,401);
});

test('sincronização HTTP grava M3U original no R2, referência no D1 e devolve catálogo HTTPS', async () => {
  const {env,objects,rows}=mockResources();
  const sessionCookie=await cookie(env);
  const response=await syncCatalog(req('sync','POST',{url:original},sessionCookie),env,fetchMock);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.match(data.url,/^\/api\/bridge\/playlist\?id=[a-f0-9-]+$/);
  assert.equal(data.cached,false);
  assert.equal(data.itemCount,1);
  assert.equal(rows.size,1);
  assert.equal(objects.size,1);
  const record=[...rows.values()][0];
  assert.equal(record.catalog_id,data.catalogId);
  assert.ok(record.r2_key.startsWith('catalogos/'));
  assert.doesNotMatch(JSON.stringify(record), /password|privada|username/);
  assert.equal([...objects.values()][0],m3u);
  const read=await serveCatalog(new Request(origin+data.url,{headers:{cookie:sessionCookie}}),env);
  assert.equal(read.status,200);
  assert.equal(read.headers.get('cache-control'),'private, no-store');
  assert.equal(await read.text(),m3u);
});

test('HTTP com senha não aparece no endereço HTTPS retornado', async () => {
  const {env}=mockResources();
  const c=await cookie(env);
  const r=await syncCatalog(req('sync','POST',{url:original},c),env,fetchMock);
  const data=await r.json();
  assert.doesNotMatch(JSON.stringify(data),/cliente|privada|username|password/);
});

test('segunda sincronização mantém endereço HTTPS e remove cópia anterior do R2', async () => {
  const {env,objects}=mockResources();
  const c=await cookie(env);
  const first=await (await syncCatalog(req('sync','POST',{url:original},c),env,fetchMock)).json();
  const second=await (await syncCatalog(req('sync','POST',{url:original},c),env,fetchMock)).json();
  assert.equal(first.url,second.url);
  assert.equal(second.cached,false);
  assert.equal(objects.size,1);
});

test('se origem falha, usa a última versão salva em R2', async () => {
  const {env}=mockResources();
  const c=await cookie(env);
  const first=await (await syncCatalog(req('sync','POST',{url:original},c),env,fetchMock)).json();
  const failed=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response('erro',{status:502}));
  assert.equal(failed.status,200);
  const backup=await failed.json();
  assert.equal(backup.cached,true);
  assert.equal(backup.url,first.url);
});

test('rejeita HTML devolvido pelo provedor e jamais grava páginas inteiras no R2', async () => {
  const {env,objects}=mockResources();
  const c=await cookie(env);
  const r=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response('<html>login</html>'));
  assert.equal(r.status,502);
  assert.equal(objects.size,0);
});

test('falha ao registrar D1 remove objeto novo para evitar cópias órfãs', async () => {
  const obj=mockResources();
  obj.failDatabase(true);
  const c=await cookie(obj.env);
  const r=await syncCatalog(req('sync','POST',{url:original},c),obj.env,fetchMock);
  assert.equal(r.status,502);
  assert.equal(obj.objects.size,0);
  assert.equal(obj.rows.size,0);
});

test('não permite que a origem HTTP redirecione para servidores fora da lista', async () => {
  const {env,objects}=mockResources();
  const c=await cookie(env);
  const r=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/admin'}}));
  assert.equal(r.status,502);
  assert.equal(objects.size,0);
});

test('diagnóstico identifica HTTP do fornecedor sem expor credenciais', async () => {
  const {env}=mockResources();
  const c=await cookie(env);
  const r=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response('proibido',{status:403}));
  assert.equal(r.status,502);
  const data=await r.json();
  assert.match(data.error,/HTTP 403/);
  assert.doesNotMatch(JSON.stringify(data),/cliente|privada|password|username/);
});

test('diagnóstico distingue limite de tamanho, HTML e timeout', async () => {
  const {env}=mockResources();
  const c=await cookie(env);
  const large=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response('x',{headers:{'content-length':String(257*1024*1024)}}));
  assert.equal(large.status,413);
  assert.match((await large.json()).error,/256 MB/);
  const html=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response('<html>login</html>'));
  assert.match((await html.json()).error,/HTML/);
  const timed=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>{const error=new Error('The operation timed out');error.name='TimeoutError';throw error;});
  assert.equal(timed.status,504);
  assert.match((await timed.json()).error,/180 segundos/);
});

test('playlist maior que 20 MiB é aceita em partes até 256 MiB', async () => {
  const {env,objects}=mockResources();
  const c=await cookie(env);
  const entry = '#EXTINF:-1,Canal de teste\nhttp://lista.example.org:8080/live/1.ts\n';
  const repeat = Math.ceil(21 * 1024 * 1024 / entry.length);
  const content = '#EXTM3U\n' + entry.repeat(repeat);
  const response=await syncCatalog(req('sync','POST',{url:original},c),env,
    async()=>new Response(content));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.bytes,new TextEncoder().encode(content).byteLength);
  assert.equal(data.itemCount,repeat);
  assert.equal([...objects.values()][0],content);
});

test('reconexão explícita não apresenta snapshot antigo como download novo',async()=>{
 const {env,objects}=mockResources(),c=await cookie(env);
 const first=await(await syncCatalog(req('sync','POST',{url:original},c),env,fetchMock)).json();
 const failed=await syncCatalog(req('sync','POST',{url:original,requireFresh:true},c),env,async()=>new Response('erro',{status:502}));
 assert.equal(failed.status,502);assert.equal(objects.size,1);
 const saved=await serveCatalog(req('playlist?id='+first.catalogId,'GET',null,c),env);
 assert.equal(await saved.text(),m3u);
});
test('download truncado não substitui a playlist inteira no R2',async()=>{
 const {env,objects}=mockResources(),c=await cookie(env);
 await syncCatalog(req('sync','POST',{url:original},c),env,fetchMock);
 const failed=await syncCatalog(req('sync','POST',{url:original,requireFresh:true},c),env,async()=>new Response(m3u,{headers:{'content-length':String(new TextEncoder().encode(m3u).length+1000)}}));
 assert.equal(failed.status,502);assert.match((await failed.json()).error,/incompleto/);assert.equal(objects.size,1);
});

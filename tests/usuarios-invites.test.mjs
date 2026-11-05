import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {accountApi} from '../src/account-api.js';
import {serveCatalog} from '../src/catalog-snapshot.js';
import {serveCatalogVersion} from '../src/catalog-version.js';

const origin='https://lux.test';
const M3U='#EXTM3U\n#EXTINF:-1 group-title="Filmes",Filme privado\nhttps://media.example/filme.mp4\n';

function setup() {
  const db=new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE usuarios(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,usuario TEXT NOT NULL UNIQUE,senha TEXT NOT NULL,lista_http TEXT,lista_https TEXT,nivel_acesso TEXT NOT NULL DEFAULT 'usuario');INSERT INTO usuarios(nome,usuario,senha,nivel_acesso) VALUES ('Admin','admin','test-admin-password','administrador');");
  const prepare=(sql,values=[])=>({
    bind(...next){return prepare(sql,next)},
    async first(){return db.prepare(sql).get(...values)||null},
    async all(){return {results:db.prepare(sql).all(...values)}},
    async run(){return {meta:db.prepare(sql).run(...values)}}
  });
  const DB={
    prepare,
    async batch(queries){
      db.exec('BEGIN');
      try {
        const values=[];
        for(const query of queries)values.push(await query.run());
        db.exec('COMMIT');
        return values;
      }catch(error){db.exec('ROLLBACK');throw error}
    }
  };
  const stored=new Map();
  const CATALOG_BUCKET={
    async createMultipartUpload(key) {
      const parts=new Map();
      return {
        async uploadPart(n,chunk){parts.set(n,Uint8Array.from(chunk));return {partNumber:n,etag:'test-'+n}},
        async complete(){
          const pieces=[...parts.entries()].sort((a,b)=>a[0]-b[0]).map(row=>row[1]);
          const total=pieces.reduce((n,v)=>n+v.length,0),all=new Uint8Array(total);
          let at=0;for(const bytes of pieces){all.set(bytes,at);at+=bytes.length}
          stored.set(key,all);
        },
        async abort(){parts.clear()}
      };
    },
    async put(key,body){stored.set(key,body instanceof Uint8Array?body:String(body))},
    async get(key){const value=stored.get(key);return value==null?null:{body:new Response(value).body}},
    async delete(key){stored.delete(key)}
  };
  const env={BRIDGE_ACCESS_KEY:'test-only-bridge-access-secret-at-least-32-characters',
    BRIDGE_ALLOWED_HOSTS:'source.example',DB,CATALOG_BUCKET};
  return {db,env,stored};
}
function req(path,body,token=''){
  return new Request(origin+'/api/account/'+path,{method:body===undefined?'GET':'POST',
    headers:{origin,'content-type':'application/json',cookie:token,'cf-connecting-ip':'127.0.0.1'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function call(env,path,body,token=''){
  const response=await accountApi(req(path,body,token),env);
  return {response,data:await response.clone().json().catch(()=>({}))};
}
async function login(env,identity,password){
  const {response,data}=await call(env,'login',{identity,password});
  assert.equal(response.status,200,JSON.stringify(data));
  return response.headers.get('set-cookie').split(';')[0];
}
function playlistReq(id,token,version=false){
  return new Request(origin+'/api/bridge/'+(version?'version':'playlist')+'?id='+id,{headers:{cookie:token}});
}

test('administrador gera convite privado, cadastro consome uma vez e cada conta recebe só sua M3U',async()=>{
  const {db,env}=setup();
  const admin=await login(env,'admin','test-admin-password');
  assert.equal((await call(env,'invite',{url:'https://source.example/get.php?username=x&password=x'},'')).response.status,401);
  const a=await call(env,'invite',{url:'https://source.example/get.php?username=a&password=a'},admin);
  assert.equal(a.response.status,200,JSON.stringify(a.data));
  assert.match(a.data.inviteUrl,/\/\?invite=[a-f0-9]{64}$/);
  assert.equal(db.prepare('SELECT source_cipher FROM usuarios_convites').get().source_cipher.includes('password=a'),false);
  const first=await call(env,'register',{identity:'usera',name:'Pessoa A',password:'senha-segura-a123',invite:a.data.token});
  assert.equal(first.response.status,200,JSON.stringify(first.data));
  assert.equal((await call(env,'register',{identity:'intruso',name:'Intruso',password:'senha-segura-z123',invite:a.data.token})).response.status,400);
  const b=await call(env,'invite',{url:'https://source.example/get.php?username=b&password=b'},admin);
  assert.equal(b.response.status,200);
  assert.equal((await call(env,'register',{identity:'userb',name:'Pessoa B',password:'senha-segura-b123',invite:b.data.token})).response.status,200);
  const ta=await login(env,'usera','senha-segura-a123');
  const tb=await login(env,'userb','senha-segura-b123');
  assert.equal((await call(env,'invite',{url:'https://source.example/get.php?username=c&password=c'},ta)).response.status,403);
  assert.equal((await call(env,'source',{lista_https:'https://source.example/steal'},ta)).response.status,403);
  assert.deepEqual((await call(env,'source',undefined,ta)).data,{lista_http:null,lista_https:null});

  const original=globalThis.fetch;
  const fetched=[];
  globalThis.fetch=async input=>{
    fetched.push(String(input));
    return new Response(M3U,{status:200,headers:{'content-type':'audio/x-mpegurl'}});
  };
  try{
    const dayA=await call(env,'daily-refresh',{},ta);
    assert.equal(dayA.response.status,200,JSON.stringify(dayA.data));
    const dayB=await call(env,'daily-refresh',{},tb);
    assert.equal(dayB.response.status,200,JSON.stringify(dayB.data));
    assert.notEqual(dayA.data.catalogId,dayB.data.catalogId);
    assert.match(dayA.data.url,/^https:\/\/lux\.test\/api\/bridge\/playlist\?id=/);
    assert.deepEqual(fetched.sort(),[
      'https://source.example/get.php?username=a&password=a',
      'https://source.example/get.php?username=b&password=b'
    ]);
    assert.deepEqual((await call(env,'source',undefined,ta)).data,{lista_http:null,lista_https:dayA.data.url});
    assert.deepEqual((await call(env,'source',undefined,tb)).data,{lista_http:null,lista_https:dayB.data.url});
    assert.equal((await call(env,'daily-refresh',undefined,ta)).data.needsRefresh,false);
    assert.equal((await call(env,'daily-refresh',{},ta)).data.alreadyUpdated,true);
    assert.equal(fetched.length,2,'a segunda visita do dia não baixa novamente');

    const own=await serveCatalog(playlistReq(dayA.data.catalogId,ta),env);
    assert.equal(own.status,200,await own.clone().text());
    assert.equal(await own.text(),M3U,'os bytes M3U originais são preservados');
    assert.equal((await serveCatalog(playlistReq(dayB.data.catalogId,ta),env)).status,403);
    assert.equal((await serveCatalogVersion(playlistReq(dayB.data.catalogId,ta,true),env)).status,403);
    assert.equal((await serveCatalogVersion(playlistReq(dayA.data.catalogId,ta,true),env)).status,200);

    db.prepare("UPDATE usuarios_atualizacoes SET day='2000-01-01' WHERE usuario_id=(SELECT id FROM usuarios WHERE usuario='usera')").run();
    const again=await call(env,'daily-refresh',{},ta);
    assert.equal(again.response.status,200,JSON.stringify(again.data));
    assert.equal(again.data.url,dayA.data.url,'a URL HTTPS permanece a mesma entre atualizações');

    db.prepare("UPDATE usuarios_atualizacoes SET day='2000-01-01' WHERE usuario_id=(SELECT id FROM usuarios WHERE usuario='usera')").run();
    globalThis.fetch=async()=>{throw Error('Fornecedor indisponível')};
    const failed=await call(env,'daily-refresh',{},ta);
    assert.equal(failed.response.status,502);
    assert.equal((await call(env,'source',undefined,ta)).data.lista_https,dayA.data.url);
    assert.equal((await serveCatalog(playlistReq(dayA.data.catalogId,ta),env)).status,200,'a última M3U continua disponível');
  }finally{globalThis.fetch=original}
});

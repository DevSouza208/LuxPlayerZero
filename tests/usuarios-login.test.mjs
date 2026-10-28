import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {accountApi} from '../src/account-api.js';
import {session} from '../src/account-security.js';
import {accountGate} from '../src/account-gate.js';
import {status,connect} from '../src/bridge-core.js';
const origin='https://lux.test';
function setup(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE usuarios(id INTEGER PRIMARY KEY AUTOINCREMENT,nome TEXT NOT NULL,usuario TEXT NOT NULL UNIQUE,senha TEXT NOT NULL,lista_http TEXT,lista_https TEXT,nivel_acesso TEXT NOT NULL DEFAULT 'usuario');INSERT INTO usuarios(nome,usuario,senha,nivel_acesso) VALUES ('Teste','teste','test-only-initial-password','administrador'),('Outra','outra','test-only-other-password','usuario');`);
 const prepare=(sql,params=[])=>({bind(...p){return prepare(sql,p)},async first(){return db.prepare(sql).get(...params)||null},async all(){return {results:db.prepare(sql).all(...params)}},async run(){return {meta:db.prepare(sql).run(...params)}}});
 return {db,env:{BRIDGE_ACCESS_KEY:'test-only-server-key-with-at-least-32-characters',BRIDGE_ALLOWED_HOSTS:'source.example',DB:{prepare,async batch(rows){return Promise.all(rows.map(r=>r.run()))}}}};
}
const req=(path,body,token='',from=origin)=>new Request(origin+'/api/account/'+path,{method:body===undefined?'GET':'POST',headers:{origin:from,'content-type':'application/json',cookie:token,'cf-connecting-ip':'127.0.0.1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function login(env,name='teste',password='test-only-initial-password'){
 const r=await accountApi(req('login',{identity:name,password}),env);assert.equal(r.status,200,await r.clone().text());return {response:r,token:r.headers.get('set-cookie').split(';')[0]};
}
test('login usa só usuarios, converte senha manual em hash e abre Cinema com perfil automático',async()=>{
 const {env,db}=setup(),{response,token}=await login(env);
 assert.match(db.prepare('SELECT senha FROM usuarios WHERE id=1').get().senha,/^lux\$1\$/);
 const body=await response.json();assert.equal(body.role,'admin');assert.ok(body.profileId);assert.ok(!('senha' in body));
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await session(req('session',undefined,token),env)).username,'teste');
 assert.equal(await accountGate(new Request(origin+'/cinema/',{headers:{cookie:token}}),env),null);
 assert.equal((await accountApi(req('state',undefined,token),env)).status,200);
 assert.equal((await(await status(new Request(origin+'/api/bridge/status',{headers:{cookie:token}}),env)).json()).connected,true);
 const bridge=await connect(new Request(origin+'/api/bridge/connect',{method:'POST',headers:{origin,'content-type':'application/json',cookie:token},body:'{}'}),env);assert.equal(bridge.status,200);
});
test('senha errada, origem externa e falta de sessão são rejeitadas',async()=>{
 const {env}=setup();assert.equal((await accountApi(req('login',{identity:'teste',password:'errada'}),env)).status,401);
 assert.equal((await accountApi(req('login',{identity:'teste',password:'test-only-initial-password'},'','https://evil.example'),env)).status,403);
 assert.equal((await accountApi(req('source'),env)).status,401);
});
test('edições no D1 revogam sessões e atualizam nível sem recadastrar usuário',async()=>{
 const {env,db}=setup(),{token}=await login(env);
 db.prepare("UPDATE usuarios SET nivel_acesso='usuario' WHERE id=1").run();assert.equal((await session(req('session',undefined,token),env)).role,'user');
 db.prepare("UPDATE usuarios SET nivel_acesso='bloqueado' WHERE id=1").run();assert.equal(await session(req('session',undefined,token),env),null);
 db.prepare("UPDATE usuarios SET nivel_acesso='usuario',senha='new-test-password' WHERE id=1").run();assert.equal(await session(req('session',undefined,token),env),null);
 await login(env,'teste','new-test-password');
 db.prepare('DELETE FROM usuarios WHERE id=1').run();assert.equal(await session(req('session',undefined,token),env),null);
});
test('cada conta só recebe sua própria lista e seu próprio estado',async()=>{
 const {env}=setup(),a=await login(env),b=await login(env,'outra','test-only-other-password');
 const source={lista_http:'http://source.example/get.php?username=test&password=test',lista_https:'https://lux.test/api/bridge/playlist?id=test'};
 assert.equal((await accountApi(req('source',source,a.token),env)).status,200);
 assert.deepEqual(await(await accountApi(req('source',undefined,a.token),env)).json(),source);
 assert.deepEqual(await(await accountApi(req('source',undefined,b.token),env)).json(),{lista_http:null,lista_https:null});
 const initial=await(await accountApi(req('state',undefined,a.token),env)).json();
 const saved=await accountApi(req('state',{profileId:initial.profileId,version:0,value:{favorites:[],recent:[],settings:{heroTitle:'Minha conta'}}},a.token),env);assert.equal(saved.status,200);
 const other=await(await accountApi(req('state',undefined,b.token),env)).json();assert.deepEqual(other.value,{});
 assert.equal((await accountApi(req('state',{profileId:other.profileId,version:0,value:{}},a.token),env)).status,400);
});
test('logout encerra sessão e excesso de tentativas é limitado',async()=>{
 const {env}=setup(),{token}=await login(env);assert.equal((await accountApi(req('logout',{},token),env)).status,200);assert.equal(await session(req('session',undefined,token),env),null);
 let response;for(let i=0;i<9;i++)response=await accountApi(req('login',{identity:'inexistente',password:'errada'}),env);assert.equal(response.status,429);
});

test('alterar senha pela conta atualiza usuarios e encerra todas as sessões',async()=>{
 const {env,db}=setup(),a=await login(env),b=await login(env);
 const changed=await accountApi(req('password',{current:'test-only-initial-password',password:'new-test-only-password'},a.token),env);assert.equal(changed.status,200);
 assert.match(db.prepare('SELECT senha FROM usuarios WHERE id=1').get().senha,/^lux\$1\$/);
 assert.equal(await session(req('session',undefined,a.token),env),null);assert.equal(await session(req('session',undefined,b.token),env),null);
 await login(env,'teste','new-test-only-password');
});
test('limite autenticado barra gravação antes do UPDATE e mantém logout disponível',async()=>{
 const {env,db}=setup(),{token}=await login(env);let key;
 env.PROFILE_SYNC_LIMIT={async limit(input){key=input.key;return {success:false}}};
 const response=await accountApi(req('state',{profileId:'usuario:1',version:0,value:{}},token),env);
 assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
 assert.equal(key,'sync:usuario:1');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM usuarios_estado').get().n,0);
 env.ACCOUNT_REQUEST_LIMIT={async limit(){return {success:false}}};
 assert.equal((await accountApi(req('profiles',undefined,token),env)).status,429);
 assert.equal((await accountApi(req('logout',{},token),env)).status,200);
});

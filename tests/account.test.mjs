import test from 'node:test';
import assert from 'node:assert/strict';
import { accountApi } from '../src/account-api.js';
import { accountGate } from '../src/account-gate.js';
import { database } from './helpers/d1.mjs';
const origin='https://lux.example';
function setup(){
 const env={DB:database(),LUX_AUTH_PEPPER:'test-only-random-pepper-not-for-production',LUX_ADMIN_BOOTSTRAP_PASSWORD:'test-only-strong-bootstrap-password'};
 async function call(path,body,token='',extra={}){
  return accountApi(new Request(origin+'/api/account/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',cookie:token,...extra},body:body?JSON.stringify(body):undefined}),env);
 }
 return {env,call};
}
const tokenOf=r=>r.headers.get('set-cookie')?.split(';')[0];
async function admin(ctx){const r=await ctx.call('login',{identity:'admin',password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD});assert.equal(r.status,200);return tokenOf(r)}
async function member(ctx,adminCookie,name='alice'){
 const invite=await (await ctx.call('invite',{},adminCookie)).json();
 const r=await ctx.call('register',{identity:name,password:'test-member-password',invite:invite.token});assert.equal(r.status,200);return tokenOf(r);
}
test('bootstrap forte, login real, cookie seguro, sem segredo nas respostas',async()=>{
 const ctx=setup(),cookie=await admin(ctx);
 assert.ok(cookie.startsWith('__Host-lux_account='));
 const r=await ctx.call('login',{identity:'admin',password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD});
 assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 assert.equal(JSON.stringify(await r.json()).includes('password'),false);
 assert.equal((await (await ctx.call('session',null,cookie)).json()).authenticated,true);
 assert.equal((await ctx.call('login',{identity:'admin',password:'incorrect'})).status,401);
 const weak=setup();weak.env.LUX_ADMIN_BOOTSTRAP_PASSWORD='1234';
 assert.equal((await weak.call('login',{identity:'admin',password:'1234'})).status,401);
});
test('convite de uso único, papéis e criação atômica',async()=>{
 const ctx=setup(),owner=await admin(ctx);
 const invitation=await (await ctx.call('invite',{},owner)).json();
 const body={identity:'alice',password:'test-member-password',invite:invitation.token};
 assert.equal((await ctx.call('register',body)).status,200);
 assert.equal((await ctx.call('register',{...body,identity:'bob'})).status,400);
 assert.equal(ctx.env.DB.db.prepare("SELECT COUNT(*) n FROM account_users WHERE username='bob'").get().n,0);
 const alice=tokenOf(await ctx.call('login',{identity:'alice',password:body.password}));
 assert.equal((await ctx.call('invite',{},alice)).status,403);
 assert.equal((await ctx.call('admin',null,alice)).status,403);
});
test('isolamento real de perfis, estado e sessões com SQLite',async()=>{
 const ctx=setup(),owner=await admin(ctx),alice=await member(ctx,owner),bob=await member(ctx,owner,'bob');
 assert.equal((await ctx.call('profiles',{name:'Alice',avatar:'luxite'},alice)).status,200);
 const p=(await (await ctx.call('profiles',null,alice)).json()).profiles[0];
 assert.equal((await ctx.call('profile/select',{id:p.id},bob)).status,404);
 assert.equal((await ctx.call('profiles',{id:p.id,name:'Ataque',avatar:'star'},bob)).status,404);
 assert.equal((await ctx.call('profile/delete',{id:p.id},bob)).status,404);
 assert.equal((await ctx.call('profile/select',{id:p.id},alice)).status,200);
 const value={favorites:[{key:'movie:1',name:'Filme',group:'Cinema',position:0,duration:0,url:'secret'}],recent:[],settings:{density:'compact',secret:'leak'}};
 assert.equal((await ctx.call('state',{profileId:p.id,version:0,value},alice)).status,200);
 assert.equal((await ctx.call('state',{profileId:p.id,version:0,value},alice)).status,409);
 const read=await (await ctx.call('state',null,alice)).json();assert.equal(read.version,1);
 assert.equal(JSON.stringify(read).includes('secret'),false);
 assert.equal((await ctx.call('state',{profileId:p.id,version:1,value},alice)).status,200);
 assert.equal((await ctx.call('state',null,bob)).status,409);
 const dev=await (await ctx.call('devices',null,alice)).json();
 await ctx.call('revoke',{id:dev.current},bob);
 assert.equal((await (await ctx.call('session',null,alice)).json()).authenticated,true);
 await ctx.call('logout',{},alice);
 assert.equal((await (await ctx.call('session',null,alice)).json()).authenticated,false);
});
test('CSRF, limite de payload real e limitação de tentativas',async()=>{
 const ctx=setup();
 assert.equal((await ctx.call('login',{identity:'admin',password:'x'},'',{origin:'https://evil.example'})).status,403);
 assert.equal((await ctx.call('login',{identity:'admin',password:'x'.repeat(10000)})).status,413);
 for(let i=0;i<8;i++)assert.equal((await ctx.call('login',{identity:'nobody',password:'wrong'})).status,401);
 assert.equal((await ctx.call('login',{identity:'nobody',password:'wrong'})).status,429);
});
test('desativação revoga sessões e troca de senha revoga todos os dispositivos',async()=>{
 const ctx=setup(),owner=await admin(ctx),alice=await member(ctx,owner);
 const users=await (await ctx.call('admin',null,owner)).json();const id=users.users.find(x=>x.username==='alice').id;
 assert.equal((await ctx.call('disable',{id},owner)).status,200);
 assert.equal((await (await ctx.call('session',null,alice)).json()).authenticated,false);
 assert.equal((await ctx.call('login',{identity:'alice',password:'test-member-password'})).status,401);
 assert.equal((await ctx.call('password',{current:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD,password:'new-test-only-password'},owner)).status,200);
 assert.equal((await (await ctx.call('session',null,owner)).json()).authenticated,false);
});
test('rotas internas exigem sessão e perfil; bridge não é modificado',async()=>{
 const ctx=setup();
 const response=await accountGate(new Request(origin+'/cinema/'),ctx.env);assert.equal(response.status,302);
 assert.equal(await accountGate(new Request(origin+'/api/bridge/catalog'),ctx.env),null);
 const cookie=await admin(ctx);
 assert.equal((await accountGate(new Request(origin+'/cinema/',{headers:{cookie}}),ctx.env)).headers.get('location'),'/account/');
});
test('PIN usa hash e bloqueia seleção sem PIN correto',async()=>{
 const ctx=setup(),owner=await admin(ctx);
 await ctx.call('profiles',{name:'Protegido',avatar:'luxite'},owner);
 const p=(await (await ctx.call('profiles',null,owner)).json()).profiles[0];
 assert.equal((await ctx.call('profile/pin',{id:p.id,password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD,pin:'583047'},owner)).status,200);
 assert.equal((await ctx.call('profile/select',{id:p.id,pin:'000000'},owner)).status,403);
 assert.equal((await ctx.call('profile/select',{id:p.id,pin:'583047'},owner)).status,200);
 assert.equal(ctx.env.DB.db.prepare('SELECT pin_hash FROM account_profiles').get().pin_hash.includes('583047'),false);
});

test('perfil padrão é privado, selecionado no login e nunca ignora PIN',async()=>{
 const ctx=setup(),owner=await admin(ctx),alice=await member(ctx,owner);
 await ctx.call('profiles',{name:'Principal',avatar:'luxite'},owner);
 const p=(await (await ctx.call('profiles',null,owner)).json()).profiles[0];
 assert.equal((await ctx.call('profile/default',{id:p.id},alice)).status,404);
 assert.equal((await ctx.call('profile/default',{id:p.id},owner)).status,200);
 assert.equal((await (await ctx.call('profiles',null,owner)).json()).profiles[0].is_default,1);
 const login=()=>ctx.call('login',{identity:'admin',password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD});
 const first=await login();assert.equal((await first.json()).profileId,p.id);
 assert.equal((await (await ctx.call('session',null,tokenOf(first))).json()).profileId,p.id);
 await ctx.call('profile/pin',{id:p.id,password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD,pin:'583047'},owner);
 assert.equal((await (await login()).json()).profileId,null);
 assert.equal((await ctx.call('profile/select',{id:p.id},tokenOf(first))).status,403);
 await ctx.call('profile/delete',{id:p.id},owner);
 assert.equal(ctx.env.DB.db.prepare('SELECT default_profile_id FROM account_preferences').get().default_profile_id,null);
 assert.equal((await (await login()).json()).profileId,null);
});

test('diagnóstico é exclusivo do admin e não devolve caminhos ou secrets',async()=>{
 const ctx=setup(),owner=await admin(ctx),alice=await member(ctx,owner);
 assert.equal((await ctx.call('diagnostics',null,alice)).status,403);
 ctx.env.TMDB_API_KEY='secret-value';ctx.env.CATALOG_BUCKET={private:'secret-bucket'};
 ctx.env.DB.db.exec("CREATE TABLE catalog_sources(synced_at TEXT,item_count INTEGER,size_bytes INTEGER,r2_key TEXT); INSERT INTO catalog_sources VALUES ('2026-10-17T00:00:00Z',1234,2048,'private-secret-path')");
 const r=await ctx.call('diagnostics',null,owner);assert.equal(r.status,200);
 const report=await r.json();assert.equal(report.catalogs[0].items,1234);assert.equal(report.modules.guide,'missing_migration');assert.equal(report.accounts.total,2);
 assert.equal(report.r2.status,'configured_not_probed');assert.equal(JSON.stringify(report).includes('secret'),false);
 assert.match(r.headers.get('cache-control'),/no-store/);
});

test('Lux ID autentica a mesma conta e compartilha limite com nome de usuário',async()=>{
 const ctx=setup(),owner=await admin(ctx);
 const session=await (await ctx.call('session',null,owner)).json();assert.match(session.luxId,/^LUX:[a-f0-9-]{36}$/);
 const alias=await ctx.call('login',{identity:session.luxId,password:ctx.env.LUX_ADMIN_BOOTSTRAP_PASSWORD});
 assert.equal(alias.status,200);assert.equal((await alias.json()).username,'admin');
 for(let i=0;i<8;i++)assert.equal((await ctx.call('login',{identity:i%2?session.luxId:'admin',password:'incorrect'})).status,401);
 assert.equal((await ctx.call('login',{identity:session.luxId,password:'incorrect'})).status,429);
});
test('limite por conta verificada funciona também no backend account e não impede logout',async()=>{
 const ctx=setup(),cookie=await admin(ctx);let key;
 ctx.env.PROFILE_SYNC_LIMIT={async limit(input){key=input.key;return {success:false}}};
 const response=await ctx.call('state',{profileId:'invalid',version:0,value:{}},cookie);
 assert.equal(response.status,429);assert.match(key,/^sync:/);
 assert.equal(response.headers.get('retry-after'),'60');
 ctx.env.ACCOUNT_REQUEST_LIMIT={async limit(){return {success:false}}};
 assert.equal((await ctx.call('profiles',null,cookie)).status,429);
 assert.equal((await ctx.call('logout',{},cookie)).status,200);
});

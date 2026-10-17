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

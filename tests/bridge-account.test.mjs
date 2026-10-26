import test from 'node:test';
import assert from 'node:assert/strict';
import { accountApi } from '../src/account-api.js';
import { connect, status, catalog, seal } from '../src/bridge-core.js';
import { database } from './helpers/d1.mjs';
const origin = 'https://lux.example';
const request = (path, cookie='', body, requestOrigin=origin) => new Request(origin+path, {
  method: body ? 'POST' : 'GET', headers:{origin:requestOrigin,cookie,'content-type':'application/json'},
  body:body?JSON.stringify(body):undefined
});
test('Lux ID autoriza ponte sem chave e revogação encerra acesso', async () => {
  const env={DB:database(),LUX_AUTH_PEPPER:'test-only-account-pepper-long-enough',LUX_ADMIN_BOOTSTRAP_PASSWORD:'test-only-bootstrap-password',BRIDGE_ACCESS_KEY:'test-only-bridge-secret-long-enough',BRIDGE_ALLOWED_HOSTS:'source.example'};
  const login=await accountApi(request('/api/account/login','',{identity:'admin',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD}),env);
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const connected=await connect(request('/api/bridge/connect',cookie,{}),env);
  assert.equal(connected.status,200);
  assert.equal(connected.headers.get('set-cookie'),null);
  assert.doesNotMatch(await connected.text(),/test-only/);
  assert.equal((await (await status(request('/api/bridge/status',cookie),env)).json()).connected,true);
  let calls=0;
  const result=await catalog(request('/api/bridge/catalog',cookie,{url:'http://source.example/list'}),env,async()=>{calls++;return new Response('#EXTM3U\n#EXTINF:-1,Canal\nhttp://source.example/1')});
  assert.equal(result.status,200);assert.equal(calls,1);
  assert.equal((await connect(request('/api/bridge/connect',cookie,{},'https://evil.example'),env)).status,403);
  await accountApi(request('/api/account/logout',cookie,{}),env);
  assert.equal((await connect(request('/api/bridge/connect',cookie,{}),env)).status,401);
  assert.equal((await (await status(request('/api/bridge/status',cookie),env)).json()).connected,false);
  const legacy='lux_zero_bridge='+await seal({scope:'bridge-session',exp:Date.now()+60000},env);
  assert.equal((await connect(request('/api/bridge/connect',legacy,{key:env.BRIDGE_ACCESS_KEY}),env)).status,401);
  const denied=await catalog(request('/api/bridge/catalog','',{url:'http://source.example/list'}),env,async()=>{throw Error('must not fetch')});
  assert.equal(denied.status,401);
});

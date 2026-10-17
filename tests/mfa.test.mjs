import test from 'node:test';
import assert from 'node:assert/strict';
import {base32,totp,verifyMfa,mfaAction} from '../src/account-mfa.js';
import {accountApi} from '../src/account-api.js';
import {database} from './helpers/d1.mjs';
test('TOTP valida vetor RFC 6238 SHA-1 sem depender de serviço externo',async()=>{
 const secret=base32(new TextEncoder().encode('12345678901234567890'));
 assert.equal(await totp(secret,1,8),'94287082');assert.equal(await totp(secret,37037036,8),'07081804');
});
test('2FA confirmado exige código, bloqueia replay e permite recuperação uma vez',async()=>{
 const env={DB:database(),LUX_AUTH_PEPPER:'test-only-mfa-pepper-for-unit-test',LUX_ADMIN_BOOTSTRAP_PASSWORD:'test-only-mfa-bootstrap-password'};
 const response=await accountApi(new Request('https://lux.example/api/account/login',{method:'POST',headers:{origin:'https://lux.example','content-type':'application/json'},body:JSON.stringify({identity:'admin',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD})}),env);assert.equal(response.status,200);
 const account=env.DB.db.prepare('SELECT id,username,role FROM account_users').get(),user={...account,user_id:account.id};
 const data=await mfaAction(env,user,{action:'begin',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD});
 const step=Math.floor(Date.now()/30000),code=await totp(data.secret,step);
 const activated=await mfaAction(env,user,{action:'confirm',password:env.LUX_ADMIN_BOOTSTRAP_PASSWORD,code});
 assert.equal(activated.recovery.length,8);assert.equal(await verifyMfa(env,user.user_id,code),false);
 assert.equal(await verifyMfa(env,user.user_id,activated.recovery[0]),true);assert.equal(await verifyMfa(env,user.user_id,activated.recovery[0]),false);
 assert.equal(await verifyMfa(env,user.user_id,'000000'),false);
 assert.equal(env.DB.db.prepare('SELECT secret FROM account_mfa').get().secret.includes(data.secret),false);
});

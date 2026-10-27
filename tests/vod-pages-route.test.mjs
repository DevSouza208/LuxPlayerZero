import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('API administrativa é encaminhada ao Functions em vez do fallback HTML',()=>{
 const routes=JSON.parse(readFileSync(new URL('../public/_routes.json',import.meta.url),'utf8'));
 const path='/api/admin/vod',match=pattern=>pattern.endsWith('*')?path.startsWith(pattern.slice(0,-1)):path===pattern;
 assert.ok(routes.include.some(match));assert.equal(routes.exclude.some(match),false);
 const handler=readFileSync(new URL('../functions/api/admin/vod.js',import.meta.url),'utf8');assert.match(handler,/vodAdminApi\(request,env\)/);
});

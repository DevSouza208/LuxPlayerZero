import {editorialApi} from '../src/editorial-api.js';
// Local integration harness: in-memory SQLite, no production credentials.
import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { accountApi } from '../src/account-api.js';
import { accountGate } from '../src/account-gate.js';
import { database } from '../tests/helpers/d1.mjs';
const env={DB:database(),LUX_AUTH_PEPPER:'local-test-only-not-a-production-secret',LUX_ADMIN_BOOTSTRAP_PASSWORD:'local-test-only-bootstrap-password'};
env.DB.db.exec(await readFile('migrations/0004_editorial.sql','utf8'));
const root=resolve('public'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request('http://localhost:4173'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  let response;
  if(req.url.startsWith('/api/editorial/'))response=await editorialApi(request,env);
  else if(req.url.startsWith('/api/account/'))response=await accountApi(request,env);
  else response=await accountGate(request,env);
  if(!response&&req.url.startsWith('/api/bridge/'))response=new Response(JSON.stringify({configured:false,connected:false}),{headers:{'content-type':'application/json'}});
  if(!response&&req.url.startsWith('/api/metadata/'))response=new Response(JSON.stringify({configured:false}),{headers:{'content-type':'application/json'}});
  if(!response){let file=resolve(root,'.'+decodeURIComponent(new URL(request.url).pathname));if(!file.startsWith(root+'/')&&file!==root)throw Error('Path');if((await stat(file)).isDirectory())file=resolve(file,'index.html');response=new Response(await readFile(file),{headers:{'content-type':types[extname(file)]||'application/octet-stream'}})}
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(404);res.end('Not found')}
}).listen(4173,'127.0.0.1',()=>console.log('Local integration server: http://localhost:4173'));

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/cinema/sw.js',import.meta.url),'utf8');
test('capas visíveis são reutilizadas e o cache elimina as mais antigas',async()=>{
 const handlers={},data=new Map();let requests=0;
 const context=vm.createContext({URL,Request,Response,self:{location:{origin:'https://lux.example'},addEventListener:(name,fn)=>handlers[name]=fn},
 caches:{open:async()=>({match:async r=>data.get(r.url)?.clone(),put:async(r,v)=>data.set(r.url,v),keys:async()=>[...data.keys()].map(url=>({url})),delete:async r=>data.delete(r.url)})},fetch:async()=>{requests++;return new Response('image',{status:200})}});
 vm.runInContext(source,context);
 async function image(url){
  let result;handlers.fetch({request:{method:'GET',destination:'image',url},respondWith:p=>result=p});return result?await result:null;
 }
 // Usa Request real para testar a requisição CORS do worker.
 async function load(url){const request=new Request(url);Object.defineProperty(request,'destination',{value:'image'});let result;handlers.fetch({request,respondWith:p=>result=p});return result?await result:null}
 const url='https://image.tmdb.org/t/p/w500/a.jpg';
 await load(url);await load(url);assert.equal(requests,1);
 for(let i=0;i<125;i++)await load(`https://image.tmdb.org/t/p/w500/${i}.jpg`);
 assert.equal(data.size,120);assert.equal(data.has(url),false);
 assert.equal(await image('https://provider.example/poster.jpg?password=secret'),null);
 assert.equal(await image('http://provider.example/poster.jpg'),null);
 assert.equal(await image('https://provider.example/movie/stream.ts'),null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {scanVod,remainingTime} from '../public/vod-progress.js';
import {parseM3u} from '../public/playlist.js';
test('scan conta títulos únicos entre lotes e mantém referências sem URLs',async()=>{
 const text='#EXTM3U\n'+Array.from({length:801},(_,i)=>`#EXTINF:-1 group-title="FILMES",Filme (2020)\nhttps://test.example/movie/u/p/${i}.mp4\n`).join('');
 const calls=[],result=await scanVod(parseM3u(text),{onProgress:(n,total)=>calls.push([n,total])});assert.equal(result.filmes.length,1);assert.equal(result.filmes[0].referencias.length,801);assert.equal(result.series.length,0);assert.deepEqual(calls,[[400,801],[800,801],[801,801]]);assert.ok(!JSON.stringify(result).includes('/u/p/'));
});
test('scan pode ser cancelado e ETA depende de trabalho observado',async()=>{
 await assert.rejects(scanVod([{}],{cancelled:()=>true}),/interrompido/);assert.equal(remainingTime(0,100,5000),'calculando tempo…');assert.equal(remainingTime(50,100,10000),'~10s restantes');assert.equal(remainingTime(100,100,10000),'~0s restantes');
});

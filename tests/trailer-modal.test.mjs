import test from 'node:test';
import assert from 'node:assert/strict';
import {trailerVideos} from '../public/trailer-modal.js';
test('seletor de trailers aceita apenas IDs YouTube válidos e elimina duplicados',()=>{
 const url='https://www.youtube.com/watch?v=123456abcde';
 const rows=trailerVideos({trailer:url,videos:[{url,name:'Trailer em português',official:true},{url:'javascript:alert(1)'},{url:'https://evil.example/watch?v=123456abcde'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].key,'123456abcde');assert.equal(rows[0].name,'Trailer em português');
});
test('trailer principal funciona sem vídeos adicionais e obras sem vídeo ficam sem ação',()=>{
 assert.deepEqual(trailerVideos(),[]);
 assert.equal(trailerVideos({trailer:'https://www.youtube.com/watch?v=123456abcde'}).length,1);
});

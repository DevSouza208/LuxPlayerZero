import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTvEntries,tvCategory } from '../public/cinema-tv-groups.js';
import { buildSeriesIndex,parseEpisodeLabel } from '../public/cinema-series.js';
import { parseM3u } from '../public/playlist.js';
import { presentationForEntry } from '../public/cinema-title.js';
import { mediaFeatures } from '../public/media-taxonomy.js';
const item=(id,name,epgId='',group='TV')=>({id,name,epgId,group,url:'http://source.example/live/'+id});
test('TV preserva cada entrada, URLs repetidas e primeira fonte sem selecionar qualidade automaticamente',()=>{
 const a=item('a','Globo SP HD','globo.sp'),b=item('b','Globo SP 4K','globo.sp');b.url=a.url;
 const entries=[a,b,item('c','Globo RJ HD','globo.rj'),item('d','SporTV 1 HD'),item('e','Sport TV 2 HD'),item('f','Sport TV 3 HD')];
 const before=structuredClone(entries),index=groupTvEntries(entries);
 assert.equal(index.groups.length,5);assert.equal(index.sourceCount,6);
 assert.equal(index.groups.flatMap(x=>x.variants).length,6);assert.equal(index.groups[0].primary,a);
 assert.deepEqual(entries,before);assert.equal(index.groups[0].variantCount,2);
 assert.equal(tvCategory('SporTV'),'sports');assert.equal(tvCategory('Globo SP','24 horas'),'always_on');
});
test('tvg-id preservado pelo parser e nomes iguais com IDs diferentes não se fundem',()=>{
 const entries=parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="a",Canal HD\nhttps://example.com/1\n#EXTINF:-1 tvg-id="b",Canal HD\nhttps://example.com/2');
 assert.equal(entries[0].epgId,'a');assert.equal(groupTvEntries(entries).groups.length,2);
});
test('episódios reais, especiais, temporadas e versões com IDs explícitos',()=>{
 for(const name of ['Série S01E01','Série T1:E1','Série 1x01'])assert.equal(parseEpisodeLabel(name).episode,1);
 assert.equal(parseEpisodeLabel('Série S00E01').season,0);
 const rows=[item('a','Série S01E01','','Séries'),item('b','Série S02E03','','Séries'),item('c','Sem numeração','','Séries')];
 const index=buildSeriesIndex(rows);assert.equal(index.groups[0].episodes.length,2);assert.equal(index.representatives.length,2);
 assert.deepEqual(index.groups[0].seasons.map(x=>x.number),[1,2]);
 const different=rows.slice(0,2).map((row,i)=>({...row,seriesId:i+1}));assert.equal(buildSeriesIndex(different).groups.length,2);
});
test('normalização não perde fonte e mantém HDR, idiomas e ano declarados',()=>{
 const row=item('a','+ Duna (2021) - 4K','','Filmes | Ação');const before=structuredClone(row),meta=presentationForEntry(row);
 assert.equal(meta.displayName,'Duna');assert.equal(meta.catalogYear,2021);assert.deepEqual(row,before);
 assert.deepEqual(mediaFeatures('Original HDR 4K'),['Original','4K','HDR']);
});

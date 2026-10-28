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

import {nextEpisode} from '../public/cinema-series.js';
test('próximo episódio preserva fontes, ignora duplicatas e identifica lacunas',()=>{
 const rows=[{id:'a',name:'Série S01E01'},{id:'b',name:'Série S01E01'},{id:'c',name:'Série S01E02'},{id:'d',name:'Série S01E04'},{id:'e',name:'Série S02E01'}];
 const index=buildSeriesIndex(rows);
 assert.equal(nextEpisode(index,rows[0]).item,rows[2]);assert.equal(nextEpisode(index,rows[0]).contiguous,true);
 assert.equal(nextEpisode(index,rows[2]).item,rows[3]);assert.equal(nextEpisode(index,rows[2]).contiguous,false);
 assert.equal(nextEpisode(index,rows[3]).item,rows[4]);assert.equal(nextEpisode(index,rows[4]),null);assert.equal(nextEpisode(index,{id:'unknown'}),null);
 assert.equal(index.groups[0].episodes.length,rows.length);
 assert.equal(index.groups[0].uniqueEpisodes.length,4);
 assert.equal(index.groups[0].seasons[0].episodes.length,3);
 assert.deepEqual(index.groups[0].uniqueEpisodes[0].variants,[rows[0],rows[1]]);
});

test('seis fontes de Beyblade Burst viram um episódio sem misturar Beyblade X',()=>{
 const names=['Beyblade Burst S1 E1','Beyblade Burst S1 E1','- Beyblade Burst S1 E1','+ Beyblade Burst S1 E1','+ Beyblade Burst S1 E1','+ Beyblade Burst S1 E1','Beyblade Burst S1 E2','Beyblade X S1 E1'];
 const rows=names.map((name,i)=>{const entry=item(String(i),name,'','Séries');return {...entry,...presentationForEntry(entry)}}),before=structuredClone(rows),index=buildSeriesIndex(rows);
 assert.equal(index.groups.length,2);
 const burst=index.byItemId.get('0');assert.equal(burst.episodes.length,7);assert.equal(burst.uniqueEpisodes.length,2);assert.equal(burst.seasons[0].episodes.length,2);
 assert.deepEqual(burst.uniqueEpisodes[0].variants,rows.slice(0,6));assert.equal(index.byItemId.get('7').uniqueEpisodes.length,1);
 for(const entry of rows.slice(0,6)){assert.equal(index.byItemId.get(entry.id),burst);assert.equal(nextEpisode(index,entry).item,rows[6]);}
 assert.deepEqual(rows,before);
});

test('URL repetida não duplica a escolha de fonte e IDs de séries distintos permanecem separados',()=>{
 const a={...item('a','Mesmo título S01E01'),seriesId:'show-a'},duplicate={...a,id:'a-copy'},b={...item('b','Mesmo título S01E01'),seriesId:'show-b'};
 const index=buildSeriesIndex([a,duplicate,b]);assert.equal(index.groups.length,2);
 assert.equal(index.byItemId.get(a.id).episodes.length,2);assert.equal(index.byItemId.get(a.id).uniqueEpisodes[0].variants.length,1);
 assert.equal(index.byItemId.get(b.id).uniqueEpisodes[0].item,b);
});

test('IDs e numeração explicitamente declarados separam séries homônimas sem alterar URLs',()=>{
 const source='#EXTM3U\n#EXTINF:-1 group-title="Séries" series-id="show-a" episode-id="ep-8" series-name="Jornada" season-number="2" episode-number="8" episode-title="Chegada",Episódio especial\nhttp://example.org/series/a.mp4\n#EXTINF:-1 group-title="Séries" series-id="show-b" series-name="Jornada" season-number="1" episode-number="1",Outro episódio\nhttp://example.org/series/b.mp4';
 const items=parseM3u(source),index=buildSeriesIndex(items);
 assert.equal(index.groups.length,2);assert.equal(index.groups[0].episodes[0].number,8);assert.equal(index.groups[0].episodes[0].episodeId,'ep-8');
 assert.equal(index.groups[0].episodes[0].title,'Chegada');assert.equal(index.groups[0].episodes[0].item,items[0]);assert.equal(items[0].url,'http://example.org/series/a.mp4');
 const invalid=parseM3u(source.replace('season-number="2"','season-number="999"'));
 assert.equal(buildSeriesIndex(invalid).representatives.length,2);assert.equal(buildSeriesIndex(invalid).byItemId.has(invalid[0].id),false);
});

test('série reaproveita capa de outro episódio sem mudar representante ou URLs',()=>{
 const first={...item('a','Outside S01E01','','Séries'),logo:''};
 const second={...item('b','Outside S01E02','','Séries'),logo:'https://image.tmdb.org/t/p/w500/provider.jpg'};
 const other={...item('c','Outra Série S01E01','','Séries'),logo:'https://example.com/other.jpg'};
 const rows=[first,second,other],before=structuredClone(rows),index=buildSeriesIndex(rows);
 assert.equal(index.groups[0].poster,second.logo);assert.equal(index.byItemId.get(first.id).poster,second.logo);
 assert.equal(index.representatives[0],first);assert.equal(index.groups[1].poster,other.logo);
 assert.deepEqual(rows,before);
});
test('imagem insegura não impede aproveitar uma capa HTTPS posterior',()=>{
 const index=buildSeriesIndex([{...item('a','Série S1E1'),logo:'javascript:alert(1)'},{...item('b','Série S1E2'),logo:'https://example.com/poster.jpg'}]);
 assert.equal(index.groups[0].poster,'https://example.com/poster.jpg');
});

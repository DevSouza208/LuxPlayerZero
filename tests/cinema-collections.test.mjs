import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEpisodeLabel,buildSeriesIndex} from '../public/cinema-series.js';
import {groupTvEntries} from '../public/cinema-tv-groups.js';

test('Séries agrupadas por S01E01, T1:E2 e 1x03; sem inventar episódio',()=>{
 const a=parseEpisodeLabel('(Des)encanto S01E01 - Piloto');
 const b=parseEpisodeLabel('(Des)encanto T1:E2 - Segundo');
 assert.deepEqual([a.season,a.episode,a.showTitle],[1,1,'(Des)encanto']);
 assert.equal(b.episode,2);
 assert.equal(parseEpisodeLabel('Blade Runner 2049'),null);
 const rows=[
  {id:'c0',name:'(Des)encanto S01E01',url:'https://sample/1'},
  {id:'c1',name:'(Des)encanto T1:E2',url:'https://sample/2'},
  {id:'c2',name:'(Des)encanto S02E01',url:'https://sample/3'},
  {id:'c3',name:'Série sem episódio',url:'https://sample/4'}
 ];
 const idx=buildSeriesIndex(rows);
 assert.equal(idx.groups.length,1);
 assert.equal(idx.representatives.length,2);
 assert.equal(idx.groups[0].seasons.length,2);
 assert.equal(idx.groups[0].episodes.length,3);
 assert.equal(idx.byItemId.get('c1').title,'(Des)encanto');
 assert.equal(rows[1].name,'(Des)encanto T1:E2');
});
test('TV: tvg-id prioriza identidade, mantém variantes, separa diferentes EPG',()=>{
 const rows=[
  {id:'c1',name:'Globo SP FHD',tvgId:'Globo.SP',url:'https://a/1080.ts',group:'TV aberta'},
  {id:'c2',name:'Globo SP HD',tvgId:'Globo.SP',url:'http://a/720.ts',group:'TV aberta'},
  {id:'c3',name:'Globo RJ HD',tvgId:'Globo.RJ',url:'http://a/rj.ts',group:'TV aberta'},
  {id:'c4',name:'SporTV 2 4K',url:'https://a/s2.ts',group:'Esportes'},
  {id:'c5',name:'SporTV 2 HD',url:'https://a/s2hd.ts',group:'Esportes'}
 ];
 const groups=groupTvEntries(rows);
 assert.equal(groups.representatives.length,3);
 assert.equal(groups.groups[0].variants.length,2);
 assert.equal(groups.groups[0].primary.id,'c1');
 assert.equal(groups.groups[2].title,'SporTV 2');
 assert.equal(groups.groups[2].primary.id,'c4');
 assert.equal(rows.length,5);
});

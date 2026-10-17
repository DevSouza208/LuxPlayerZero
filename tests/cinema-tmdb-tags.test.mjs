import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3u } from '../public/playlist.js';
import { attachCinemaTmdbIds } from '../public/cinema-tmdb-tags.js';
import { tmdbQueryForItem } from '../public/tmdb-client.js';

test('Cinema recupera IDs explícitos sem alterar parser M3U original', () => {
  const text = '#EXTM3U\n' +
    '#EXTINF:-1 tvg-name="A Odisseia" tmdb-id="456" group-title="FILMES",+ A Odisseia (2026)\n' +
    'https://example.org/movie/001.mp4\n';
  const parsed = parseM3u(text);
  assert.equal(parsed[0].tmdbId,undefined);
  attachCinemaTmdbIds(text,parsed);
  assert.equal(parsed[0].tmdbId,456);
  assert.deepEqual(tmdbQueryForItem(parsed[0],'movies'),{
    type:'movie',title:'A Odisseia',year:2026,tmdbId:456
  });
});
test('tvg-id numérico é EPG; nunca assumir que seja TMDB', () => {
  const text = '#EXTM3U\n#EXTINF:-1 tvg-id="456" group-title="TV",Globo\nhttps://example.org/live.ts\n';
  const parsed = parseM3u(text);
  attachCinemaTmdbIds(text,parsed);
  assert.equal(parsed[0].tmdbId,undefined);
});
test('tvg-id="tmdb:123" e tmdb_id são aceitos apenas explicitamente', () => {
  const text = '#EXTM3U\n' +
    '#EXTINF:-1 tvg-id="tmdb:123" group-title="Filmes",Filme A\nhttps://example.org/a.mp4\n' +
    '#EXTINF:-1 tmdb_id="234" group-title="Séries",Série B\n#EXTGRP:Séries\nhttps://example.org/b.mp4\n';
  const parsed = parseM3u(text);
  attachCinemaTmdbIds(text,parsed);
  assert.deepEqual(parsed.map(item=>item.tmdbId),[123,234]);
});
test('IDs inválidos e linhas sem URL válida nunca associam outra mídia', () => {
  const text = '#EXTM3U\n' +
    '#EXTINF:-1 tmdb-id="0" group-title="Filmes",Não confundir\nhttps://example.org/a.mp4\n' +
    '#EXTINF:-1 tmdb-id="9999999999" group-title="Filmes",Invalido\nhttps://example.org/b.mp4\n' +
    '#EXTINF:-1 tmdb-id="789" group-title="Filmes",Sem fonte\nfile:///private/movie.mp4\n' +
    '#EXTINF:-1 group-title="Filmes",Válido\nhttps://example.org/d.mp4\n';
  const parsed = parseM3u(text);
  attachCinemaTmdbIds(text,parsed);
  assert.equal(parsed.length,3);
  assert.ok(parsed.every(item=>item.tmdbId==null));
});

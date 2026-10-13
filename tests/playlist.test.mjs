import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3u, isHttpUrl, normalizeXtreamBase, buildXtreamLiveUrl, inferKind } from '../public/playlist.js';

test('importa vídeo, rádio, categoria e URL de origem', () => {
  const list = '#EXTM3U\n#EXTINF:-1 group-title="Notícias" tvg-name="Canal Público",Canal 1\n/live/a.m3u8\n#EXTINF:-1 radio="true" group-title="Rádios",Estação\nhttps://radio.example/live.mp3';
  const channels = parseM3u(list, 'https://source.example/playlist.m3u');
  assert.equal(channels.length, 2);
  assert.equal(channels[0].name, 'Canal 1');
  assert.equal(channels[0].group, 'Notícias');
  assert.equal(channels[0].url, 'https://source.example/live/a.m3u8');
  assert.equal(channels[1].kind, 'radio');
});

test('não aceita esquemas perigosos dentro de playlists', () => {
  const items = parseM3u('#EXTM3U\n#EXTINF:-1,Malicioso\njavascript:alert(1)\n#EXTINF:-1,Correto\nhttps://example.org/video.mp4');
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Correto');
});

test('não confunde manifest HLS com catálogo M3U', () => {
  assert.throws(() => parseM3u('#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\na.ts'), /stream HLS/);
});

test('rejeita arquivo sem cabeçalho M3U', () => {
  assert.throws(() => parseM3u('https://example.org/video.mp4'), /não parece/);
});

test('restringe origem Xtream à raiz HTTP(S)', () => {
  assert.equal(normalizeXtreamBase('http://server.example:8080'), 'http://server.example:8080');
  assert.throws(() => normalizeXtreamBase('https://server.example/private/x'), /raiz/);
  assert.throws(() => normalizeXtreamBase('ftp://server.example'), /HTTP/);
});

test('gera URLs Xtream com credenciais codificadas', () => {
  assert.equal(
    buildXtreamLiveUrl('https://server.example', 'user+1', 'secret/x', 42, 'm3u8'),
    'https://server.example/live/user%2B1/secret%2Fx/42.m3u8'
  );
  assert.throws(() => buildXtreamLiveUrl('https://server.example','u','p','x'), /inválidos/);
});

test('classifica URLs de rádio sem afetar vídeos', () => {
  assert.equal(inferKind('Estação', 'https://example.org/stream.mp3'), 'radio');
  assert.equal(inferKind('Canal de TV', 'https://example.org/live.m3u8'), 'tv');
  assert.equal(isHttpUrl('data:text/html,test'), false);
});

test('playlist de demonstração é um catálogo M3U real com streams HTTPS autorizados', async () => {
  const { readFileSync } = await import('node:fs');
  const file = readFileSync(new URL('../public/demo/playlist.m3u', import.meta.url), 'utf8');
  const channels = parseM3u(file, 'https://luxplayerzero.pages.dev/demo/playlist.m3u');
  assert.ok(channels.length >= 2);
  assert.equal(channels.filter(c => c.url.startsWith('https://')).length >= 2, true);
  assert.equal(channels.some(c => c.url.startsWith('http://')), true);
  assert.ok(channels.some(c => c.url.endsWith('.m3u8')));
  assert.ok(channels.some(c => c.url.endsWith('.mp4')));
});

test('botão de demonstração usa importação M3U do servidor, não injeta uma lista no estado', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(source.includes("new URL('/demo/playlist.m3u', location.href)"));
  assert.ok(source.includes('parseM3u(text, url)'));
});

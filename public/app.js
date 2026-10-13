import { parseM3u, isHttpUrl, normalizeXtreamBase, buildXtreamLiveUrl, inferKind } from './playlist.js';
import { createBridge, isBridgeRequired } from './gateway.js';

const $ = id => document.getElementById(id);
const els = {
  form: $('source-form'), type: $('source-type'), url: $('source-url'), urlLabel: $('source-url-label'),
  creds: $('credentials-fields'), user: $('xc-user'), pass: $('xc-pass'), files: $('file-fields'),
  file: $('m3u-file'), connect: $('connect'), message: $('message'), clear: $('clear'),
  search: $('search'), filter: $('kind-filter'), channels: $('channels'), count: $('channel-count'),
  video: $('video'), audio: $('audio'), radio: $('audio-stage'), radioTitle: $('radio-title'),
  idle: $('idle-stage'), title: $('playing-title'), state: $('playback-state'), format: $('format'),
  diagnostics: $('diagnostics'), demo: $('demo'),
  bridgePanel: $('bridge-settings'), bridgeKey: $('bridge-key')
};

let channels = [];
let selected = null;
let player = null;
let hls = null;
let ts = null;
let operation = 0;
let sourceLoad = 0;
let watchdog = null;
let history = [];
const bridge = createBridge({
  getKey: () => els.bridgeKey.value.trim(),
  onStatus: message => {
    log('Ponte HTTPS', message);
    if (els.bridgeKey.value) els.bridgeKey.value = '';
  }
});
function updateBridgePanel() {
  const sourceIsHttp = isBridgeRequired(els.url.value);
  const catalogueHasHttp = channels.some(item => isBridgeRequired(item.url));
  els.bridgePanel.hidden = !(sourceIsHttp || catalogueHasHttp);
}
els.url.addEventListener('input', updateBridgePanel);

function note(message, tone = '') {
  els.message.textContent = message;
  els.message.className = 'message' + (tone ? ' ' + tone : '');
}
function log(event, detail = '') {
  // Não registrar URLs: caminhos Xtream podem carregar credenciais.
  const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  history.push(timestamp + ' · ' + event + (detail ? ' · ' + detail : ''));
  history = history.slice(-35);
  els.diagnostics.textContent = history.join('\n');
}
function state(value) { els.state.textContent = value.toUpperCase(); }
function errorText(error) {
  const text = error instanceof Error ? error.message : String(error);
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(text)) {
    return 'Não foi possível conectar. Confira rede, CORS e HTTPS/HTTP do servidor.';
  }
  // Nunca exibir URLs completas de streams/credenciais.
  if (/https?:\/\//i.test(text)) return 'O servidor recusou ou não conseguiu entregar esta fonte.';
  return text.slice(0, 190);
}
function fail(message) { note(message, 'error'); state('Erro'); log('Falha', message.slice(0, 110)); }
function protocolBlocked(url) {
  return location.protocol === 'https:' && String(url).toLowerCase().startsWith('http:');
}
function checkProtocol(url) {
  if (!isHttpUrl(url)) throw new Error('Informe uma URL HTTP ou HTTPS válida.');
  // HTTPS frontend acessa fontes HTTP pelo gateway autenticado, nunca diretamente.
}
function updateForm() {
  const mode = els.type.value;
  els.creds.hidden = mode !== 'xtream';
  els.files.hidden = mode !== 'm3u';
  els.urlLabel.textContent = mode === 'direct' ? 'ENDEREÇO DA MÍDIA' : mode === 'm3u' ? 'URL DA PLAYLIST' : 'SERVIDOR XTREAM';
  els.url.placeholder = mode === 'direct' ? 'https://.../stream.m3u8' : mode === 'm3u' ? 'https://.../lista.m3u' : 'https://servidor.exemplo:8080';
  updateBridgePanel();
}
async function request(url, as = 'text') {
  checkProtocol(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    if (isBridgeRequired(url)) {
      const text = await bridge.catalog(url);
      return as === 'json' ? JSON.parse(text) : text;
    }
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Servidor retornou HTTP ' + response.status + '.');
    const length = Number(response.headers.get('content-length')) || 0;
    if (length > 20 * 1024 * 1024) throw new Error('Resposta maior que o limite de 20 MB.');
    if (as === 'json') return response.json();
    const text = await response.text();
    if (text.length > 20 * 1024 * 1024) throw new Error('Playlist excede o limite de 20 MB.');
    return text;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Tempo de conexão esgotado (15 segundos).');
    throw error;
  } finally { clearTimeout(timeout); }
}
function setChannels(items, caption) {
  channels = items.map((item, index) => ({ ...item, id: 'c' + index }));
  selected = null;
  stop();
  els.search.value = '';
  els.filter.value = 'all';
  els.count.textContent = String(channels.length).padStart(2, '0');
  render();
  updateBridgePanel();
  note(channels.length + ' item(ns) disponíveis em ' + caption + '. Selecione um para reproduzir.');
  log('Catálogo importado', String(channels.length) + ' entradas');
}
function render() {
  const query = els.search.value.toLocaleLowerCase('pt-BR').trim();
  const kind = els.filter.value;
  const filtered = channels.filter(item =>
    (kind === 'all' || kind === item.kind) &&
    (!query || (item.name + ' ' + (item.group || '')).toLocaleLowerCase('pt-BR').includes(query))
  );
  els.channels.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = channels.length ? 'Nenhum resultado para esta busca.' : 'Sua biblioteca começa aqui.';
    els.channels.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of filtered.slice(0, 200)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'channel' + (selected?.id === item.id ? ' active' : '');
    btn.setAttribute('role', 'listitem');
    btn.title = item.name;
    const symbol = document.createElement('span');
    symbol.className = 'channel-icon';
    symbol.textContent = item.kind === 'radio' ? '♫' : '▶';
    const label = document.createElement('span');
    label.className = 'channel-content';
    const name = document.createElement('span');
    name.className = 'channel-name';
    name.textContent = item.name;
    const group = document.createElement('span');
    group.className = 'channel-group';
    group.textContent = item.group || (item.kind === 'radio' ? 'Rádio' : 'Vídeo');
    label.append(name, group);
    const arrow = document.createElement('span');
    arrow.className = 'channel-arrow';
    arrow.textContent = '↗';
    btn.append(symbol, label, arrow);
    btn.addEventListener('click', () => { void playItem(item); });
    fragment.append(btn);
  }
  if (filtered.length > 200) {
    const extra = document.createElement('div');
    extra.className = 'list-empty';
    extra.style.minHeight = '65px';
    extra.textContent = 'Exibindo 200 de ' + filtered.length + ' resultados. Use a busca para encontrar outros.';
    fragment.append(extra);
  }
  els.channels.append(fragment);
}
function cleanMedia(media) {
  try { media.pause(); } catch {}
  media.removeAttribute('src');
  try { media.load(); } catch {}
}
function stop() {
  operation++;
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  try { hls?.destroy(); } catch {}
  try { ts?.destroy(); } catch {}
  hls = null;
  ts = null;
  cleanMedia(els.video);
  cleanMedia(els.audio);
  player = null;
  els.video.hidden = true;
  els.radio.hidden = true;
  els.idle.hidden = false;
  els.title.textContent = 'Nenhuma mídia selecionada';
  els.format.textContent = 'SEM FONTE';
  state('Aguardando');
}
function streamType(url) {
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch {}
  if (/\.m3u8$/.test(path)) return 'HLS';
  if (/\.ts$/.test(path)) return 'MPEG-TS';
  if (/\.mpd$/.test(path)) return 'DASH';
  if (/\.(mp3|aac|ogg|opus|m4a|wav)$/.test(path)) return 'ÁUDIO';
  return 'NATIVO';
}
async function playItem(item) {
  stop();
  const generation = operation;
  selected = item;
  render();
  els.title.textContent = item.name;
  els.format.textContent = streamType(item.url);
  state('Conectando');
  log('Abrindo mídia', item.kind + ' / ' + streamType(item.url));
  try {
    checkProtocol(item.url);
    const sourceUrl = isBridgeRequired(item.url) ? await bridge.media(item.url) : item.url;
    if (generation !== operation) return;
    const media = item.kind === 'radio' ? els.audio : els.video;
    player = media;
    els.idle.hidden = true;
    els.radio.hidden = item.kind !== 'radio';
    els.video.hidden = item.kind === 'radio';
    els.radioTitle.textContent = item.name;

    const format = streamType(item.url);
    let waitForManifest = false;
    const attemptPlay = async () => {
      if (generation !== operation) return;
      try {
        if (ts) await ts.play();
        else await media.play();
      } catch (error) {
        if (generation !== operation) return;
        if (error?.name === 'NotAllowedError') {
          state('Clique para tocar');
          note('O navegador bloqueou a reprodução automática. Clique em Play no controle da mídia.', 'info');
        } else fail(errorText(error));
      }
    };
    if (format === 'HLS' && !media.canPlayType('application/vnd.apple.mpegurl')) {
      if (!window.Hls?.isSupported()) throw new Error('HLS.js indisponível ou não compatível. Verifique a conexão com a biblioteca de reprodução.');
      hls = new window.Hls({
        enableWorker: true, startLevel: -1, liveSyncDurationCount: 3, maxBufferLength: 30, backBufferLength: 20
      });
      let networkRetries = 0;
      let mediaRetries = 0;
      hls.on(window.Hls.Events.FRAG_LOADED, () => { networkRetries = 0; mediaRetries = 0; });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { void attemptPlay(); });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (generation !== operation || !data?.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          if (networkRetries++ < 2) {
            state('Recuperando');
            const attempt = networkRetries;
            setTimeout(() => {
              if (generation === operation && hls) {
                log('Nova tentativa HLS', 'rede / ' + attempt);
                hls.startLoad();
              }
            }, attempt * 900);
            return;
          }
          fail('Falha de rede HLS após 2 novas tentativas. Confira CORS e segmentos.');
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRetries++ < 2) {
            try { hls.recoverMediaError(); state('Recuperando'); return; } catch {}
          }
          fail('Não foi possível decodificar a mídia HLS após 2 tentativas.');
        } else {
          fail('Não foi possível reproduzir este stream HLS.');
        }
      });
      waitForManifest = true;
      hls.loadSource(sourceUrl);
      hls.attachMedia(media);
    } else if (format === 'MPEG-TS' && !media.canPlayType('video/mp2t')) {
      if (!window.mpegts?.isSupported()) throw new Error('MPEG-TS não é compatível com este navegador. Teste HLS ou um player nativo.');
      ts = window.mpegts.createPlayer({ type: 'mpegts', isLive: true, url: sourceUrl, cors: true }, {
        enableWorker: true, enableStashBuffer: false, lazyLoad: false, liveBufferLatencyChasing: true
      });
      ts.attachMediaElement(media);
      ts.on(window.mpegts.Events.ERROR, () => {
        if (generation === operation) fail('Falha MPEG-TS. Confira formato, CORS e disponibilidade do canal.');
      });
      ts.load();
    } else if (format === 'DASH') {
      throw new Error('DASH estará disponível na próxima integração. Por enquanto, use HLS, MP4 ou áudio.');
    } else {
      media.src = sourceUrl;
      media.load();
    }
    watchdog = setTimeout(() => {
      if (generation === operation && media.readyState < 2) fail('Sem dados de mídia após 20 segundos. Verifique a origem, o formato e a rede.');
    }, 20000);
    if (!waitForManifest) await attemptPlay();
  } catch (error) {
    if (generation === operation) fail(errorText(error));
  }
}
for (const media of [els.video, els.audio]) {
  media.addEventListener('playing', () => {
    if (player !== media) return;
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    state('Reproduzindo');
    note('Fonte aberta. Monitorando reprodução.');
    log('Reprodução iniciada');
  });
  media.addEventListener('waiting', () => { if (player === media) { state('Buffering'); log('Aguardando buffer'); } });
  media.addEventListener('error', () => {
    if (player === media && media.error) fail('O dispositivo não conseguiu reproduzir esta mídia (erro ' + media.error.code + ').');
  });
  media.addEventListener('ended', () => { if (player === media) state('Encerrado'); });
  media.addEventListener('pause', () => { if (player === media && !media.ended && media.readyState > 1) state('Pausado'); });
}
async function importSource(event) {
  event.preventDefault();
  const generation = ++sourceLoad;
  const mode = els.type.value;
  const input = els.url.value.trim();
  if (!input) { note('Informe o endereço da fonte.', 'error'); return; }
  updateBridgePanel();
  els.connect.disabled = true;
  els.connect.textContent = 'Conectando...';
  note('Carregando fonte...', 'info');
  try {
    if (mode === 'direct') {
      checkProtocol(input);
      if (generation === sourceLoad) setChannels([{ name: 'Mídia conectada', group: 'URL direta', kind: inferKind('Mídia conectada', input), url: input }], 'URL direta');
    } else if (mode === 'm3u') {
      const text = await request(input);
      const entries = parseM3u(text, input);
      if (!entries.length) throw new Error('A lista não contém mídias HTTP/HTTPS válidas.');
      if (generation === sourceLoad) setChannels(entries, 'M3U');
    } else {
      const base = normalizeXtreamBase(input);
      checkProtocol(base);
      const user = els.user.value.trim();
      const pass = els.pass.value;
      if (!user || !pass) throw new Error('Informe usuário e senha Xtream.');
      const authUrl = base + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass);
      const auth = await request(authUrl, 'json');
      if (!auth?.user_info || Number(auth.user_info.auth) !== 1) throw new Error('Credenciais Xtream recusadas pelo servidor.');
      const extension = Array.isArray(auth.user_info.allowed_output_formats) &&
        (auth.user_info.allowed_output_formats.includes('m3u8') || auth.user_info.allowed_output_formats.includes('hls')) ? 'm3u8' : 'ts';
      const streams = await request(authUrl + '&action=get_live_streams', 'json');
      if (!Array.isArray(streams)) throw new Error('API Xtream não retornou uma lista de canais válida.');
      const entries = streams.slice(0, 20000).filter(stream => /^\d+$/.test(String(stream.stream_id))).map(stream => ({
        name: String(stream.name || 'Canal sem nome'), group: 'Categoria ' + String(stream.category_id ?? 'geral'),
        kind: inferKind(String(stream.name || ''), '', stream.stream_type === 'radio'),
        url: buildXtreamLiveUrl(base, user, pass, stream.stream_id, extension)
      }));
      if (generation === sourceLoad) setChannels(entries, 'Xtream');
    }
  } catch (error) {
    if (generation === sourceLoad) fail(errorText(error));
  } finally {
    if (generation === sourceLoad) {
      els.connect.disabled = false;
      els.connect.innerHTML = 'Conectar fonte <span aria-hidden="true">↗</span>';
    }
  }
}
els.type.addEventListener('change', updateForm);
els.form.addEventListener('submit', event => { void importSource(event); });
els.file.addEventListener('change', async () => {
  const file = els.file.files?.[0];
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo excede 20 MB.');
    const entries = parseM3u(await file.text());
    if (!entries.length) throw new Error('Arquivo não contém canais válidos.');
    setChannels(entries, file.name);
    updateBridgePanel();
  } catch (error) { fail(errorText(error)); }
  finally { els.file.value = ''; }
});
els.search.addEventListener('input', render);
els.filter.addEventListener('change', render);
els.clear.addEventListener('click', () => { channels = []; selected = null; stop(); render(); updateBridgePanel(); els.count.textContent = '00'; note('Biblioteca limpa. Suas fontes não foram salvas no servidor.'); });
els.demo.addEventListener('click', () => setChannels([{
  name: 'Vídeo HLS de demonstração', group: 'Stream público de teste',
  kind: 'tv', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
}], 'demonstração'));
updateForm();
fetch('/api/health', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : null)
  .then(data => { if (data?.ok) log('Worker conectado', data.version); })
  .catch(() => log('Sem API Worker (pré-visualização local)'));

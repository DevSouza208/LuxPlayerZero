import {createCatalogCache} from './catalog-cache.js';
import {isGuestMode} from './guest-mode.js';
const guestCatalogCache = isGuestMode() ? createCatalogCache() : null;
import { parseM3u, isHttpUrl, normalizeXtreamBase, buildXtreamLiveUrl, inferKind } from './playlist.js';
import { createBridge, isBridgeRequired } from './gateway.js';
import { describeBridge } from './bridge-state.js';
import { preferHttps, xtreamM3uUrl } from './direct-source.js';
import { createHome } from './home.js';
import { presentationForEntry, titleForDisplay } from './cinema-title.js';
import { attachCinemaTmdbIds } from './cinema-tmdb-tags.js';
import { rememberSnapshot, savedSnapshot, forgetSnapshot, readSavedSnapshot, snapshotPath } from './saved-catalog.js';

const $ = id => document.getElementById(id);
// Não exibir Home vazia antes de recuperar o catálogo no R2.
const bootSplash = $('lux-boot');
const bootMessage = $('lux-boot-status');
const bootSkip = $('lux-boot-skip');
const MIN_BOOT_MS = 5000;
const bootStartedAt = window.__luxBootStarted ?? performance.now();
let bootFinishTimer = null;
let bootFinished = false;
const bootPhrases = ['A pipoca fica por sua conta 🍿', 'Qual vai ser a boa de hoje?', 'Só mais um episódio… a gente entende.', 'Seu próximo favorito pode estar aqui.', 'Acomode-se. O Lux já vai começar.'];
let bootPhraseIndex = Math.floor(Math.random() * bootPhrases.length);
function showBootPhrase() {
  if (bootMessage && !bootFinished) bootMessage.textContent = bootPhrases[bootPhraseIndex++ % bootPhrases.length];
}
showBootPhrase();
const bootPhraseTimer = setInterval(showBootPhrase, 3200);
function bootProgress(message) {
  if (bootMessage && !bootFinished) bootMessage.textContent = message;
}
function finishBoot() {
  if (bootFinished) return;
  const remaining = MIN_BOOT_MS - (performance.now() - bootStartedAt);
  if (remaining > 0) {
    if (bootFinishTimer === null) bootFinishTimer = setTimeout(() => { bootFinishTimer = null; finishBoot(); }, remaining);
    return;
  }
  bootFinished = true;
  clearTimeout(slowBootTimer);
  clearInterval(bootPhraseTimer);
  if (!bootSplash) return;
  bootSplash.classList.add('is-leaving');
  setTimeout(() => { bootSplash.hidden = true; }, 300);
}
bootSkip?.addEventListener('click', finishBoot);
const slowBootTimer = setTimeout(() => {
  if (!bootFinished) {
    bootProgress('Sua biblioteca está demorando mais que o esperado.');
    if (bootSkip) bootSkip.hidden = false;
  }
}, 16000);
const els = {
  form: $('source-form'), type: $('source-type'), url: $('source-url'), urlLabel: $('source-url-label'),
  creds: $('credentials-fields'), user: $('xc-user'), pass: $('xc-pass'), files: $('file-fields'),
  file: $('m3u-file'), connect: $('connect'), message: $('message'), clear: $('clear'),
  search: $('search'), filter: $('kind-filter'), channels: $('channels'), count: $('channel-count'),
  video: $('video'), audio: $('audio'), radio: $('audio-stage'), radioTitle: $('radio-title'),
  idle: $('idle-stage'), title: $('playing-title'), state: $('playback-state'), format: $('format'),
  diagnostics: $('diagnostics'), demo: $('demo'),
  bridgePanel: $('bridge-settings'), bridgeKey: $('bridge-key'),
  bridgeAvailability: $('bridge-availability'), bridgeKeyWrapper: $('bridge-key-wrap')
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
let bridgeStatus = null;
let bridgeNeeded = false;
// A referência privada do R2 é salva somente após uma importação bem-sucedida.
let lastSnapshotId = null;
// A vitrine é opcional: erros de interface nunca podem derrubar importação/reprodução.
let home = null;
try { home = createHome({ play: item => playItem(item) }); }
catch (error) { console.warn('Vitrine Lux indisponível; player original preservado.', error); }
function homeCall(method, ...args) {
  try { return home?.[method]?.(...args); }
  catch (error) { console.warn('Falha isolada da vitrine Lux:', method, error); }
}
const bridge = createBridge({
  onStatus: message => {
    log('Ponte HTTPS', message);
    if (els.bridgeKey.value) els.bridgeKey.value = '';
    void refreshBridgeStatus();
  }
});
function updateBridgePanel() {
  const sourceIsHttp = isBridgeRequired(els.url.value) && els.type.value !== 'direct';
  const catalogueHasHttp = channels.some(item => isBridgeRequired(item.url));
  // Não pedir uma chave para reproduzir vídeo: ela é somente para salvar a lista.
  const remembered = !channels.length && Boolean(savedSnapshot());
  const canReconnect = remembered && bridgeStatus?.snapshotReady && !bridgeStatus?.connected;
  els.bridgePanel.hidden = !(bridgeNeeded || (sourceIsHttp && bridgeStatus?.snapshotReady) || canReconnect);
  const reconnectPanel = $('restore-library-panel');
  if (reconnectPanel) reconnectPanel.hidden = !canReconnect;
  const presentation = describeBridge(bridgeStatus, catalogueHasHttp);
  els.bridgeAvailability.textContent = presentation.message;
  els.bridgeAvailability.dataset.kind = presentation.kind;
  els.bridgeKeyWrapper.hidden = !presentation.showKey;
}

async function refreshBridgeStatus() {
  try {
    const response = await fetch('/api/bridge/status', {
      credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer'
    });
    if (!response.ok) throw new Error('Gateway indisponível.');
    const data = await response.json();
    if (typeof data.configured !== 'boolean' || typeof data.connected !== 'boolean') {
      throw new Error('Resposta de status inválida.');
    }
    bridgeStatus = data;
    log('Pages Functions', data.configured ? 'Gateway instalado' : 'Gateway sem configuração privada');
  } catch {
    bridgeStatus = { configured: false, connected: false, mediaEnabled: false, snapshotReady: false };
    log('Pages Functions', 'Gateway indisponível');
  }
  updateBridgePanel();
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
  const isHttpCatalog = isBridgeRequired(url) && as === 'text';

  // Na presença do R2 e D1, buscamos HTTP pelo servidor e consumimos a M3U
  // servida por HTTPS; nunca reconstruímos os endereços dos canais.
  if (isHttpCatalog && bridgeStatus?.configured && !bridgeStatus.connected) {
    lastSnapshotId = null;
    return bridge.importPlaylist(url);
  }
  if (isHttpCatalog && bridgeStatus?.snapshotReady) {
    const result = await bridge.snapshot(url, { fresh: true });
    lastSnapshotId = result.catalogId || null;
    log('Catálogo', result.cached ? 'Última M3U recuperada do R2' :
      'M3U guardada no R2 e registrada no D1 (' + result.itemCount + ' itens)');
    return result.content;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // Na ausência de armazenamento configurado, manter HTTPS direto do Original.
    try {
      const response = await fetch(preferHttps(url), {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('Servidor respondeu HTTP ' + response.status + '.');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 20 * 1024 * 1024) throw new Error('Catálogo maior que 20 MB.');
      const text = await response.text();
      if (text.length > 20 * 1024 * 1024) throw new Error('Catálogo maior que 20 MB.');
      return as === 'json' ? JSON.parse(text) : text;
    } catch (error) {
      if (!isBridgeRequired(url)) throw error;
      bridgeNeeded = true;
      updateBridgePanel();

      if (isHttpCatalog && bridgeStatus?.snapshotReady) {
        const result = await bridge.snapshot(url, { fresh: true });
        lastSnapshotId = result.catalogId || null;
        log('Catálogo', result.cached ? 'Última M3U recuperada do R2' :
          'M3U guardada no R2 e registrada no D1 (' + result.itemCount + ' itens)');
        return result.content;
      }

      // Somente a consulta de metadados Xtream usa a API como última opção.
      if (as === 'json' && bridgeStatus?.configured) {
        const text = await bridge.catalog(url);
        return JSON.parse(text);
      }
      throw new Error('A fonte não entregou a lista por HTTPS. Para receber HTTP, conecte R2, D1 e chave da fonte na Cloudflare.');
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Tempo de conexão esgotado (15 segundos).');
    throw error;
  } finally { clearTimeout(timeout); }
}
let deliveryPanel;
function showDeliveryLink(id) {
  if (!deliveryPanel) {
    deliveryPanel=document.createElement('section');deliveryPanel.className='restore-library-panel';
    const label=document.createElement('label');label.textContent='LINK HTTPS DA SUA LISTA';
    const field=document.createElement('input');field.type='url';field.readOnly=true;field.setAttribute('aria-label','Link HTTPS da sua lista');
    label.append(field);const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar link HTTPS';
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);copy.textContent='Link copiado';}catch{field.focus();field.select();}});
    deliveryPanel.append(label,copy);els.form.after(deliveryPanel);
  }
  deliveryPanel.hidden=!id;
  if(id){deliveryPanel.querySelector('input').value=new URL(snapshotPath(id),location.origin).href;deliveryPanel.querySelector('button').textContent='Copiar link HTTPS';}
}
function setChannels(items, caption, snapshotId = null, persist = true) {
  if (persist && guestCatalogCache) void guestCatalogCache.save(items).then(saved => {
    if (!saved) log('Biblioteca', 'Não foi possível guardar o catálogo neste dispositivo.');
  });
  channels = items.map((item, index) => ({ ...item, id: 'c' + index, ...presentationForEntry(item) }));
  selected = null;
  stop();
  els.search.value = '';
  els.filter.value = 'all';
  els.count.textContent = String(channels.length).padStart(2, '0');
  render();
  updateBridgePanel();
  homeCall('setItems', channels);
  note(channels.length + ' item(ns) disponíveis em ' + caption + '. Selecione um para reproduzir.');
  log('Catálogo importado', String(channels.length) + ' entradas');
  showDeliveryLink(snapshotId);
  if (snapshotId) {
    if (!rememberSnapshot(snapshotId)) log('Memória da biblioteca', 'Armazenamento local indisponível');
    else log('Memória da biblioteca', 'Referência privada do R2 salva');
  } else forgetSnapshot();
}
function render() {
  const query = els.search.value.toLocaleLowerCase('pt-BR').trim();
  const kind = els.filter.value;
  const filtered = channels.filter(item =>
    (kind === 'all' || kind === item.kind) &&
    (!query || (titleForDisplay(item) + ' ' + item.name + ' ' + (item.group || '')).toLocaleLowerCase('pt-BR').includes(query))
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
    btn.title = titleForDisplay(item);
    const symbol = document.createElement('span');
    symbol.className = 'channel-icon';
    symbol.textContent = item.kind === 'radio' ? '♫' : '▶';
    const label = document.createElement('span');
    label.className = 'channel-content';
    const name = document.createElement('span');
    name.className = 'channel-name';
    name.textContent = titleForDisplay(item);
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
  homeCall('onSelect', item);
  render();
  els.title.textContent = titleForDisplay(item);
  els.format.textContent = streamType(item.url);
  state('Conectando');
  log('Abrindo mídia', item.kind + ' / ' + streamType(item.url));
  try {
    checkProtocol(item.url);
    // O catálogo preserva a URL original. Ao tocar, tentamos HTTPS direto.
    // A reprodução não depende do gateway, R2 ou de endereços reconstruídos.
    const sourceUrl = preferHttps(item.url);
    if (sourceUrl !== item.url) log('Reprodução', 'Tentando conexão HTTPS direta');
    if (generation !== operation) return;
    const media = item.kind === 'radio' ? els.audio : els.video;
    player = media;
    els.idle.hidden = true;
    els.radio.hidden = item.kind !== 'radio';
    els.video.hidden = item.kind === 'radio';
    els.radioTitle.textContent = titleForDisplay(item);

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
    homeCall('onPlaying', selected);
    note('Fonte aberta. Monitorando reprodução.');
    log('Reprodução iniciada');
  });
  media.addEventListener('loadedmetadata', () => {
    if (player !== media || !selected || !Number.isFinite(media.duration)) return;
    const position = homeCall('resumePosition', selected);
    if (position > 0 && media.seekable?.length) {
      try { media.currentTime = Math.min(position, Math.max(0, media.duration - 20)); } catch {}
    }
  });
  media.addEventListener('timeupdate', () => {
    if (player === media && selected) homeCall('onProgress', selected, media.currentTime, media.duration);
  });
  media.addEventListener('waiting', () => { if (player === media) { state('Buffering'); log('Aguardando buffer'); } });
  media.addEventListener('error', () => {
    if (player === media && media.error) fail('O dispositivo não conseguiu reproduzir esta mídia (erro ' + media.error.code + ').');
  });
  media.addEventListener('ended', () => { if (player === media) { state('Encerrado'); homeCall('onEnded', selected); } });
  media.addEventListener('pause', () => { if (player === media && !media.ended && media.readyState > 1) state('Pausado'); });
}
async function importSource(event) {
  event.preventDefault();
  const generation = ++sourceLoad;
  const mode = els.type.value;
  const input = els.url.value.trim();
  lastSnapshotId = null;
  if (!input) { note('Informe o endereço da fonte.', 'error'); return; }
  updateBridgePanel();
  els.connect.disabled = true;
  els.connect.textContent = 'Conectando...';
  note('Carregando fonte...', 'info');
  try {
    if (mode === 'direct') {
      checkProtocol(input);
      if (generation === sourceLoad) setCha…10396 tokens truncated…tylesheet" href="/home.css">
  <link rel="stylesheet" href="/cinema-premium.css">
  <link rel="stylesheet" href="/cinema-polish.css">
  <link rel="stylesheet" href="/cinema-browse.css">
  <script defer src="https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/mpegts.js@1.8.2/dist/mpegts.min.js"></script>
  <style>
    /* Primeiro paint: a biblioteca só aparece depois da recuperação do R2. */
    .lux-boot{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:19px;background:#030305;color:#e8d1ff;font-family:'Outfit',system-ui,sans-serif;opacity:1;transition:opacity .28s ease}
    .lux-boot[hidden]{display:none!important}
    .lux-boot.is-leaving{opacity:0;pointer-events:none}
    .lux-boot-title{display:flex;align-items:center;justify-content:center;gap:14px;font-size:clamp(17px,2.4vw,22px);font-weight:400}
    .lux-boot-symbol{font-size:32px;line-height:1;color:#c79aec;animation:lux-boot-breathe 1.7s ease-in-out infinite}
    .lux-boot-status{font-size:12px;color:#90869e;letter-spacing:.035em;min-height:18px}
    .lux-boot-skip{border:1px solid #4d405f;background:#1a1322;border-radius:9px;color:#d6b9f4;font:600 12px 'Outfit',system-ui,sans-serif;padding:10px 16px;cursor:pointer}
    .lux-boot-skip[hidden]{display:none!important}

    .lux-boot{overflow:hidden;isolation:isolate}
    .lux-galaxy{position:absolute;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,#05050d 5%,#08091b 55%,#020207 100%)}
    .lux-galaxy::before,.lux-galaxy::after{content:"";position:absolute;inset:-35%;border-radius:50%;will-change:transform;animation:lux-nebula-orbit 36s linear infinite;background:radial-gradient(ellipse at 30% 40%,#7139ad88 0%,transparent 34%),radial-gradient(ellipse at 68% 65%,#185ca488 0%,transparent 35%),radial-gradient(ellipse at 60% 28%,#9b377c55 0%,transparent 28%);opacity:.9}
    .lux-galaxy::after{animation-direction:reverse;animation-duration:51s;background:radial-gradient(ellipse at 65% 45%,#7138b366,transparent 30%),radial-gradient(ellipse at 30% 72%,#258b9955,transparent 32%)}
    .lux-galaxy-stars{position:absolute;inset:-12%;background-image:radial-gradient(1px 1px at 23px 37px,#eee5ffdd 98%,transparent),radial-gradient(1px 1px at 117px 92px,#98bbffbb 98%,transparent),radial-gradient(1.5px 1.5px at 202px 173px,#dcc7ffcc 98%,transparent);background-size:247px 229px,313px 277px,389px 347px;animation:lux-stars-drift 24s ease-in-out infinite alternate;opacity:.8}
    .lux-galaxy-stars:nth-child(2){transform:rotate(17deg);background-size:379px 337px,457px 419px,521px 487px;animation:lux-stars-drift 35s ease-in-out infinite alternate-reverse;opacity:.5}
    .lux-galaxy-shade{position:absolute;inset:0;background:radial-gradient(ellipse at center,#030305dd 0%,#03030588 25%,transparent 65%),linear-gradient(0deg,#030305bb,transparent 30%,transparent 75%,#03030588)}
    .lux-boot-title,.lux-boot-status{position:relative;text-shadow:0 2px 18px #000}
    @keyframes lux-nebula-orbit{from{transform:rotate(-18deg) scale(1)}to{transform:rotate(342deg) scale(1)}}
    @keyframes lux-stars-drift{from{transform:translate3d(-1%,-1%,0) scale(1);opacity:.45}to{transform:translate3d(3%,2%,0) scale(1.08);opacity:.95}}
    @media(max-width:600px){.lux-galaxy::before,.lux-galaxy::after{inset:-15%}}
    @media(prefers-reduced-motion:reduce){.lux-galaxy::before,.lux-galaxy::after,.lux-galaxy-stars{animation:none;will-change:auto}}
    @keyframes lux-boot-breathe{0%,100%{opacity:.52;transform:scale(.93)}50%{opacity:1;transform:scale(1.07)}}
    @media(prefers-reduced-motion:reduce){.lux-boot,.lux-boot-symbol{transition:none;animation:none}}
  </style>
  <script type="module" src="/cinema-app.js"></script>
  <script defer src="/cinema/install.js"></script>
<link rel="stylesheet" href="/cinema-detail-page.css"><link rel="stylesheet" href="/lux-tag-palette.css"><link rel="stylesheet" href="/connectivity.css"><script type="module" src="/connectivity.js"></script><script type="module" src="/catalog-navigation.js"></script></head>
<body>
<div id="lux-boot" class="lux-boot" role="status" aria-live="polite" aria-label="Carregando Lux Player">
  <div class="lux-galaxy" aria-hidden="true"><span class="lux-galaxy-stars"></span><span class="lux-galaxy-stars"></span><span class="lux-galaxy-shade"></span></div>
  <div class="lux-boot-title"><span class="lux-boot-symbol" aria-hidden="true">✧</span><span>Abrindo seu Lux Player...</span></div>
  <span id="lux-boot-status" class="lux-boot-status">A pipoca fica por sua conta 🍿</span>
  <button id="lux-boot-skip" class="lux-boot-skip" type="button" hidden>Entrar mesmo assim</button>
</div>
<script>
  // Garantia: nunca deixar a tela presa se o bundle falhar ou a rede parar.
  window.__luxBootStarted = performance.now();
  window.setTimeout(() => { const screen = document.getElementById('lux-boot'); if (screen) screen.remove(); }, 75000);
</script>
<div class="shell cinema-shell">
  <header class="cinema-header" aria-label="Navegação Lux Player">
    <a class="cinema-brand" href="#inicio" aria-label="Lux Player — Início">
      <span class="cinema-brand-mark"><img src="/assets/lux-icon.png" alt=""></span><span class="cinema-brand-word">LUX <span>PLAYER</span></span>
    </a>
    <nav class="cinema-nav" aria-label="Seções">
      <a href="#inicio" class="cinema-nav-link is-active"><span class="cinema-nav-symbol">⌂</span>Início</a>
      <a href="#destaques-tv" class="cinema-nav-link"><span class="cinema-nav-symbol">▣</span>Ao vivo</a>
      <a href="#destaques-filmes" class="cinema-nav-link" id="nav-movies">Filmes</a>
      <a href="#destaques-series" class="cinema-nav-link" id="nav-series">Séries</a>
      <a href="#minha-lista" class="cinema-nav-link">Minha lista</a>
    </nav>
    <div class="cinema-header-actions">
      <label class="cinema-search" for="nav-search"><span aria-hidden="true">⌕</span><input id="nav-search" type="search" placeholder="Buscar no catálogo..." autocomplete="off" aria-label="Buscar no catálogo"></label>
      <button type="button" id="open-source" class="cinema-icon-button" title="Conectar fonte" aria-label="Gerenciar fontes">＋</button>
      <button type="button" id="open-admin" class="cinema-icon-button" title="Personalizar" aria-label="Painel de personalização">⚙</button>
      <span class="cinema-avatar" aria-hidden="true">L</span>
    </div>
  </header>
  <div id="source-overlay" class="source-overlay" hidden></div>
  <aside id="source-drawer" class="source-drawer" role="dialog" aria-modal="true" aria-label="Gerenciar fonte" aria-hidden="true" inert>
    <div class="source-drawer-top"><div><span class="eyebrow">SUA BIBLIOTECA</span><h2>Conectar conteúdo</h2></div><button id="drawer-close" class="drawer-close" type="button" aria-label="Fechar painel">×</button></div>
    <p class="source-drawer-note">Sua fonte, seus títulos. O motor de importação continua o mesmo.</p>
    <section id="minha-fonte" class="source-card" aria-label="Gerenciar fonte de conteúdo">
      <div class="source-heading"><span class="source-signal"></span><div><strong>Minha fonte</strong><small>Conecte sua biblioteca</small></div></div>
      <form id="source-form" autocomplete="off">
        <label for="source-type">TIPO DE FONTE</label>
        <select id="source-type" name="type">
          <option value="m3u" selected>Playlist M3U</option>
          <option value="xtream">Xtream Codes</option>
          <option value="direct">URL de vídeo / rádio</option>
        </select>
        <label for="source-url" id="source-url-label">URL DA PLAYLIST</label>
        <input id="source-url" type="url" inputmode="url" placeholder="https://.../lista.m3u" spellcheck="false">
        <div id="bridge-settings" class="bridge-settings" hidden>
          <div class="bridge-settings-head"><span>CONEXÃO SEGURA</span><span class="bridge-pill">HTTPS</span></div>
          <p id="bridge-availability" role="status" aria-live="polite">Verificando conexão...</p>
          <div id="bridge-key-wrap" hidden><input id="bridge-key" type="hidden" value=""></div>
        </div>
        <div id="credentials-fields" hidden>
          <label for="xc-user">USUÁRIO</label>
          <input id="xc-user" type="text" spellcheck="false" autocapitalize="off" autocomplete="off">
          <label for="xc-pass">SENHA</label>
          <input id="xc-pass" type="password" autocomplete="new-password">
        </div>
        <button id="connect" class="primary-btn" type="submit">Conectar fonte <span aria-hidden="true">↗</span></button>
        <div id="file-fields" hidden>
          <div class="divider-text">OU IMPORTE UM ARQUIVO</div>
          <label for="m3u-file" class="upload">Selecionar arquivo .m3u / .txt</label>
          <input id="m3u-file" type="file" accept=".m3u,.m3u8,.txt,audio/x-mpegurl" hidden>
        </div>
      </form>
    </section>
    <div id="restore-library-panel" class="restore-library-panel" hidden>
      <strong>Biblioteca anterior encontrada</strong>
      <p>O catálogo já está no R2. Se a sessão venceu, digite a chave do gateway acima e recupere seus títulos, sem reenviar a M3U do fornecedor.</p>
      <button id="restore-library" type="button">↺ &nbsp; Reconectar e restaurar biblioteca</button>
    </div>
    <p class="drawer-footnote">O Lux Player é um reprodutor independente e não fornece conteúdo.</p>
  </aside>

  <main class="main" id="inicio">
    <section class="feature-hero" aria-label="Destaque da sua biblioteca">
      <img id="hero-art" class="hero-art" src="/assets/login-scene.png" alt="" referrerpolicy="no-referrer">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <span class="hero-kicker"><span class="hero-spark"></span><span id="hero-category">SUA PRÓXIMA HISTÓRIA COMEÇA AQUI</span></span>
        <div class="hero-edition">LUX <span>ORIGINALS</span> <span class="hero-edition-line"></span> ZERO EDITION</div>
        <h1 id="hero-title">Seu universo.<br>Seu próximo play.</h1>
        <p id="hero-subtitle">Tudo o que você gosta, em um só lugar. Sua biblioteca, do seu jeito.</p>
        <p id="hero-tagline" class="hero-tagline" hidden></p><div id="hero-facts" class="hero-facts" hidden></div>
        <div class="hero-actions">
          <button id="hero-play" class="hero-primary" type="button" hidden><span aria-hidden="true">▶</span> Assistir agora</button>
          <button id="hero-connect" class="hero-primary" type="button"><span aria-hidden="true">＋</span> Conectar fonte</button>
          <button id="hero-details" class="hero-secondary" type="button" hidden>Mais informações</button>
          <button id="hero-add" class="hero-secondary" type="button" hidden>＋ Minha lista</button>
          <a class="hero-secondary" href="#home-rails">Explorar biblioteca <span aria-hidden="true">↓</span></a>
        </div>
        <div class="hero-meta"><span class="hero-meta-line"></span><span id="catalog-total">Seu conteúdo, suas escolhas.</span></div>
      </div>
      <div class="hero-poster" aria-hidden="true"><div class="poster-glow"></div><img id="hero-poster" src="/assets/lux-icon.png" alt="" referrerpolicy="no-referrer"><span>SELEÇÃO LUX</span></div>
      <div class="hero-number" aria-hidden="true">01 <span>/ SEU UNIVERSO</span></div>
    </section>
    <div id="home-rails" class="home-rails" aria-label="Destaques e vitrines da sua biblioteca"></div>
    <section id="cinema-browse" class="browse-screen" aria-label="Catálogo completo" hidden>
      <div class="browse-heading">
        <div><span class="browse-kicker">CATÁLOGO COMPLETO</span><h1 id="browse-title">Filmes</h1></div>
        <div class="browse-pager" aria-label="Navegação entre páginas">
          <span id="browse-page-label">Página 1 de 1</span>
          <button type="button" data-browse-page="first" aria-label="Primeira página">«</button>
          <button type="button" data-browse-page="prev" aria-label="Página anterior">‹</button>
          <label class="browse-page-entry"><input id="browse-page-input" type="number" min="1" value="1" aria-label="Número da página"></label>
          <button id="browse-page-go" type="button" class="browse-go" aria-label="Ir para página">Ir</button>
          <button type="button" data-browse-page="next" aria-label="Próxima página">›</button>
          <button type="button" data-browse-page="last" aria-label="Última página">»</button>
        </div>
      </div>
      <div class="browse-toolbar">
        <label class="browse-group-label" for="browse-group">GRUPO
          <select id="browse-group" aria-label="Filtrar por grupo"><option value="">Todos os grupos</option></select>
        </label>
        <label class="browse-group-label" hidden>CATEGORIA<select id="browse-tv-category"><option value="">Todas as categorias</option></select></label><label class="browse-group-label">ANO<select id="browse-year" aria-label="Filtrar por ano"></select></label><label class="browse-group-label">GÊNERO<select id="browse-genre" aria-label="Filtrar por gênero"></select></label><label class="browse-group-label" hidden>ÁUDIO<select id="browse-language" aria-label="Filtrar por áudio declarado"></select></label><label class="browse-group-label">ORDEM<select id="browse-sort" aria-label="Ordenar catálogo"><option value="source">Ordem do fornecedor</option><option value="title">Título A–Z</option><option value="year">Ano mais recente</option></select></label><span id="browse-filter-label" class="browse-filter-label">Explore sua biblioteca</span>
      </div>
      <div id="browse-grid" class="browse-grid" aria-live="polite"></div>
      <div class="browse-foot"><span id="browse-foot-count">0 títulos</span><button id="browse-top" type="button">Voltar ao topo ↑</button></div>
    </section>
    <section class="watch-area" id="reproduzir" aria-label="Reprodutor e busca completa">
    <header class="topbar">
      <div class="topbar-title"><span class="eyebrow">SEU ENTRETENIMENTO, DO SEU JEITO</span><h1>TV ao vivo<span class="title-accent">.</span></h1></div>
      <div class="topbar-actions"><span class="topbar-live"><span></span> AO VIVO</span><a class="source-shortcut" href="#minha-fonte">Gerenciar fonte <span aria-hidden="true">↗</span></a></div>
    </header>

    <div id="message" class="message" role="status" aria-live="polite">Conecte uma fonte para começar a assistir.</div>

    <section class="workspace" aria-label="TV ao vivo e canais">
      <div class="player-column">
        <div class="section-head"><div><span class="eyebrow">SUA TELA</span><h2>Agora assistindo</h2></div><span id="format" class="format-pill">SEM FONTE</span></div>
        <div class="video-wrap">
          <div id="idle-stage" class="idle-stage"><div class="play-orbit">▶</div><p>Sua programação começa aqui</p><span>Conecte uma fonte e selecione o que assistir.</span></div>
          <video id="video" controls playsinline preload="none" hidden></video>
          <div id="audio-stage" class="audio-stage" hidden><div class="radio-glyph">♪</div><h3 id="radio-title">Rádio</h3><p>Reprodução de áudio</p><audio id="audio" controls preload="none"></audio></div>
        </div>
        <div class="now-playing"><div><span class="eyebrow">EM REPRODUÇÃO</span><h3 id="playing-title">Nenhuma mídia selecionada</h3></div><span id="playback-state" class="state-pill">AGUARDANDO</span></div>
        <p class="disclaimer">O Lux Player é um reprodutor independente. Não fornece conteúdo, canais ou assinaturas.</p>
      </div>

      <section class="library" id="biblioteca" aria-label="Biblioteca de canais">
        <div class="section-head"><div><span class="eyebrow">ENCONTRE O QUE ASSISTIR</span><h2>Seus canais <span id="channel-count">00</span></h2></div><button id="clear" class="text-button" type="button" title="Desconectar a lista atual">Limpar</button></div>
        <div class="list-tools"><input id="search" type="search" placeholder="Buscar canais..." aria-label="Buscar canais"><select id="kind-filter" aria-label="Filtrar tipo"><option value="all">Todos</option><option value="tv">TV</option><option value="radio">Rádio</option></select></div>
        <div id="channels" class="channels" role="list"><div class="list-empty">Seus canais aparecem aqui quando você conectar uma fonte.</div></div>
      </section>
    </section>
    </section>
    <div class="dev-tools" hidden aria-hidden="true">
      <div class="demo-row"><button id="demo" type="button">Importar playlist de demonstração</button></div>
      <details class="diagnostics"><summary>Diagnóstico de reprodução</summary><pre id="diagnostics">Nenhum evento registrado.</pre></details>
    </div>
  </main>
</div>
<dialog id="admin-dialog" class="lux-admin-dialog" aria-labelledby="admin-dialog-title">
  <div class="admin-dialog-head">
    <div><span class="eyebrow">SUA PLATAFORMA, SUAS REGRAS</span><h2 id="admin-dialog-title">Personalizar vitrines</h2></div>
    <button class="admin-close" type="button" data-close-dialog="admin-dialog" aria-label="Fechar">×</button>
  </div>
  <p class="admin-description">Escolha como sua biblioteca aparece. Os nomes e grupos funcionam com IPTV, cursos, aulas e outras playlists M3U.</p>
  <form id="admin-form" class="admin-form">
    <div class="admin-field"><label for="admin-heroTitle">TÍTULO DO HERO (QUANDO A LISTA ESTIVER VAZIA)</label><input id="admin-heroTitle" type="text" maxlength="90"></div>
    <div class="admin-field"><label for="admin-heroSubtitle">DESCRIÇÃO DO HERO</label><input id="admin-heroSubtitle" type="text" maxlength="90"></div>
    <div class="admin-field-row">
      <div class="admin-field"><label for="admin-continueTitle">CONTINUAR ASSISTINDO</label><input id="admin-continueTitle" type="text" maxlength="90"></div>
      <div class="admin-field"><label for="admin-favoritesTitle">MINHA LISTA</label><input id="admin-favoritesTitle" type="text" maxlength="90"></div>
    </div>
    <div class="admin-section-title">CURADORIA DO DESTAQUE</div>
    <div class="admin-field-row">
      <div class="admin-field"><label for="admin-heroMode">ESCOLHA DO DESTAQUE</label><select id="admin-heroMode"><option value="auto">Automático (com capa)</option><option value="movies">Priorizar filmes / cursos</option><option value="series">Priorizar séries / módulos</option><option value="tv">Priorizar TV</option><option value="pinned">Escolher título específico</option></select></div>
      <div class="admin-field"><label for="admin-pinnedName">TÍTULO FIXO (NOME DA PLAYLIST)</label><input id="admin-pinnedName" type="text" maxlength="130" placeholder="Digite o título exatamente como aparece"></div>
    </div>
    <div class="admin-field"><label for="admin-heroBackdrop">IMAGEM DO DESTAQUE (HTTPS, OPCIONAL)</label><input id="admin-heroBackdrop" type="url" placeholder="https://.../imagem.jpg"></div>
    <div class="admin-section-title">EXIBIÇÃO DAS VITRINES</div>
    <div class="admin-field-row">
      <div class="admin-field"><label for="admin-railOrder">ORDEM NA HOME</label><select id="admin-railOrder"><option value="personal">Continuar assistindo primeiro</option><option value="discovery">Destaques primeiro</option><option value="favorites">Minha lista primeiro</option></select></div>
      <div class="admin-field"><label for="admin-density">TAMANHO DOS CARTÕES</label><select id="admin-density"><option value="comfortable">Confortável</option><option value="compact">Compacto</option></select></div>
    </div>
    <div class="admin-toggle-grid" role="group" aria-label="Escolher seções visíveis">
      <label><input id="admin-showContinue" type="checkbox" checked> Continuar assistindo</label>
      <label><input id="admin-showFavorites" type="checkbox" checked> Minha lista</label>
      <label><input id="admin-showTv" type="checkbox" checked> TV</label>
      <label><input id="admin-showMovies" type="checkbox" checked> Filmes / Cursos</label>
      <label><input id="admin-showSeries" type="checkbox" checked> Séries / Módulos</label>
      <label><input id="admin-autoNext" type="checkbox"> Próximo episódio automático (após 10 segundos)</label><label><input id="admin-personalization" type="checkbox" checked> Recomendações pelo meu histórico</label><label><input id="admin-hideEmpty" type="checkbox" checked> Ocultar vitrines sem títulos</label>
    </div>
    <div class="admin-section-title">IMAGENS E SINOPSES · METADADOS</div>
    <div class="admin-field-row">
      <div class="admin-field">
        <label for="admin-imageEngine">MOTOR DAS IMAGENS</label>
        <select id="admin-imageEngine">
          <option value="tmdb">TMDB primeiro · capas e banners (padrão)</option>
          <option value="hybrid">TMDB primeiro + imagens M3U de reserva</option>
          <option value="playlist">Apenas imagens M3U · TMDB desativado</option>
        </select>
      </div>
      <div class="admin-field">
        <label for="admin-summaryEngine">MOTOR DAS SINOPSES</label>
        <select id="admin-summaryEngine">
          <option value="off">Desativado (mais leve · padrão)</option>
          <option value="tmdb">TMDB · Sinopse e gêneros sob demanda</option>
        </select>
      </div>
    </div>
    <p class="admin-engine-note">TMDB é opcional. Não altera o título da playlist nem o que é reproduzido. Sem consultas em massa: máximo de 1 busca por título, cache no D1 e limite diário; em caso de dúvida, mantém os dados originais.</p>
    <p id="admin-tmdb-status" class="admin-connection-status" role="status" aria-live="polite">Abra o painel para verificar se o TMDB está configurado.</p>
    <div class="admin-section-title">MODELOS RÁPIDOS PARA SUA BIBLIOTECA</div>
    <div class="admin-presets" role="group" aria-label="Sugestões de nomes para as vitrines">
      <button type="button" data-admin-preset="streaming" aria-pressed="false"><span class="preset-icon">▣</span> Streaming</button>
      <button type="button" data-admin-preset="courses" aria-pressed="false"><span class="preset-icon">▤</span> Cursos e aulas</button>
      <button type="button" data-admin-preset="generic" aria-pressed="false"><span class="preset-icon">✦</span> Biblioteca livre</button>
    </div>
    <p id="admin-preset-status" class="admin-preset-status" role="status" aria-live="polite">Selecione um modelo ou personalize os títulos manualmente.</p>
    <div class="admin-section-title">VITRINES PERSONALIZÁVEIS</div>
    <div class="admin-field"><label for="admin-tvTitle">VITRINE 1 · NOME</label><input id="admin-tvTitle" type="text" maxlength="90" placeholder="Destaques da TV"><label for="admin-tvKeywords">GRUPOS DA PLAYLIST (SEPARADOS POR VÍRGULA)</label><input id="admin-tvKeywords" type="text" maxlength="220" placeholder="TV, Esportes, Notícias"></div>
    <div class="admin-field"><label for="admin-moviesTitle">VITRINE 2 · NOME</label><input id="admin-moviesTitle" type="text" maxlength="90" placeholder="Filmes ou Cursos"><label for="admin-moviesKeywords">GRUPOS DA PLAYLIST</label><input id="admin-moviesKeywords" type="text" maxlength="220" placeholder="Filmes, Cursos, Aulas"></div>
    <div class="admin-field"><label for="admin-seriesTitle">VITRINE 3 · NOME</label><input id="admin-seriesTitle" type="text" maxlength="90" placeholder="Séries ou Módulos"><label for="admin-seriesKeywords">GRUPOS DA PLAYLIST</label><input id="admin-seriesKeywords" type="text" maxlength="220" placeholder="Séries, Temporadas, Módulos"></div>
    <div id="admin-stats" class="admin-stats" role="status">Conecte uma fonte para ver estatísticas do catálogo.</div>
    <div class="admin-groups"><strong>Grupos detectados na sua playlist</strong><p id="detected-groups">Conecte uma playlist para identificar os grupos disponíveis.</p></div>
    <p class="admin-notice">A personalização é privada do perfil selecionado e sincronizada entre dispositivos.</p>
    <p id="admin-save-status" class="admin-save-status" role="status" aria-live="polite">As alterações serão aplicadas na Home e salvas no seu perfil.</p>
    <div class="admin-actions"><button type="button" id="admin-export" class="admin-reset" title="Copiar personalização como JSON">Copiar configuração</button><button type="button" id="admin-reset" class="admin-reset">Restaurar padrão</button><button type="submit" class="admin-save">Aplicar e salvar <span aria-hidden="true">↗</span></button></div>
  </form>
</dialog>
<dialog id="details-dialog" class="lux-details-dialog" aria-labelledby="details-title">
  <button type="button" id="details-close" class="details-close" aria-label="Fechar detalhes">×</button>
  <div class="details-visual">
    <img id="details-art" src="/assets/login-scene.png" alt="" referrerpolicy="no-referrer">
    <div class="details-shade"></div>
    <div class="details-poster-frame"><img id="details-poster" alt="" hidden><span id="details-poster-fallback" aria-hidden="true">LUX</span></div>
    <span id="details-kicker" class="details-kicker">LUX PLAYER · DA SUA BIBLIOTECA</span>
  </div>
  <div class="details-body">
    <h2 id="details-title">Título do conteúdo</h2>
    <p id="details-group">Sua biblioteca</p>
    <div id="details-meta" class="details-meta" hidden></div>
    <p id="details-overview" class="details-overview" hidden></p>
    <p id="details-metadata-status" class="details-metadata-status" role="status" aria-live="polite"></p>
    <div id="details-tags" class="lux-tag-strip"></div><label id="details-variants" hidden>Fonte do canal<select id="details-variant-select"></select></label><div class="details-actions">
      <button type="button" id="details-play" class="details-play"><span aria-hidden="true">▶</span> Assistir agora</button>
      <button type="button" id="details-favorite" class="details-favorite">＋ Minha lista</button>
    </div>
  </div>
</dialog>
<div id="cinema-feedback" class="cinema-feedback" role="status" aria-live="polite" hidden></div>
<a class="account-link" href="/account/">Perfis e conta</a><a class="guide-link" href="/guide/">Guia e esportes</a><footer class="cinema-credits" aria-label="Créditos e informações"><span>LUX PLAYER ZERO · Sua biblioteca, do seu jeito.</span><span>Metadados opcionais: <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">TMDB</a>. Este produto usa a API TMDB, mas não é endossado nem certificado pelo TMDB.</span></footer>
</body>
</html>
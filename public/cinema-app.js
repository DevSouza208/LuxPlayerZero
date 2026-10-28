import {iconMarkup,setIcon,setIconLabel} from './lux-icons.js';
import {mountVodAdmin} from './vod-admin.js';
import {createPlayerControls} from './player-controls.js';
import {createPlayerModal} from './player-modal.js';
import {createCatalogCache} from './catalog-cache.js';
import {isGuestMode} from './guest-mode.js';
const guestCatalogCache = isGuestMode() ? createCatalogCache() : null;
import { isHttpUrl, normalizeXtreamBase, buildXtreamLiveUrl, inferKind } from './playlist.js';
import { createBridge, isBridgeRequired } from './gateway.js';
import { describeBridge } from './bridge-state.js';
import { preferHttps, xtreamM3uUrl } from './direct-source.js';
import {createHome,prepareHomeProfile} from './home.js';
import {createCatalogPreparer,isPreparedCatalog} from './catalog-prepare.js';
const prepareCatalog=createCatalogPreparer();
import { presentationForEntry, titleForDisplay } from './cinema-title.js';
import { rememberSnapshot, savedSnapshot, forgetSnapshot, readSavedSnapshot, snapshotPath } from './saved-catalog.js';

const $ = id => document.getElementById(id);
// Não exibir Home vazia antes de recuperar o catálogo no R2.
const bootSplash = $('lux-boot');
const bootMessage = $('lux-boot-status');
const bootSkip = $('lux-boot-skip');
const MIN_BOOT_MS = 2500;
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
  performance.mark?.('lux:boot-revealed');
  clearTimeout(slowBootTimer);
  clearInterval(bootPhraseTimer);
  if (!bootSplash) return;
  bootSplash.classList.add('is-leaving');
  setTimeout(() => { bootSplash.hidden = true; }, 300);
}
// A abertura visual não aguarda a transferência e preparação do catálogo inteiro.
setTimeout(finishBoot,Math.max(0,MIN_BOOT_MS-(performance.now()-bootStartedAt)));
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
void mountVodAdmin({getItems:()=>channels}).catch(()=>{});
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
const playerModal=createPlayerModal($('reproduzir'),{onClose:()=>{stop();homeCall('resumeDetails');}});
let playerControls=null;
try { playerControls=createPlayerControls(document.querySelector('.lux-player-modal'),{getEpisodes:()=>homeCall('playbackEpisodes'),onEpisode:id=>homeCall('playEpisode',id),getEngine:()=>hls}); } catch (error) { console.warn('Controles nativos preservados.',error); }
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
  channels = isPreparedCatalog(items)?items:items.map((item, index) => ({ ...item, id: 'c' + index, ...presentationForEntry(item) }));
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
    setIcon(symbol,item.kind === 'radio'?'music':'play');
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
    setIcon(arrow,'arrow-up-right');
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
  playerModal.open();
  const generation = operation;
  selected = item;
  homeCall('onSelect', item);
  render();
  els.title.textContent = titleForDisplay(item);
  els.format.textContent = streamType(item.url);
  state('Conectando');
  playerControls?.refresh();playerControls?.reveal();
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
      if (generation === sourceLoad) setChannels([{ name: 'Mídia conectada', group: 'URL direta', kind: inferKind('Mídia conectada', input), url: input }], 'URL direta');
    } else if (mode === 'm3u') {
      const text = await request(input);
      const entries = await prepareCatalog(text, input);
      if (!entries.length) throw new Error('A lista não contém mídias HTTP/HTTPS válidas.');
      if (generation === sourceLoad) {
        setChannels(entries, 'M3U', lastSnapshotId);
        await saveAccountSource(input,lastSnapshotId);
      }
    } else {
      const base = normalizeXtreamBase(input);
      checkProtocol(base);
      const user = els.user.value.trim();
      const pass = els.pass.value;
      if (!user || !pass) throw new Error('Informe usuário e senha Xtream.');
      // Primeiro a lista original, exatamente como o Lux antigo fazia.
      const m3uUrl = xtreamM3uUrl(base, user, pass);
      let entries;
      try {
        const playlistText = await request(m3uUrl);
        entries = await prepareCatalog(playlistText, m3uUrl);
        if (!entries.length) throw new Error('M3U vazia.');
        log('Xtream', 'M3U original importada; links preservados');
      } catch (m3uError) {
        // Alternativa para fornecedores sem get.php disponível.
        log('Xtream', 'M3U indisponível; tentando catálogo da API');
        const authUrl = base + '/player_api.php?username=' + encodeURIComponent(user) + '&password=' + encodeURIComponent(pass);
        const auth = await request(authUrl, 'json');
        if (!auth?.user_info || Number(auth.user_info.auth) !== 1) throw new Error('Credenciais Xtream recusadas pelo servidor.');
        const extension = Array.isArray(auth.user_info.allowed_output_formats) &&
          (auth.user_info.allowed_output_formats.includes('m3u8') || auth.user_info.allowed_output_formats.includes('hls')) ? 'm3u8' : 'ts';
        const streams = await request(authUrl + '&action=get_live_streams', 'json');
        if (!Array.isArray(streams)) throw new Error('API Xtream não retornou canais válidos.');
        entries = streams.slice(0, 20000).filter(stream => /^\d+$/.test(String(stream.stream_id))).map(stream => ({
          name: String(stream.name || 'Canal sem nome'), group: 'Categoria ' + String(stream.category_id ?? 'geral'),
          kind: inferKind(String(stream.name || ''), '', stream.stream_type === 'radio'),
          url: buildXtreamLiveUrl(base, user, pass, stream.stream_id, extension)
        }));
      }
      if (generation === sourceLoad) setChannels(entries, 'Xtream', lastSnapshotId);
    }
  } catch (error) {
    if (generation === sourceLoad) fail(errorText(error));
  } finally {
    if (generation === sourceLoad) {
      els.connect.disabled = false;
      setIconLabel(els.connect,'arrow-up-right','Conectar fonte');
    }
  }
}
els.type.addEventListener('change', updateForm);
els.form.addEventListener('submit', event => { void importSource(event); });
els.file.addEventListener('change', async () => {
  const generation = ++sourceLoad;
  const file = els.file.files?.[0];
  if (!file) return;
  try {
    if (file.size > 256 * 1024 * 1024) throw new Error('Arquivo excede 256 MB.');
    const contents = await file.text();
    const entries = await prepareCatalog(contents);
    if (!entries.length) throw new Error('Arquivo não contém canais válidos.');
    if (generation === sourceLoad) {
      setChannels(entries, file.name);
      updateBridgePanel();
    }
  } catch (error) { fail(errorText(error)); }
  finally { els.file.value = ''; }
});
els.search.addEventListener('input', render);
els.filter.addEventListener('change', render);
els.clear.addEventListener('click', () => { sourceLoad++; showDeliveryLink(null); void guestCatalogCache?.clear(); forgetSnapshot(); channels = []; selected = null; stop(); render(); homeCall('clear'); updateBridgePanel(); els.count.textContent = '00'; note('Biblioteca limpa. Suas fontes não foram salvas no servidor.'); });
els.demo.addEventListener('click', async () => {
  const generation = ++sourceLoad;
  const url = new URL('/demo/playlist.m3u', location.href).href;
  els.demo.disabled = true;
  note('Importando playlist de demonstração...', 'info');
  try {
    const text = await request(url);
    const entries = await prepareCatalog(text, url);
    if (!entries.length) throw new Error('A playlist de demonstração não possui fontes válidas.');
    if (generation === sourceLoad) setChannels(entries, 'playlist M3U de demonstração');
  } catch (error) {
    if (generation === sourceLoad) fail(errorText(error));
  } finally {
    els.demo.disabled = false;
  }
});
/**
 * Não precisamos guardar 260 mil itens nem URLs com senha no localStorage.
 * O snapshot privado foi salvo em R2; só salvamos seu ID aleatório no dispositivo.
 * A resposta HTTP é autenticada pelo cookie HttpOnly válido por 7 dias.
 */
async function restoreSavedLibrary() {
  const id = savedSnapshot();
  // Com sessão válida, lê sempre a versão atual do link fixo, antes do cache local.
  if (guestCatalogCache && (!id || !bridgeStatus?.connected || !bridgeStatus?.snapshotReady)) {
    const generation = sourceLoad;
    const cached = await guestCatalogCache.read();
    if (generation !== sourceLoad || channels.length) return;
    if (Array.isArray(cached?.items) && cached.items.length) {
      setChannels(cached.items, 'cache deste dispositivo', id, false);
      note(cached.items.length.toLocaleString('pt-BR') + ' títulos restaurados do cache. Importe novamente para atualizar a lista.', 'info');
    }
    return;
  }
  if (!id || channels.length) return;
  if (!bridgeStatus?.snapshotReady) {
    note('A biblioteca anterior está referenciada no dispositivo, mas o R2 está indisponível.', 'info');
    return;
  }
  if (!bridgeStatus.connected) {
    note('Sua biblioteca foi lembrada. Reconecte a chave do gateway para recuperar a lista do R2.', 'info');
    return;
  }
  const generation = sourceLoad;
  showBootPhrase();
  note('Restaurando sua biblioteca privada do R2…', 'info');
  try {
    const result = await readSavedSnapshot(id);
    if (generation !== sourceLoad) return;
    if (result.kind === 'needs-session') {
      note('Sessão expirada. Reconecte o gateway para recuperar sua biblioteca salva.', 'info');
      return;
    }
    if (result.kind === 'not-found') {
      forgetSnapshot();
      note('O snapshot antigo não foi encontrado. Conecte sua lista para gerar um novo.', 'info');
      return;
    }
    if (result.kind !== 'ok') {
      note('Não foi possível recuperar a playlist do R2. A referência foi preservada para tentar novamente.', 'info');
      return;
    }
    showBootPhrase();
    const entries = await prepareCatalog(result.content);
    if (!entries.length) throw new Error('O snapshot salvo não tem mídias válidas.');
    if (generation === sourceLoad) {
      setChannels(entries, 'R2 (biblioteca restaurada)', id);
      note(entries.length.toLocaleString('pt-BR') + ' títulos restaurados automaticamente do R2.', 'info');
    }
  } catch {
    if (generation === sourceLoad) {
      note('Falha ao restaurar o catálogo. A referência no R2 foi mantida para a próxima tentativa.', 'info');
      log('Biblioteca', 'Restauração privada falhou');
    }
  }
}
$('restore-library')?.addEventListener('click', async () => {
  if (!savedSnapshot()) { note('Nenhuma biblioteca guardada para recuperar.', 'info'); return; }
  const button = $('restore-library');
  button.disabled = true;
  button.textContent = 'Validando sessão…';
  try {
    const response = await fetch('/api/bridge/connect', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    els.bridgeKey.value = '';
    if (!response.ok) {
      note('Entre na sua conta Lux ID para restaurar sua biblioteca.', 'error');
      return;
    }
    await refreshBridgeStatus();
    await restoreSavedLibrary();
  } catch {
    note('Não foi possível restabelecer a sessão privada. Tente novamente.', 'error');
  } finally {
    els.bridgeKey.value = '';
    button.disabled = false;
    setIconLabel(button,'refresh-cw','Reconectar e restaurar biblioteca');
  }
});
async function saveAccountSource(source,id) {
  if(isGuestMode())return;
  const url=new URL(source,location.href);
  const response=await fetch('/api/account/source',{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},body:JSON.stringify({lista_http:url.protocol==='http:'?url.href:null,
      lista_https:id?new URL(snapshotPath(id),location.origin).href:url.protocol==='https:'?url.href:null})});
  if(!response.ok&&response.status!==404)note('Lista carregada, mas não foi possível salvar o endereço na conta.','info');
}
async function loadAccountSource(prefetchedResponse=null) {
  if(isGuestMode())return false;
  const response=prefetchedResponse||await fetch('/api/account/source',{credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});
  if(response.status===404)return false;
  if(!response.ok)throw new Error('Não foi possível carregar a lista da sua conta.');
  const source=await response.json(),generation=sourceLoad;
  if(!source.lista_https&&!source.lista_http){note('Sua conta está pronta. Conecte uma lista para começar.','info');return true;}
  els.url.value=source.lista_http||source.lista_https;
  try {
    let content,id=null;
    if(source.lista_https){
      const url=new URL(source.lista_https);
      if(url.origin===location.origin&&url.pathname==='/api/bridge/playlist'){
        id=url.searchParams.get('id');const saved=await readSavedSnapshot(id);
        if(saved.kind!=='ok')throw new Error('Não foi possível recuperar sua lista HTTPS.');content=saved.content;
      }else content=await request(source.lista_https);
    }else{content=await request(source.lista_http);id=lastSnapshotId;}
    const entries=await prepareCatalog(content);
    if(!entries.length)throw new Error('A lista da conta não contém mídias válidas.');
    if(generation===sourceLoad){setChannels(entries,'sua conta',id);if(id&&!source.lista_https)await saveAccountSource(source.lista_http,id);}
  } catch(error){
    if(source.lista_https&&source.lista_http&&generation===sourceLoad){
      try{
        const content=await request(source.lista_http),entries=await prepareCatalog(content);
        if(!entries.length)throw error;
        if(generation===sourceLoad){setChannels(entries,'sua conta',lastSnapshotId);await saveAccountSource(source.lista_http,lastSnapshotId);}
      }catch(fallbackError){if(generation===sourceLoad)note(errorText(fallbackError),'error');}
    }else if(generation===sourceLoad)note(errorText(error),'error');
  }
  return true;
}
updateForm();
function finishLibraryLoading(){document.querySelector('.cinema-shell')?.classList.remove('is-library-loading');document.querySelector('main')?.removeAttribute('aria-busy');}
async function initializeCinema(){
  try {
    showBootPhrase();
    const sourceResponse=isGuestMode()?Promise.resolve(null):fetch('/api/account/source',{credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'}).catch(()=>new Response('',{status:503}));
    const [,,accountResponse]=await Promise.all([refreshBridgeStatus(),prepareHomeProfile(),sourceResponse]);
    try { home = createHome({ play: item => playItem(item) }); }
    catch (error) { console.warn('Vitrine Lux indisponível; player original preservado.', error); }
    if(!await loadAccountSource(accountResponse))await restoreSavedLibrary();
  } catch {
    // Erros de boot não impedem abrir o formulário manual de conexão.
    bootProgress('Não foi possível restaurar automaticamente.');
  } finally {
    // Os títulos aparecem após a restauração; o splash já pode ter terminado.
    finishLibraryLoading();
    finishBoot();
  }
}
void initializeCinema();

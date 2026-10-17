/**
 * Fullscreen Lux player UI using the EXISTING <video> element, Hls.js and Mpegts.js.
 * No stream URL rewriting, decoding changes or new proxy.
 */
export function createImmersivePlayer({video,onStop,onClose,getHls,onVariant}){
 const originalParent=video.parentElement;
 const originalNext=video.nextSibling;
 const overlay=document.createElement('div');
 overlay.className='lux-full-player';overlay.hidden=true;
 // No provider text or stream URL is interpolated into markup.
 overlay.innerHTML=
 '<section class="lux-player-screen" role="dialog" aria-modal="true" aria-label="Reprodutor Lux">'+
 '<div class="lux-player-video-mount"></div>'+
 '<div class="lux-player-loading"><div class="lux-player-spin"></div><p>Preparando reprodução...</p></div>'+
 '<header class="lux-player-top lux-player-hud"><button type="button" data-lux-close>‹ Voltar</button>'+
 '<div><span class="lux-player-type">FILME</span><h2 class="lux-player-title"></h2></div><button type="button" data-lux-close aria-label="Fechar">×</button></header>'+
 '<footer class="lux-player-bottom lux-player-hud"><input class="lux-player-timeline" type="range" min="0" max="100" value="0" aria-label="Linha do tempo">'+
 '<div class="lux-player-controls"><button type="button" data-lux-toggle aria-label="Pausar ou reproduzir">▶</button>'+
 '<button type="button" data-lux-back aria-label="Voltar 10 segundos">↶ 10</button>'+
 '<button type="button" data-lux-next aria-label="Avançar 10 segundos">10 ↷</button>'+
 '<button type="button" data-lux-mute aria-label="Silenciar">♫</button>'+
 '<input type="range" class="lux-player-volume" min="0" max="1" step=".05" value="1" aria-label="Volume">'+
 '<span class="lux-player-time">00:00 / 00:00</span><span class="lux-player-spacer"></span>'+
 '<select class="lux-player-source" aria-label="Escolher fonte do canal" hidden></select>'+
 '<select class="lux-player-speed" aria-label="Velocidade"><option value=".5">0,5×</option><option value="1" selected>1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option><option value="2">2×</option></select>'+
 '<select class="lux-player-subtitles" aria-label="Legendas" hidden><option value="-1">Sem legendas</option></select>'+
 '<button type="button" data-lux-pip aria-label="Picture in Picture">▣</button>'+
 '<button type="button" data-lux-fullscreen aria-label="Tela cheia">⛶</button></div></footer>'+
 '</section>';
 const $=sel=>overlay.querySelector(sel),screen=overlay.firstElementChild;
 const mount=$('.lux-player-video-mount'),loader=$('.lux-player-loading');
 let opened=false,timer=null,oldOverflow='',current=null,lastVolume=.8,fromSource=false;
 const clock=seconds=>{
  const n=Number(seconds)||0;if(!Number.isFinite(n)||n<0)return'00:00';
  const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=Math.floor(n%60);
  return(h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
 };
 const validDuration=()=>Number.isFinite(video.duration)&&video.duration>0;
 function hud(){screen.classList.remove('lux-player-hud-hidden');clearTimeout(timer);
  if(!video.paused&&!loader.hidden) return;
  if(!video.paused)timer=setTimeout(()=>screen.classList.add('lux-player-hud-hidden'),3400);
 }
 function loading(state){loader.hidden=!state;if(state)screen.classList.remove('lux-player-hud-hidden');else hud()}
 function update(){
  if(!opened)return;
  $('[data-lux-toggle]').textContent=video.paused?'▶':'❚❚';
  $('[data-lux-mute]').textContent=video.muted||video.volume===0?'♩':'♫';
  $('.lux-player-volume').value=String(video.muted?0:video.volume);
  $('.lux-player-timeline').value=validDuration()?String(Math.min(100,video.currentTime/video.duration*100)):'0';
  $('.lux-player-timeline').disabled=!validDuration();
  $('.lux-player-time').textContent=clock(video.currentTime)+' / '+(validDuration()?clock(video.duration):'AO VIVO');
 }
 function sources(options=[]){
  const select=$('.lux-player-source');select.replaceChildren();
  select.hidden=options.length<2;
  for(const row of options){const option=document.createElement('option');option.value=row.item.id;
    option.textContent=row.label+(row.item===current?' ✓':'');if(row.item.id===current?.id)option.selected=true;
    select.append(option)}
  select._sourceList=options;
 }
 function refreshTracks(){
  const select=$('.lux-player-subtitles');select.replaceChildren();
  const off=document.createElement('option');off.value='-1';off.textContent='Sem legendas';select.append(off);
  const hls=getHls?.();const available=hls?.subtitleTracks||[];
  if(available.length)available.forEach((track,i)=>{const option=document.createElement('option');option.value='hls:'+i;option.textContent=track.name||track.lang||'Legenda '+(i+1);select.append(option)});
  else Array.from(video.textTracks||[]).forEach((track,i)=>{const option=document.createElement('option');option.value='native:'+i;option.textContent=track.label||track.language||'Legenda '+(i+1);select.append(option)});
  select.hidden=select.options.length<=1;
 }
 function open(item,options={}){
  if(!item||item.kind==='radio')return;
  const first=!opened;
  if(first){oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
  opened=true;current=item;overlay.hidden=false;screen.classList.remove('lux-player-hud-hidden');
  $('.lux-player-type').textContent=options.kind||(/\/live\//i.test(item.url||'')?'TV AO VIVO':'ASSISTINDO');
  $('.lux-player-title').textContent=options.title||item.displayName||item.name||'Reproduzindo';
  overlay.style.setProperty('--lux-player-poster',options.art&&/^https:\/\//.test(options.art)?'url("'+options.art.replace(/["\\]/g,'')+'")':'none');
  if(video.parentElement!==mount)mount.append(video);
  video.hidden=false;video.controls=false;video.playsInline=true;
  sources(options.variants||[]);loading(true);update();refreshTracks();
  setTimeout(()=>{if(opened)refreshTracks()},1500);
 }
 function close(stop=true){
  if(!opened)return;
  opened=false;clearTimeout(timer);overlay.hidden=true;screen.classList.remove('lux-player-hud-hidden');
  video.controls=true;document.body.style.overflow=oldOverflow;
  if(stop&&typeof onStop==='function')onStop();
  if(originalNext&&originalNext.parentNode===originalParent)originalParent.insertBefore(video,originalNext);
  else originalParent.append(video);
  current=null;fromSource=false;
  if(typeof onClose==='function')onClose();
 }
 function error(message){if(!opened)return;loading(true);loader.querySelector('p').textContent=String(message||'Falha na reprodução').slice(0,160)}
 overlay.addEventListener('click',event=>{
  if(event.target.closest('[data-lux-close]')){close();return}
  if(event.target.closest('[data-lux-toggle]')){if(video.paused)void video.play().catch(()=>{});else video.pause();return}
  if(event.target.closest('[data-lux-back]')&&validDuration())video.currentTime=Math.max(0,video.currentTime-10);
  if(event.target.closest('[data-lux-next]')&&validDuration())video.currentTime=Math.min(video.duration,video.currentTime+10);
  if(event.target.closest('[data-lux-mute]')){video.muted=!video.muted;if(!video.muted&&video.volume===0)video.volume=lastVolume}
  if(event.target.closest('[data-lux-fullscreen]')){if(document.fullscreenElement)void document.exitFullscreen();else void screen.requestFullscreen?.()}
  if(event.target.closest('[data-lux-pip]')&&document.pictureInPictureEnabled){if(document.pictureInPictureElement)void document.exitPictureInPicture();else void video.requestPictureInPicture?.().catch(()=>{})}
  hud();
 });
 $('.lux-player-timeline').addEventListener('input',e=>{if(validDuration())video.currentTime=video.duration*Number(e.target.value)/100;hud()});
 $('.lux-player-volume').addEventListener('input',e=>{video.volume=Number(e.target.value);video.muted=video.volume===0;if(video.volume>0)lastVolume=video.volume;update();hud()});
 $('.lux-player-speed').addEventListener('change',e=>{video.playbackRate=Number(e.target.value)||1;hud()});
 $('.lux-player-subtitles').addEventListener('change',e=>{
  const [type,index]=e.target.value.split(':');const hls=getHls?.();
  if(hls&&type==='hls'){hls.subtitleDisplay=true;hls.subtitleTrack=Number(index)}
  else if(hls)hls.subtitleTrack=-1;
  Array.from(video.textTracks||[]).forEach((track,i)=>{track.mode=type==='native'&&i===Number(index)?'showing':'disabled'});
 });
 $('.lux-player-source').addEventListener('change',e=>{
   const row=e.target._sourceList?.find(x=>x.item.id===e.target.value);
   if(row&&row.item!==current)onVariant?.(row.item);
 });
 video.addEventListener('loadedmetadata',()=>{if(opened){loading(false);refreshTracks();update()}});
 video.addEventListener('timeupdate',update);
 video.addEventListener('durationchange',update);
 video.addEventListener('volumechange',update);
 video.addEventListener('playing',()=>{if(opened){loader.querySelector('p').textContent='Preparando reprodução...';loading(false);update();hud()}});
 video.addEventListener('waiting',()=>{if(opened)loading(true)});
 video.addEventListener('pause',()=>{if(opened){update();hud()}});
 video.addEventListener('error',()=>{if(opened)error('Não foi possível reproduzir este vídeo. Verifique a conexão e o formato.')});
 overlay.addEventListener('pointermove',hud);
 overlay.addEventListener('pointerdown',hud);
 document.addEventListener('keydown',event=>{
  if(!opened||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  if(event.key==='Escape'){event.stopPropagation();if(document.fullscreenElement)void document.exitFullscreen();else close()}
  if(event.code==='Space'||event.key==='k'){event.preventDefault();if(video.paused)void video.play().catch(()=>{});else video.pause();hud()}
  if(event.key==='ArrowLeft'&&validDuration()){video.currentTime=Math.max(0,video.currentTime-10);hud()}
  if(event.key==='ArrowRight'&&validDuration()){video.currentTime=Math.min(video.duration,video.currentTime+10);hud()}
 });
 document.body.append(overlay);
 return {open,close,error,isOpen:()=>opened,refreshTracks};
}

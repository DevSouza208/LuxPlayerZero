import {iconMarkup,setIcon,setIconLabel} from './lux-icons.js';
export function formatPlayerTime(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '0:00';
 const value=Math.floor(seconds),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),rest=String(value%60).padStart(2,'0');
 return hours?hours+':'+String(minutes).padStart(2,'0')+':'+rest:minutes+':'+rest;
}
export function seekPlayer(media,seconds){
 if(!media||!Number.isFinite(media.duration)||media.duration<=0)return false;
 media.currentTime=Math.max(0,Math.min(media.duration,seconds));return true;
}
export async function togglePlayerFullscreen(video,doc=document){
 if(doc.fullscreenElement)return doc.exitFullscreen();
 if(doc.webkitFullscreenElement)return doc.webkitExitFullscreen();
 // Dialogs não são alvos válidos da Fullscreen API. A raiz mantém o modal e os controles.
 const root=doc.documentElement;
 if(root?.requestFullscreen&&doc.fullscreenEnabled!==false)return root.requestFullscreen();
 if(root?.webkitRequestFullscreen)return root.webkitRequestFullscreen();
 if(video?.webkitEnterFullscreen)return video.webkitEnterFullscreen();
 throw new Error('Tela cheia indisponível');
}
const icon=name=>iconMarkup(name,name==='play'||name==='pause');
/** Controles de apresentação sobre os mesmos elementos HTMLMediaElement. */
export function createPlayerControls(shell,{getEpisodes=()=>null,onEpisode=()=>{},getEngine=()=>null}={}){
 const host=shell?.querySelector('.video-wrap'),video=host?.querySelector('video'),audio=host?.querySelector('audio');
 if(!host||!video)return null;
 const panel=document.createElement('div');panel.className='lux-video-controls';panel.setAttribute('role','group');panel.setAttribute('aria-label','Controles de reprodução');
 const title=document.createElement('div');title.className='lux-video-title';
 const titleLabel=document.createElement('span');titleLabel.textContent='AGORA ASSISTINDO';const titleText=document.createElement('strong');title.append(titleLabel,titleText);
 const progress=document.createElement('input');progress.type='range';progress.min='0';progress.max='1000';progress.step='1';progress.value='0';progress.className='lux-video-progress';progress.setAttribute('aria-label','Posição do vídeo');
 const row=document.createElement('div');row.className='lux-video-actions';
 function button(label,name,extra=''){
  const el=document.createElement('button');el.type='button';el.className='lux-video-button '+extra;el.setAttribute('aria-label',label);el.title=label;el.innerHTML=icon(name);row.append(el);return el;
 }
 const play=button('Reproduzir','play','lux-video-play');
 const back=document.createElement('button'),forward=document.createElement('button');
 for(const [el,label,text] of [[back,'Voltar 10 segundos','↶'],[forward,'Avançar 10 segundos','↷']]){el.type='button';el.className='lux-video-button lux-video-skip';el.setAttribute('aria-label',label);el.title=label;const arrow=document.createElement('span');setIcon(arrow,el===back?'rotate-ccw':'rotate-cw');const number=document.createElement('small');number.textContent='10';el.append(arrow,number);row.append(el);}
 const mute=button('Silenciar','volume');
 const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.value='1';volume.className='lux-video-volume';volume.setAttribute('aria-label','Volume');row.append(volume);
 const time=document.createElement('span');time.className='lux-video-time';row.append(time);
 const spacer=document.createElement('span');spacer.className='lux-video-spacer';row.append(spacer);
 const episodes=button('Escolher episódio','play','lux-video-episodes');setIconLabel(episodes,'list','Episódios');episodes.hidden=true;
 const tracks=button('Idiomas e legendas','volume','lux-video-tracks');setIconLabel(tracks,'type','Áudio / CC');tracks.hidden=true;
 const pip=button('Picture-in-Picture','pip');pip.hidden=!(document.pictureInPictureEnabled&&video.requestPictureInPicture);
 const cast=button('Transmitir para outra tela','cast');cast.hidden=true;
 const fullscreen=button('Entrar em tela cheia','fullscreen');
 const popup=document.createElement('section');popup.className='lux-video-menu';popup.hidden=true;popup.setAttribute('aria-label','Opções do reprodutor');host.append(popup);
 let menuFocus=null;
 function closeMenu(){popup.hidden=true;menuFocus?.focus();}
 function showMenu(label,trigger){menuFocus=trigger;popup.replaceChildren();popup.hidden=false;popup.setAttribute('aria-label',label);const heading=document.createElement('h3');heading.textContent=label;const close=document.createElement('button');close.type='button';close.textContent='Fechar';close.className='lux-video-menu-close';close.addEventListener('click',closeMenu);popup.append(heading,close);reveal();}
 function choice(label,selected,action){const el=document.createElement('button');el.type='button';el.textContent=(selected?'✓ ':'')+label;el.setAttribute('aria-pressed',String(selected));el.addEventListener('click',()=>{action();closeMenu();refresh()});popup.append(el);return el;}
 function nativeAudio(){return Array.from(media().audioTracks||[])}
 function nativeSubtitles(){return Array.from(media().textTracks||[]).filter(track=>['subtitles','captions'].includes(track.kind))}
 function trackName(track,index){return track.name||track.label||track.lang||track.language||'Faixa '+(index+1)}
 function section(label){const el=document.createElement('h4');el.textContent=label;popup.append(el)}
 episodes.addEventListener('click',()=>{
  const data=getEpisodes();if(!data)return;
  showMenu('Episódios · '+data.title,episodes);
  let season=null;
  for(const ep of data.entries){if(ep.season!==season){season=ep.season;section('Temporada '+season)}choice('T'+ep.season+':E'+ep.number,ep.id===data.current,()=>onEpisode(ep.id));}
  popup.querySelector('[aria-pressed="true"]')?.focus();
 });
 tracks.addEventListener('click',()=>{
  showMenu('Idiomas e legendas',tracks);const engine=getEngine(),audios=engine?.audioTracks?.length?engine.audioTracks:null,subs=engine?.subtitleTracks?.length?engine.subtitleTracks:null;
  const audioRows=audios||nativeAudio();
  if(audioRows.length){section('Áudio');audioRows.forEach((track,index)=>choice(trackName(track,index),audios?engine.audioTrack===index:track.enabled,()=>{if(audios)engine.audioTrack=index;else nativeAudio().forEach((t,i)=>{t.enabled=i===index})}));}
  const subtitleRows=subs||nativeSubtitles();
  if(subtitleRows.length){section('Legendas');choice('Desativadas',subs?engine.subtitleTrack===-1:!subtitleRows.some(t=>t.mode==='showing'),()=>{if(subs)engine.subtitleTrack=-1;else subtitleRows.forEach(t=>{t.mode='disabled'})});subtitleRows.forEach((track,index)=>choice(trackName(track,index),subs?engine.subtitleTrack===index:track.mode==='showing',()=>{if(subs){engine.subtitleTrack=index;engine.subtitleDisplay=true}else subtitleRows.forEach((t,i)=>{t.mode=i===index?'showing':'disabled'})}));}
 });
 pip.addEventListener('click',async()=>{try{if(document.pictureInPictureElement)await document.exitPictureInPicture();else await video.requestPictureInPicture()}catch{feedback.textContent='Picture-in-Picture indisponível para esta mídia.';feedback.hidden=false;}reveal()});
 cast.addEventListener('click',async()=>{try{if(video.webkitShowPlaybackTargetPicker)video.webkitShowPlaybackTargetPicker();else await video.remote.prompt()}catch{feedback.textContent='Não foi possível conectar à outra tela.';feedback.hidden=false;}reveal()});
 if(video.remote?.watchAvailability)void video.remote.watchAvailability(available=>{cast.hidden=!available}).catch(()=>{});
 video.addEventListener('webkitplaybacktargetavailabilitychanged',event=>{cast.hidden=event.availability!=='available'});

 const feedback=document.createElement('span');feedback.className='lux-video-feedback';feedback.setAttribute('role','status');feedback.hidden=true;
 panel.append(title,progress,row);host.append(panel,feedback);
 const media=()=>video.hidden&&audio?audio:video;
 let hideTimer=null;
 function reveal(){
  shell.classList.remove('lux-controls-idle');clearTimeout(hideTimer);
  if(shell.open&&!media().paused)hideTimer=setTimeout(()=>{
   if(popup.hidden&&!panel.contains(document.activeElement)&&!media().paused)shell.classList.add('lux-controls-idle');
  },3500);
 }
 function refresh(){
  const m=media(),finite=Number.isFinite(m.duration)&&m.duration>0;
  episodes.hidden=!getEpisodes()?.entries?.length;
  const engine=getEngine();tracks.hidden=!(engine?.audioTracks?.length||engine?.subtitleTracks?.length||nativeAudio().length||nativeSubtitles().length);
  pip.disabled=video.hidden||video.readyState===0;
  titleText.textContent=shell.querySelector('#playing-title')?.textContent||'Lux Player';
  play.innerHTML=icon(m.paused?'play':'pause');play.setAttribute('aria-label',m.paused?'Reproduzir':'Pausar');play.title=m.paused?'Reproduzir':'Pausar';
  progress.disabled=!finite;back.disabled=forward.disabled=!finite;
  progress.value=finite?String(Math.round((m.currentTime||0)/m.duration*1000)):'0';
  progress.style.setProperty('--lux-played',progress.value/10+'%');
  progress.setAttribute('aria-valuetext',formatPlayerTime(m.currentTime)+(finite?' de '+formatPlayerTime(m.duration):''));
  time.textContent=finite?formatPlayerTime(m.currentTime)+' / '+formatPlayerTime(m.duration):m.duration===Infinity?'AO VIVO':formatPlayerTime(m.currentTime);
  volume.value=String(m.muted?0:m.volume);volume.style.setProperty('--lux-volume',Number(volume.value)*100+'%');
  mute.innerHTML=icon(m.muted||m.volume===0?'mute':'volume');mute.setAttribute('aria-label',m.muted?'Ativar som':'Silenciar');
  fullscreen.innerHTML=icon((document.fullscreenElement||document.webkitFullscreenElement)?'exit':'fullscreen');fullscreen.setAttribute('aria-label',(document.fullscreenElement||document.webkitFullscreenElement)?'Sair da tela cheia':'Entrar em tela cheia');
 }
 async function togglePlay(){
  const m=media();feedback.hidden=true;
  if(m.paused){try{await m.play()}catch{feedback.textContent='Não foi possível iniciar a reprodução.';feedback.hidden=false;}}
  else m.pause();refresh();reveal();
 }
 async function toggleFullscreen(){
  try{await togglePlayerFullscreen(video);}catch{feedback.textContent='Tela cheia indisponível neste navegador.';feedback.hidden=false;}
  refresh();reveal();
 }
 fullscreen.addEventListener('click',toggleFullscreen);
 play.addEventListener('click',togglePlay);video.addEventListener('click',togglePlay);
 back.addEventListener('click',()=>{seekPlayer(media(),media().currentTime-10);refresh();reveal()});
 forward.addEventListener('click',()=>{seekPlayer(media(),media().currentTime+10);refresh();reveal()});
 mute.addEventListener('click',()=>{const m=media();m.muted=!m.muted;if(!m.muted&&m.volume===0)m.volume=1;refresh();reveal()});
 volume.addEventListener('input',()=>{const m=media();m.volume=Number(volume.value);m.muted=m.volume===0;refresh();reveal()});
 progress.addEventListener('input',()=>{seekPlayer(media(),Number(progress.value)/1000*media().duration);refresh();reveal()});
 for(const m of [video,audio].filter(Boolean))for(const event of ['play','pause','timeupdate','loadedmetadata','durationchange','volumechange','emptied','ended','error'])m.addEventListener(event,()=>{refresh();if(event!=='timeupdate')reveal()});
 shell.addEventListener('pointermove',reveal);shell.addEventListener('pointerdown',reveal);shell.addEventListener('focusin',reveal);
 shell.addEventListener('close',()=>{popup.hidden=true;clearTimeout(hideTimer);shell.classList.remove('lux-controls-idle')});
 document.addEventListener('fullscreenchange',refresh);
 document.addEventListener('webkitfullscreenchange',refresh);
 shell.addEventListener('keydown',event=>{
  if(!popup.hidden&&event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu();return;}
  if(!shell.open||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,button,select,textarea'))return;
  if(event.key===' '||event.key.toLowerCase()==='k'){event.preventDefault();void togglePlay()}
  else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();seekPlayer(media(),media().currentTime+(event.key==='ArrowLeft'?-10:10));refresh();reveal()}
  else if(event.key.toLowerCase()==='m'){event.preventDefault();mute.click()}
  else if(event.key.toLowerCase()==='f'){event.preventDefault();void toggleFullscreen()}
 });
 shell.addEventListener('cancel',event=>{if(!popup.hidden){event.preventDefault();event.stopImmediatePropagation();closeMenu()}},true);
 for(const list of [video.audioTracks,video.textTracks,audio?.audioTracks,audio?.textTracks].filter(Boolean))for(const event of ['addtrack','removetrack','change'])list.addEventListener?.(event,refresh);
 // Só oculta os controles nativos depois que toda a interface está ligada.
 refresh();video.controls=false;if(audio)audio.controls=false;
 return {refresh,reveal};
}

export function formatPlayerTime(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '0:00';
 const value=Math.floor(seconds),hours=Math.floor(value/3600),minutes=Math.floor(value%3600/60),rest=String(value%60).padStart(2,'0');
 return hours?hours+':'+String(minutes).padStart(2,'0')+':'+rest:minutes+':'+rest;
}
export function seekPlayer(media,seconds){
 if(!media||!Number.isFinite(media.duration)||media.duration<=0)return false;
 media.currentTime=Math.max(0,Math.min(media.duration,seconds));return true;
}
const icons={play:'M8 5v14l11-7z',pause:'M7 5h3v14H7z M14 5h3v14h-3z',volume:'M3 9h4l5-4v14l-5-4H3z M16 8c3 2 3 6 0 8 M19 5c5 4 5 10 0 14',mute:'M3 9h4l5-4v14l-5-4H3z M16 9l5 6 M21 9l-5 6',fullscreen:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',exit:'M3 8h5V3 M21 8h-5V3 M16 21v-5h5 M8 21v-5H3'};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+icons[name]+'"'+(name==='play'||name==='pause'?' fill="currentColor" stroke="none"':'')+'/></svg>'}
/** Controles de apresentação sobre os mesmos elementos HTMLMediaElement. */
export function createPlayerControls(shell){
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
 for(const [el,label,text] of [[back,'Voltar 10 segundos','↶'],[forward,'Avançar 10 segundos','↷']]){el.type='button';el.className='lux-video-button lux-video-skip';el.setAttribute('aria-label',label);el.title=label;const arrow=document.createElement('span');arrow.textContent=text;const number=document.createElement('small');number.textContent='10';el.append(arrow,number);row.append(el);}
 const mute=button('Silenciar','volume');
 const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.05';volume.value='1';volume.className='lux-video-volume';volume.setAttribute('aria-label','Volume');row.append(volume);
 const time=document.createElement('span');time.className='lux-video-time';row.append(time);
 const spacer=document.createElement('span');spacer.className='lux-video-spacer';row.append(spacer);
 const fullscreen=button('Entrar em tela cheia','fullscreen');
 const feedback=document.createElement('span');feedback.className='lux-video-feedback';feedback.setAttribute('role','status');feedback.hidden=true;
 panel.append(title,progress,row);host.append(panel,feedback);
 const media=()=>video.hidden&&audio?audio:video;
 let hideTimer=null;
 function reveal(){
  shell.classList.remove('lux-controls-idle');clearTimeout(hideTimer);
  if(shell.open&&!media().paused)hideTimer=setTimeout(()=>{
   if(!panel.contains(document.activeElement)&&!media().paused)shell.classList.add('lux-controls-idle');
  },3500);
 }
 function refresh(){
  const m=media(),finite=Number.isFinite(m.duration)&&m.duration>0;
  titleText.textContent=shell.querySelector('#playing-title')?.textContent||'Lux Player';
  play.innerHTML=icon(m.paused?'play':'pause');play.setAttribute('aria-label',m.paused?'Reproduzir':'Pausar');play.title=m.paused?'Reproduzir':'Pausar';
  progress.disabled=!finite;back.disabled=forward.disabled=!finite;
  progress.value=finite?String(Math.round((m.currentTime||0)/m.duration*1000)):'0';
  progress.style.setProperty('--lux-played',progress.value/10+'%');
  progress.setAttribute('aria-valuetext',formatPlayerTime(m.currentTime)+(finite?' de '+formatPlayerTime(m.duration):''));
  time.textContent=finite?formatPlayerTime(m.currentTime)+' / '+formatPlayerTime(m.duration):m.duration===Infinity?'AO VIVO':formatPlayerTime(m.currentTime);
  volume.value=String(m.muted?0:m.volume);volume.style.setProperty('--lux-volume',Number(volume.value)*100+'%');
  mute.innerHTML=icon(m.muted||m.volume===0?'mute':'volume');mute.setAttribute('aria-label',m.muted?'Ativar som':'Silenciar');
  fullscreen.innerHTML=icon(document.fullscreenElement?'exit':'fullscreen');fullscreen.setAttribute('aria-label',document.fullscreenElement?'Sair da tela cheia':'Entrar em tela cheia');
 }
 async function togglePlay(){
  const m=media();feedback.hidden=true;
  if(m.paused){try{await m.play()}catch{feedback.textContent='Não foi possível iniciar a reprodução.';feedback.hidden=false;}}
  else m.pause();refresh();reveal();
 }
 async function toggleFullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else if(shell.requestFullscreen)await shell.requestFullscreen();else video.webkitEnterFullscreen?.();}catch{feedback.textContent='Tela cheia indisponível neste navegador.';feedback.hidden=false;}
  refresh();reveal();
 }
 play.addEventListener('click',togglePlay);video.addEventListener('click',togglePlay);
 back.addEventListener('click',()=>{seekPlayer(media(),media().currentTime-10);refresh();reveal()});
 forward.addEventListener('click',()=>{seekPlayer(media(),media().currentTime+10);refresh();reveal()});
 mute.addEventListener('click',()=>{const m=media();m.muted=!m.muted;if(!m.muted&&m.volume===0)m.volume=1;refresh();reveal()});
 volume.addEventListener('input',()=>{const m=media();m.volume=Number(volume.value);m.muted=m.volume===0;refresh();reveal()});
 progress.addEventListener('input',()=>{seekPlayer(media(),Number(progress.value)/1000*media().duration);refresh();reveal()});
 for(const m of [video,audio].filter(Boolean))for(const event of ['play','pause','timeupdate','loadedmetadata','durationchange','volumechange','emptied','ended','error'])m.addEventListener(event,()=>{refresh();if(event!=='timeupdate')reveal()});
 shell.addEventListener('pointermove',reveal);shell.addEventListener('pointerdown',reveal);shell.addEventListener('focusin',reveal);
 shell.addEventListener('close',()=>{clearTimeout(hideTimer);shell.classList.remove('lux-controls-idle')});
 document.addEventListener('fullscreenchange',refresh);
 shell.addEventListener('keydown',event=>{
  if(!shell.open||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,button,select,textarea'))return;
  if(event.key===' '||event.key.toLowerCase()==='k'){event.preventDefault();void togglePlay()}
  else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();seekPlayer(media(),media().currentTime+(event.key==='ArrowLeft'?-10:10));refresh();reveal()}
  else if(event.key.toLowerCase()==='m'){event.preventDefault();mute.click()}
  else if(event.key.toLowerCase()==='f'){event.preventDefault();void toggleFullscreen()}
 });
 // Só oculta os controles nativos depois que toda a interface está ligada.
 refresh();video.controls=false;if(audio)audio.controls=false;
 return {refresh,reveal};
}

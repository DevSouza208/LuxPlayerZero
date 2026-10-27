import {iconMarkup,setIcon,setIconLabel} from './lux-icons.js';
const WATCH=/^https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})$/;
export function trailerVideos(data={}) {
 const seen=new Set(),rows=[];
 for(const video of [...(data.videos||[]),...(data.trailer?[{url:data.trailer,name:'Trailer oficial'}]:[])]){
  const key=WATCH.exec(String(video.url||''))?.[1];if(!key||seen.has(key))continue;
  seen.add(key);rows.push({...video,key,name:String(video.name||'Trailer')});
 }
 return rows;
}
export function createTrailerModal(){
 const modal=document.createElement('dialog');modal.className='lux-trailer-modal';modal.setAttribute('aria-label','Trailers e vídeos');
 const head=document.createElement('header'),heading=document.createElement('h2'),close=document.createElement('button');
 heading.textContent='Trailers e vídeos';close.type='button';setIcon(close,'x');close.setAttribute('aria-label','Fechar trailers');head.append(heading,close);
 const player=document.createElement('div');player.className='lux-trailer-player';player.hidden=true;
 const track=document.createElement('div');track.className='lux-video-track';track.setAttribute('aria-label','Escolher trailer');
 const hint=document.createElement('p');hint.textContent='Escolha um vídeo para assistir aqui.';hint.className='lux-trailer-hint';
 modal.append(head,player,hint,track);document.body.append(modal);
 let returnFocus=null;
 function stop(){player.replaceChildren();player.hidden=true;}
 function dismiss(){stop();if(modal.open)modal.close();}
 close.addEventListener('click',dismiss);
 modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss()}});
 modal.addEventListener('close',()=>{stop();returnFocus?.focus?.({preventScroll:true});});
 modal.addEventListener('cancel',stop);
 function play(video){
  stop();const frame=document.createElement('iframe');frame.src='https://www.youtube-nocookie.com/embed/'+video.key+'?autoplay=1&rel=0';
  frame.title=video.name;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  player.append(frame);player.hidden=false;hint.textContent=video.name;
  for(const button of track.children)button.setAttribute('aria-pressed',String(button.dataset.key===video.key));
 }
 return {close:dismiss,open(data,selectedUrl=null){
  const videos=trailerVideos(data);if(!videos.length)return;
  if(!modal.open)returnFocus=document.activeElement;stop();heading.textContent='Trailers e vídeos';hint.textContent='Escolha um vídeo para assistir aqui.';track.replaceChildren();
  for(const video of videos){const button=document.createElement('button');button.type='button';button.className='lux-video-card';button.dataset.key=video.key;button.setAttribute('aria-pressed','false');
   const image=document.createElement('img');image.src='https://i.ytimg.com/vi/'+video.key+'/hqdefault.jpg';image.alt='';image.loading='lazy';
   const label=document.createElement('span');setIconLabel(label,'play',video.name+(video.official?' · Oficial':''),true);button.append(image,label);button.addEventListener('click',()=>play(video));track.append(button);
  }
  if(!modal.open)modal.showModal();const selected=videos.find(v=>v.url===selectedUrl);if(selected)play(selected);
 }};
}

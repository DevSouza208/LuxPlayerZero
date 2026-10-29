import {localData} from './local-data.js';
import {cleanTvGuide,matchGuideChannels,GUIDE_TTL,TVMAP_SOURCE} from './tvmap-model.js';
import {safeImage} from './home-model.js';
import {setIcon} from './lux-icons.js';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const clock=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export function createTvMapGuide({onPlay=()=>{},fetcher=fetch,store=localData}={}){
 const element=node('section','content-rail lux-tvmap');element.id='home-tv-guide';element.dataset.rail='tv';element.setAttribute('aria-label','Programação da TV');
 const header=node('div','rail-heading'),head=node('div');head.append(node('span','rail-eyebrow','AO VIVO · GUIA DE PROGRAMAÇÃO'),node('h2','rail-title','Na TV agora'));
 const source=node('a','lux-tvmap-source','Abrir no TV Map ↗');source.href=TVMAP_SOURCE;source.target='_blank';source.rel='noopener noreferrer';source.referrerPolicy='no-referrer';header.append(head,source);
 const status=node('p','lux-tvmap-status','Conecte uma lista para ver a programação dos seus canais.');status.setAttribute('role','status');
 const wrap=node('div','lux-tvmap-scroll');wrap.setAttribute('aria-label','Canais e programação atual');wrap.setAttribute('role','list');
 const note=node('p','lux-tvmap-note','Fonte: TV Map · Horário de Brasília. A programação pode variar por região.');element.append(header,status,wrap,note);
 let items=[],guide=null,visible=false,pending=null,cacheRead=false,lastCheck=0,stale=false;
 function draw(){
  const focus=element.contains(document.activeElement)?document.activeElement?.dataset?.guideChannel:null,scrollTop=wrap.scrollTop,scrollLeft=wrap.scrollLeft;
  wrap.replaceChildren();
  if(!items.length){status.textContent='Conecte uma lista para ver a programação dos seus canais.';wrap.hidden=true;return;}
  if(!guide){wrap.hidden=true;return;}
  const channels=matchGuideChannels(guide,items);wrap.hidden=!channels.length;
  status.textContent=channels.length?channels.length+' canais da sua lista · Consulta '+clock(guide.fetchedAt)+(stale?' · Não foi possível atualizar a fonte agora.':''):'Os canais deste guia não foram encontrados na sua lista.';
  if(!channels.length)return;
  const now=Date.now();
  for(const channel of channels){
   const current=channel.programs.find(p=>p.start!==null&&p.end!==null&&p.start<=now&&p.end>now)
    ||channel.programs.find(p=>p.current&&(p.end===null||p.end>now));
   const next=channel.programs.find(p=>p!==current&&p.start!==null&&p.start>now);
   const card=node('article','lux-tvmap-card');card.setAttribute('role','listitem');
   const button=node('button','lux-tvmap-channel');button.type='button';button.dataset.guideChannel=channel.name;
   button.setAttribute('aria-label','Assistir '+channel.name+(current?' · '+current.title:''));
   const artwork=node('div','lux-tvmap-artwork'),logo=safeImage(channel.item.logo)||channel.logo;
   if(logo){const img=node('img');img.src=logo;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});artwork.append(img);}
   artwork.append(node('span','lux-tvmap-live','AO VIVO'));
   const play=node('span','lux-tvmap-play');play.setAttribute('aria-hidden','true');setIcon(play,'play',true);artwork.append(play);
   const body=node('div','lux-tvmap-body');body.append(node('span','lux-tvmap-name',channel.name));
   body.append(node('strong','lux-tvmap-title',current?.title||'Programação atual não informada'));
   const time=current?.start!==null&&current?.start!==undefined?clock(current.start)+(current.end!==null?' – '+clock(current.end):' · Em exibição na consulta'):current?'Em exibição na consulta':'Consulte a programação do canal';
   body.append(node('span','lux-tvmap-time',time));
   const progress=node('progress');progress.max=1;
   const ratio=current&&current.start!==null&&current.end!==null?(now-current.start)/(current.end-current.start):current?.progress;
   if(Number.isFinite(ratio)){progress.value=Math.max(0,Math.min(1,ratio));progress.setAttribute('aria-label','Progresso de '+current.title);body.append(progress);}
   const upcoming=node('div','lux-tvmap-next');upcoming.append(node('span','lux-tvmap-next-label',next?'A SEGUIR · '+clock(next.start):'A SEGUIR'),node('span','lux-tvmap-next-title',next?.title||'Programação não informada'));
   body.append(upcoming);button.append(artwork,body);button.addEventListener('click',()=>onPlay(channel.item));card.append(button);wrap.append(card);
  }
  wrap.scrollTop=scrollTop;wrap.scrollLeft=scrollLeft;
  if(focus){const button=[...wrap.querySelectorAll('[data-guide-channel]')].find(el=>el.dataset.guideChannel===focus);button?.focus({preventScroll:true});}
 }
 async function load(){
  if(!visible||!items.length)return;if(pending)return pending;
  if(Date.now()-lastCheck<GUIDE_TTL)return;
  pending=(async()=>{
   if(!cacheRead){cacheRead=true;const saved=await store.get('public:tvmap-guide-v1').catch(()=>null);try{if(saved){const clean=cleanTvGuide(saved);if(clean.windowEnd>Date.now()){guide=clean;draw();}}}catch{}}
   if(guide&&Date.now()-guide.fetchedAt<GUIDE_TTL){lastCheck=guide.fetchedAt;return;}
   if(!guide)status.textContent='Carregando programação dos seus canais…';
   const response=await fetcher('/api/metadata/tv-guide',{credentials:'omit',signal:AbortSignal.timeout(15000)}),data=await response.json();
   if(!response.ok)throw Error(data.error||'Programação indisponível.');
   guide=cleanTvGuide(data.guide);stale=data.stale===true;lastCheck=stale?Date.now()-GUIDE_TTL+3*60000:guide.fetchedAt;await store.set('public:tvmap-guide-v1',guide).catch(()=>{});draw();
  })().catch(error=>{lastCheck=Date.now()-GUIDE_TTL+3*60000;if(guide){stale=true;draw();}else status.textContent=error.message+' Você pode consultar a fonte pelo botão acima.';}).finally(()=>{pending=null});return pending;
 }
 const timer=setInterval(()=>{if(visible&&!document.hidden){if(guide&&guide.windowEnd<=Date.now()){guide=null;draw();}else if(guide&&!element.contains(document.activeElement))draw();void load();}},60000);timer.unref?.();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load();});
 return {element,setChannels(next){if(next===items)return;items=next;draw();if(visible)void load();},show(value){visible=value;if(value)void load();}};
}

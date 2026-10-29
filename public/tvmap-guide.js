import {localData} from './local-data.js';
import {cleanTvGuide,matchGuideChannels,GUIDE_TTL,TVMAP_SOURCE} from './tvmap-model.js';
import {safeImage} from './home-model.js';
import {setIconLabel} from './lux-icons.js';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const clock=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export function createTvMapGuide({onPlay=()=>{},fetcher=fetch,store=localData}={}){
 const element=node('section','content-rail lux-tvmap');element.id='home-tv-guide';element.dataset.rail='tv';element.setAttribute('aria-label','Programação da TV');
 const header=node('div','rail-heading'),head=node('div');head.append(node('span','rail-eyebrow','AO VIVO · GUIA DE PROGRAMAÇÃO'),node('h2','rail-title','Programação da TV'));
 const source=node('a','lux-tvmap-source','Abrir no TV Map ↗');source.href=TVMAP_SOURCE;source.target='_blank';source.rel='noopener noreferrer';source.referrerPolicy='no-referrer';header.append(head,source);
 const status=node('p','lux-tvmap-status','Conecte uma lista para ver a programação dos seus canais.');status.setAttribute('role','status');
 const wrap=node('div','lux-tvmap-scroll');wrap.tabIndex=0;wrap.setAttribute('aria-label','Grade de três horas. Role para ver mais canais e horários.');
 const note=node('p','lux-tvmap-note','Fonte: TV Map · Horário de Brasília. A programação pode variar por região.');element.append(header,status,wrap,note);
 let items=[],guide=null,visible=false,pending=null,cacheRead=false,lastCheck=0,stale=false;
 function draw(){
  const focus=element.contains(document.activeElement)?document.activeElement?.dataset?.guideChannel:null,scrollTop=wrap.scrollTop,scrollLeft=wrap.scrollLeft;
  wrap.replaceChildren();
  if(!items.length){status.textContent='Conecte uma lista para ver a programação dos seus canais.';wrap.hidden=true;return;}
  if(!guide){wrap.hidden=true;return;}
  const channels=matchGuideChannels(guide,items);wrap.hidden=!channels.length;
  status.textContent=channels.length?channels.length+' canais da sua lista · Consulta '+clock(guide.fetchedAt)+(stale?' · Não foi possível atualizar a fonte agora.':''):'Os canais desta grade não foram encontrados na sua lista.';
  if(!channels.length)return;
  const table=node('table','lux-tvmap-table');table.setAttribute('aria-label','Programação dos canais disponíveis');const caption=node('caption','lux-tvmap-caption','Programação de '+clock(guide.windowStart)+' a '+clock(guide.windowEnd)+' · TV Map');table.append(caption);
  const cols=node('colgroup');cols.append(node('col','lux-tvmap-channel-col'));for(let i=0;i<6;i++)cols.append(node('col'));table.append(cols);
  const thead=node('thead'),tr=node('tr'),first=node('th','','Canal');first.scope='col';tr.append(first);for(let i=0;i<6;i++){const th=node('th','',clock(guide.windowStart+i*30*60000));th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);
  const tbody=node('tbody'),now=Date.now(),span=guide.windowEnd-guide.windowStart;
  for(const channel of channels){
   const row=node('tr'),name=node('th');name.scope='row';
   const button=node('button','lux-tvmap-channel');button.type='button';button.dataset.guideChannel=channel.name;button.setAttribute('aria-label','Assistir '+channel.name);
   const logo=safeImage(channel.item.logo)||channel.logo;
   if(logo){const img=node('img');img.src=logo;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});button.append(img);}
   button.append(node('span','',channel.name));button.addEventListener('click',()=>onPlay(channel.item));name.append(button);
   const cell=node('td');cell.colSpan=6;const track=node('div','lux-tvmap-track');
   for(const program of channel.programs){
    const start=program.start??guide.windowStart,end=program.end??guide.windowEnd;
    if(end<=guide.windowStart||start>=guide.windowEnd)continue;
    const current=program.start!==null&&program.end!==null&&program.start<=now&&program.end>now;
    const block=node(program.sourceUrl?'a':'div','lux-tvmap-program'+(current?' is-current':''));
    if(program.sourceUrl){block.href=program.sourceUrl;block.target='_blank';block.rel='noopener noreferrer';block.referrerPolicy='no-referrer';}
    const begin=Math.max(start,guide.windowStart),finish=Math.min(end,guide.windowEnd);
    block.style.left=((begin-guide.windowStart)/span*100)+'%';block.style.width=((finish-begin)/span*100)+'%';
    const time=current?'Agora · '+clock(program.start)+'–'+clock(program.end):program.start!==null?clock(program.start)+(program.end!==null?'–'+clock(program.end):' · fim não informado'):'Em exibição na consulta';
    block.append(node('span','lux-tvmap-time',time),node('strong','',program.title));block.title=program.title+' · '+time;
    if(current||program.current&&program.progress!==null){const progress=node('progress');progress.max=1;progress.value=current?(now-program.start)/(program.end-program.start):program.progress;progress.setAttribute('aria-label','Progresso informado de '+program.title);block.append(progress);}
    track.append(block);
   }
   cell.append(track);row.append(name,cell);tbody.append(row);
  }
  table.append(tbody);wrap.append(table);wrap.scrollTop=scrollTop;wrap.scrollLeft=scrollLeft;
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

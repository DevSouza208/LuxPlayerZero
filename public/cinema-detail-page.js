/* Full-viewport Lux 2.0-inspired film and series pages.
 * HTML strings below are static only; provider data is assigned via textContent.
 */
const make=(tag,klass,label)=>{const el=document.createElement(tag);el.className=klass||'';if(label!==undefined)el.textContent=String(label);return el};
const photo=raw=>{try{const url=new URL(String(raw||''));return url.protocol==='https:'?url.href:''}catch{return''}};
export function createFullDetails({onPlay,metadataFor,extendedFor,isFavorite,onFavorite,getSeason,onSeason,getProgress,isWatched,onWatched}){
 const shell=make('dialog','lux-fullscreen-detail');shell.hidden=true;shell.id='lux-fullscreen-detail';
 shell.innerHTML=
 '<section class="lux-full-detail-page" role="dialog" aria-modal="true" aria-label="Detalhes do conteúdo" tabindex="-1">'+
 '<header class="lux-full-detail-top"><button type="button" data-full-close aria-label="Voltar ao catálogo">‹ <span>Voltar</span></button><span class="lux-full-detail-brand">LUX <b>PLAYER</b></span><button type="button" data-full-close aria-label="Fechar detalhes">×</button></header>'+
 '<section class="lux-full-detail-hero"><img class="lux-full-backdrop" alt="" referrerpolicy="no-referrer"><div class="lux-full-hero-mask"></div>'+
 '<div class="lux-full-poster"><img alt="" referrerpolicy="no-referrer"><span>LUX</span></div>'+
 '<div class="lux-full-summary"><span class="lux-full-eyebrow" id="lux-full-kind">FILME</span><h1 id="lux-full-title"></h1>'+
 '<div class="lux-full-meta"></div><p class="lux-full-description" hidden></p>'+
 '<div class="lux-full-credits" hidden></div><div class="lux-full-actions"><button class="lux-full-play" type="button" data-full-play>▶ <span>Começar</span></button>'+
 '<button class="lux-full-favorite" type="button" data-full-favorite>＋ Minha lista</button><button class="lux-full-favorite" type="button" data-full-watched>Marcar assistido</button></div></div></section>'+
 '<section class="lux-full-seasons" hidden aria-label="Temporadas e episódios">'+
 '<div class="lux-full-season-head"><div><span class="lux-full-eyebrow">EPISÓDIOS</span><h2 class="lux-full-season-title"></h2></div>'+
 '<div class="lux-full-season-choices" role="tablist" aria-label="Escolher temporada"></div></div><div class="lux-full-episode-grid"></div></section></section>';
 const page=shell.firstElementChild, $=selector=>shell.querySelector(selector);
 const banner=$('.lux-full-backdrop'),poster=$('.lux-full-poster img'),fallback=$('.lux-full-poster span'),seasons=$('.lux-full-seasons');
 let item=null,series=null,season=0,opened=false,suspended=false,epoch=0,oldOverflow='',returnFocus=null;
 const selectedSeasons=new Map();
 const setPhoto=(target,value)=>{target.onerror=()=>{target.hidden=true;if(target===poster)fallback.hidden=false};const src=photo(value);if(!src){target.hidden=true;target.removeAttribute('src');return false}target.src=src;target.hidden=false;return true};
 const play=entry=>{if(!entry)return;suspend();onPlay?.(entry)};
 function renderSeason(){
  if(!series?.seasons?.length)return;
  const selected=series.seasons.find(s=>s.number===season)||series.seasons[0];season=selected.number;
  $('.lux-full-season-title').textContent='Temporada '+season;
  const header=document.createDocumentFragment();
  for(const row of series.seasons){const btn=make('button','lux-full-season-tab'+(row.number===season?' is-active':''),'Temporada '+row.number);
   btn.type='button';btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(row.number===season));
   btn.addEventListener('click',()=>{season=row.number;selectedSeasons.set(series.key,season);onSeason?.(series.key,season);renderSeason()});header.append(btn)}
  $('.lux-full-season-choices').replaceChildren(header);
  const grid=document.createDocumentFragment();
  for(const row of selected.episodes){
   const card=make('button','lux-full-episode-card');card.type='button';
   const visual=make('span','lux-full-episode-art');
   const imgSrc=photo(row.item.logo);if(imgSrc){const image=make('img');image.src=imgSrc;image.alt='';image.loading='lazy';visual.append(image)}
   visual.append(make('span','lux-full-episode-play','▶'));
   const info=make('span','lux-full-episode-info');info.append(make('b','', 'T'+row.season+':E'+row.number));
   if(isWatched?.(row.item))info.append(make('small','','Assistido'));
   const progress=getProgress?.(row.item);if(progress?.duration>0){const bar=make('progress');bar.max=progress.duration;bar.value=progress.position;bar.setAttribute('aria-label','Progresso do episódio');info.append(bar)}
   if(row.title)info.append(make('small','',row.title));
   card.append(visual,info);card.setAttribute('aria-label','Reproduzir temporada '+row.season+', episódio '+row.number);
   card.addEventListener('click',()=>play(row.item));grid.append(card)}
  $('.lux-full-episode-grid').replaceChildren(grid);
 }
 function open(next,opts={}){
  if(!next)return;const first=!opened;item=next;series=opts.series||null;season=getSeason?.(series?.key)??selectedSeasons.get(series?.key)??series?.seasons[0]?.number??0;
  epoch++;const currentEpoch=epoch;
  if(first){returnFocus=document.activeElement;oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
  opened=true;suspended=false;shell.hidden=false;if(!shell.open)shell.showModal();shell.scrollTop=0;
  $('#lux-full-kind').textContent=series?'SÉRIE':'FILME';
  $('#lux-full-title').textContent=series?.title||next.displayName||next.name||'Título sem nome';
  const count=series?.episodes?.length||0;
  $('.lux-full-meta').textContent=series?
    series.seasons.length+' temporada'+(series.seasons.length===1?'':'s')+' · '+count+' episódio'+(count===1?'':'s'):
    [next.catalogYear,next.normalizedGroup||next.group].filter(Boolean).join(' · ');
  const desc=$('.lux-full-description');desc.hidden=true;desc.textContent='';
  const credits=$('.lux-full-credits');credits.hidden=true;credits.replaceChildren();
  const resume=series?.episodes.find(row=>getProgress?.(row.item)?.position>15)||series?.episodes.find(row=>!isWatched?.(row.item))||series?.episodes[0];
  const playLabel=$('[data-full-play] span');playLabel.textContent=resume?'Continuar T'+resume.season+':E'+resume.number:(getProgress?.(next)?.position>15?'Continuar':'Começar');
  $('[data-full-watched]').textContent=isWatched?.(next)?'Marcar não assistido':'Marcar assistido';
  $('[data-full-favorite]').textContent=isFavorite?.(next)?'♥ Na minha lista':'＋ Minha lista';
  setPhoto(banner,opts.backdrop);
  fallback.hidden=setPhoto(poster,opts.poster||next.logo);
  seasons.hidden=!series?.seasons?.length;
  if(!seasons.hidden)renderSeason();
  page.focus({preventScroll:true});
  if(typeof metadataFor==='function')void (async()=>{
   try{const target=series?{...next,name:series.title,displayName:series.title}:next;
    const info=await metadataFor(target);if(!opened||currentEpoch!==epoch||info?.status!=='matched')return;
    setPhoto(banner,info.backdrop||opts.backdrop);
    fallback.hidden=setPhoto(poster,info.poster||opts.poster||next.logo);
    if(info.overview){desc.textContent=info.overview;desc.hidden=false}
    const values=[info.year,...(info.genres||[]).slice(0,3),info.rating?'★ '+info.rating:null].filter(Boolean);
    if(values.length)$('.lux-full-meta').textContent=(series?series.seasons.length+' temporadas · '+count+' episódios · ':'')+values.join(' · ');
    const extended=await extendedFor?.(info,target);
    if(!opened||currentEpoch!==epoch||!extended)return;
    if(extended.certification)credits.append(make('p','','Classificação no Brasil: '+extended.certification));
    if(extended.directors?.length)credits.append(make('p','','Direção: '+extended.directors.join(', ')));
    if(extended.creators?.length)credits.append(make('p','','Criação: '+extended.creators.join(', ')));
    if(extended.cast?.length)credits.append(make('p','','Elenco: '+extended.cast.map(row=>row.name).join(', ')));
    if(extended.collection?.name)credits.append(make('p','','Coleção: '+extended.collection.name));
    if(extended.trailer&&/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(extended.trailer)){
      const link=make('a','','Ver trailer oficial');link.href=extended.trailer;link.target='_blank';link.rel='noopener noreferrer';credits.append(link);
    }
    credits.hidden=!credits.childNodes.length;
   }catch{/* Metadata never affects playback. */}
  })();
 }
 function suspend(){
   if(!opened)return;
   opened=false;suspended=true;shell.close();shell.hidden=true;
   document.body.style.overflow=oldOverflow;
 }
 function resume(){
   if(!suspended||!item)return false;
   oldOverflow=document.body.style.overflow;
   document.body.style.overflow='hidden';suspended=false;opened=true;
   shell.hidden=false;if(!shell.open)shell.showModal();page.focus({preventScroll:true});return true;
 }
 function close(){
   if(!opened&&!suspended)return;
   opened=false;suspended=false;epoch++;shell.close();shell.hidden=true;returnFocus?.focus?.();
   document.body.style.overflow=oldOverflow;series=null;item=null;
 }
 shell.addEventListener('click',event=>{
  if(event.target.closest('[data-full-close]'))close();
  else if(event.target.closest('[data-full-play]'))play((series?.episodes.find(row=>getProgress?.(row.item)?.position>15)||series?.episodes.find(row=>!isWatched?.(row.item))||series?.episodes[0])?.item||item);
  else if(event.target.closest('[data-full-watched]')&&item){void Promise.resolve(onWatched?.(item)).then(()=>{$('[data-full-watched]').textContent=isWatched?.(item)?'Marcar não assistido':'Marcar assistido';if(series)renderSeason()})}
  else if(event.target.closest('[data-full-favorite]')&&item){onFavorite?.(item);$('[data-full-favorite]').textContent=isFavorite?.(item)?'♥ Na minha lista':'＋ Minha lista'}
 });
 document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.stopPropagation();close()}});
 shell.addEventListener('cancel',event=>{event.preventDefault();close()});
 document.body.append(shell);
 return {open,close,resume,canResume:()=>suspended,isOpen:()=>opened};
}

import {createTrailerModal,trailerVideos} from './trailer-modal.js';
import {renderRichMetadata,detailFacts} from './tmdb-rich-view.js';
/* Full-viewport Lux 2.0-inspired film and series pages.
 * HTML strings below are static only; provider data is assigned via textContent.
 */
const make=(tag,klass,label)=>{const el=document.createElement(tag);el.className=klass||'';if(label!==undefined)el.textContent=String(label);return el};
const photo=raw=>{try{const url=new URL(String(raw||''));return url.protocol==='https:'?url.href:''}catch{return''}};
export function createFullDetails({onPlay,onRelated,metadataFor,extendedFor,isFavorite,onFavorite,getSeason,onSeason,getProgress,isWatched,onWatched}){
 const trailers=createTrailerModal();let trailerData={};
 const shell=make('dialog','lux-fullscreen-detail');shell.hidden=true;shell.id='lux-fullscreen-detail';
 shell.innerHTML=
 '<section class="lux-full-detail-page" role="dialog" aria-modal="true" aria-label="Detalhes do conteúdo" tabindex="-1">'+
 '<header class="lux-full-detail-top"><button type="button" data-full-close aria-label="Voltar ao catálogo">‹ <span>Voltar</span></button><span class="lux-full-detail-brand">LUX <b>PLAYER</b></span><button type="button" data-full-close aria-label="Fechar detalhes">×</button></header>'+
 '<section class="lux-full-detail-hero"><img class="lux-full-backdrop" alt="" referrerpolicy="no-referrer"><div class="lux-full-hero-mask"></div>'+
 '<div class="lux-full-poster"><img alt="" referrerpolicy="no-referrer"><span>LUX</span></div>'+
 '<div class="lux-full-summary"><span class="lux-full-eyebrow" id="lux-full-kind">FILME</span><h1 id="lux-full-title"></h1>'+
 '<div class="lux-full-meta"></div><p class="lux-full-description" hidden></p>'+
 '<div class="lux-full-actions"><button class="lux-full-play" type="button" data-full-play>▶ <span>Começar</span></button>'+
 '<button class="lux-full-trailer" type="button" data-full-trailer hidden>▶ Trailer</button><button class="lux-full-favorite" type="button" data-full-favorite>＋ Minha lista</button><button class="lux-full-favorite" type="button" data-full-watched>Marcar assistido</button></div></div></section>'+
 '<section class="lux-full-seasons" hidden aria-label="Temporadas e episódios">'+
 '<div class="lux-full-season-head"><div><span class="lux-full-eyebrow">EPISÓDIOS</span><h2 class="lux-full-season-title"></h2></div>'+
 '<div class="lux-full-season-choices" role="tablist" aria-label="Escolher temporada"></div></div><div class="lux-full-episode-grid"></div></section><section class="lux-full-credits" hidden aria-label="Informações do TMDB"></section></section>';
 const page=shell.firstElementChild, $=selector=>shell.querySelector(selector);
 const banner=$('.lux-full-backdrop'),poster=$('.lux-full-poster img'),fallback=$('.lux-full-poster span'),seasons=$('.lux-full-seasons');
 let item=null,series=null,season=0,opened=false,suspended=false,epoch=0,oldOverflow='',returnFocus=null,lastOptions={};
 const selectedSeasons=new Map();
 $('[data-full-trailer]').addEventListener('click',()=>trailers.open(trailerData));
 const setPhoto=(target,value)=>{target.onerror=()=>{const reserve=target===poster?photo(lastOptions.fallbackPoster):'';if(reserve&&target.src!==reserve){target.src=reserve;return}target.hidden=true;if(target===poster)fallback.hidden=false};const src=photo(value);if(!src){target.hidden=true;target.removeAttribute('src');return false}target.src=src;target.hidden=false;return true};
 const play=entry=>{if(!entry)return;suspend();onPlay?.(entry)};
 function renderSeason(focusSelected=false){
  if(!series?.seasons?.length)return;
  const selected=series.seasons.find(s=>s.number===season)||series.seasons[0];season=selected.number;
  $('.lux-full-season-title').textContent='Temporada '+season;
  const header=document.createDocumentFragment();
  for(const row of series.seasons){const btn=make('button','lux-full-season-tab'+(row.number===season?' is-active':''),'Temporada '+row.number);
   btn.type='button';btn.tabIndex=row.number===season?0:-1;btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(row.number===season));
   btn.addEventListener('click',()=>{season=row.number;selectedSeasons.set(series.key,season);onSeason?.(series.key,season);renderSeason(true)});header.append(btn)}
  $('.lux-full-season-choices').replaceChildren(header);
  if(focusSelected)$('[role=tab][aria-selected=true]')?.focus();
  const grid=document.createDocumentFragment();
  for(const row of selected.episodes){
   const card=make('button','lux-full-episode-card');card.type='button';
   const visual=make('span','lux-full-episode-art');
   const imgSrc=photo(row.item.logo)||photo(series?.poster);if(imgSrc){const image=make('img');image.src=imgSrc;image.alt='';image.loading='lazy';visual.append(image)}
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
  if(!next)return;trailers.close();trailerData={};lastOptions=opts;const first=!opened;item=next;series=opts.series||null;season=getSeason?.(series?.key)??selectedSeasons.get(series?.key)??series?.seasons[0]?.number??0;
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
  const trailerLink=$('[data-full-trailer]');trailerLink.hidden=true;trailerLink.removeAttribute('href');
  const credits=$('.lux-full-credits');credits.hidden=true;credits.replaceChildren();
  const resume=series?.episodes.find(row=>!isWatched?.(row.item)&&getProgress?.(row.item)?.position>15)||series?.episodes.find(row=>!isWatched?.(row.item))||series?.episodes[0];
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
    if(extended.overview){desc.textContent=extended.overview;desc.hidden=false;}
    const rich=make('div');renderRichMetadata(rich,extended,{onVideo:url=>trailers.open(trailerData,url)});credits.append(rich);
    const richFacts=detailFacts(extended);if(richFacts.length)$('.lux-full-meta').textContent=richFacts.join(' · ');
    if(extended.collection?.name){
      credits.append(make('h2','','Coleção: '+extended.collection.name));
      if(!extended.collectionItems?.length)credits.append(make('p','',extended.collection.status==='unavailable'?'Não foi possível consultar os títulos desta coleção agora.':'Nenhum outro título desta coleção foi identificado com segurança no catálogo.'));
    }
    const appendRelations=(rows,label)=>{
      if(!rows?.length)return;
      const section=make('section','lux-related');section.setAttribute('aria-label',label);
      section.append(make('h3','',label));
      const track=make('div','lux-related-track');
      for(const row of rows){
        const button=make('button','lux-related-card');button.type='button';button.setAttribute('aria-label','Ver detalhes de '+row.title);
        const visual=make('span','lux-related-art'),posterUrl=photo(row.poster)||photo(row.item.logo);
        if(posterUrl){const image=make('img');image.src=posterUrl;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>{const reserve=photo(row.item.logo);if(reserve&&image.src!==reserve){image.src=reserve;return}image.remove()};visual.append(image)}
        visual.append(make('span','lux-related-letter',row.title.slice(0,1).toUpperCase()));
        button.append(visual,make('strong','lux-related-title',row.title));if(row.year)button.append(make('small','lux-related-year',row.year));
        button.addEventListener('click',()=>onRelated?.(row.item));track.append(button);
      }
      section.append(track);
      credits.append(section);
    };
    appendRelations(extended.collectionItems,'Da mesma coleção no seu catálogo');
    appendRelations(extended.similarItems,'Títulos semelhantes no seu catálogo');
    trailerData=extended;trailerLink.hidden=!trailerVideos(extended).length;
    credits.hidden=!credits.childNodes.length;
   }catch{/* Metadata never affects playback. */}
  })();
 }
 function suspend(){
   trailers.close();
   if(!opened)return;
   opened=false;suspended=true;shell.close();shell.hidden=true;
   document.body.style.overflow=oldOverflow;
 }
 function resume(){
   if(!suspended||!item)return false;
   open(item,lastOptions);return true;
 }
 function close(){
   trailers.close();
   if(!opened&&!suspended)return;
   opened=false;suspended=false;epoch++;shell.close();shell.hidden=true;returnFocus?.focus?.();
   document.body.style.overflow=oldOverflow;series=null;item=null;
 }
 $('.lux-full-season-choices').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...$('.lux-full-season-choices').querySelectorAll('[role=tab]')],index=tabs.indexOf(document.activeElement);
  if(index<0)return;event.preventDefault();
  const target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[target].click();
 });
 shell.addEventListener('click',event=>{
  if(event.target.closest('[data-full-close]'))close();
  else if(event.target.closest('[data-full-play]'))play((series?.episodes.find(row=>!isWatched?.(row.item)&&getProgress?.(row.item)?.position>15)||series?.episodes.find(row=>!isWatched?.(row.item))||series?.episodes[0])?.item||item);
  else if(event.target.closest('[data-full-watched]')&&item){void Promise.resolve(onWatched?.(item)).then(()=>{$('[data-full-watched]').textContent=isWatched?.(item)?'Marcar não assistido':'Marcar assistido';if(series)renderSeason()})}
  else if(event.target.closest('[data-full-favorite]')&&item){onFavorite?.(item);$('[data-full-favorite]').textContent=isFavorite?.(item)?'♥ Na minha lista':'＋ Minha lista'}
 });
 document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.stopPropagation();close()}});
 shell.addEventListener('cancel',event=>{event.preventDefault();close()});
 document.body.append(shell);
 return {open,close,resume,canResume:()=>suspended,isOpen:()=>opened};
}

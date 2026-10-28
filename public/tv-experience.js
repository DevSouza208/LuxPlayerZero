import {safeImage} from './home-model.js';
import {setIconLabel} from './lux-icons.js';
import {normalizeSearchText} from './media-taxonomy.js';
import {createLocalData} from './local-data.js';
import {TV_DAYS,saoPauloDay,emptyTvSchedule,cleanTvSchedule,channelsForDay} from './tv-feature-model.js';
import {guideTvGroups} from './tv-guide-categories.js';
const el=(tag,cls='',text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node};
const button=(text,action,cls='')=>{const node=el('button',cls,text);node.type='button';node.addEventListener('click',action);return node};
export function createTvExperience({host,onPlay,onDetails,onFilterChange=()=>{},guest=false,getProfileId=()=>null,fetcher=fetch,storage=createLocalData(),now=()=>new Date()}={}){
 let sourceGroups=null;
 let groups=[],index=guideTvGroups([]),section='all',schedule=emptyTvSchedule(),canEdit=false,active=false,day=saoPauloDay(now()),selectedKey='',lastRead=0,loading=null;
 const root=el('div','lux-tv-experience');root.hidden=true;host.prepend(root);
 const hero=el('section','lux-tv-hero');hero.setAttribute('aria-label','Canais em destaque');
 const navigation=el('nav','lux-tv-navigation');navigation.setAttribute('aria-label','Categorias de canais');
 const notices=el('p','lux-tv-notice');notices.setAttribute('role','status');notices.hidden=true;root.append(hero,navigation,notices);
 const dialog=el('dialog','lux-tv-editor');dialog.setAttribute('aria-labelledby','tv-editor-title');
 const form=el('form'),header=el('header'),heading=el('h2','','Destaques da semana');heading.id='tv-editor-title';
 const close=button('Fechar',()=>dialog.close(),'lux-tv-quiet');close.setAttribute('aria-label','Fechar agenda de destaques');header.append(heading,close);
 const explanation=el('p','','Escolha até seis canais por dia. A ordem define o destaque principal. A agenda se repete semanalmente até você editar, no horário de São Paulo.');
 const dayLabel=el('label','','Dia da semana'),daySelect=el('select');daySelect.setAttribute('aria-label','Dia da semana');
 for(let i=1;i<=7;i++){const option=el('option','',TV_DAYS[i%7]);option.value=String(i%7);daySelect.append(option)}dayLabel.append(daySelect);
 const selected=el('div','lux-tv-selected'),searchLabel=el('label','','Buscar canal na sua playlist'),search=el('input');search.type='search';search.placeholder='Nome do canal…';search.setAttribute('aria-label','Buscar canal para destacar');searchLabel.append(search);
 const results=el('div','lux-tv-results'),editorStatus=el('p','lux-tv-editor-status');editorStatus.setAttribute('role','status');
 const save=el('button','lux-tv-save','Salvar destaques');save.type='submit';
 form.append(header,explanation,dayLabel,selected,searchLabel,results,editorStatus,save);dialog.append(form);document.body.append(dialog);
 let draft=null,editingDay=day,returnFocus=null;
 const cacheKey=()=>getProfileId()?'tv-highlights:'+getProfileId():null;
 const message=text=>{notices.textContent=text;notices.hidden=!text};
 function renderHero(){
  hero.replaceChildren();const choices=channelsForDay(groups,schedule,day),current=choices.find(row=>row.key===selectedKey)||choices[0];selectedKey=current?.key||'';
  const content=el('div','lux-tv-hero-copy');content.append(el('span','lux-tv-eyebrow',(current?'EM DESTAQUE':'TV AO VIVO')+' · '+TV_DAYS[day].toLocaleUpperCase('pt-BR')));
  content.append(el('h2','',current?.title||'Encontre seu próximo canal.'));
  content.append(el('p','',current?'Uma seleção para hoje. Escolha o canal e acompanhe ao vivo.':'Explore os canais da sua playlist. Os destaques escolhidos pelo administrador aparecem aqui.'));
  const actions=el('div','lux-tv-hero-actions');
  if(current){const play=button('',()=>onPlay?.(current.primary),'lux-tv-watch');setIconLabel(play,'play','Assistir ao vivo',true);actions.append(play);const details=button('Fontes e informações',()=>onDetails?.(current.primary),'lux-tv-quiet');actions.append(details);}
  else actions.append(button('Explorar canais',()=>host.querySelector('#browse-grid')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),'lux-tv-watch'));
  if(canEdit){const edit=button('Programar destaques',openEditor,'lux-tv-quiet');edit.dataset.tvEditor='true';actions.append(edit)}content.append(actions);
  if(choices.length>1){const picker=el('div','lux-tv-featured-choices');picker.setAttribute('role','group');picker.setAttribute('aria-label','Destaques de hoje');for(const group of choices){const node=button(group.title,()=>{selectedKey=group.key;renderHero();[...hero.querySelectorAll('[data-channel]')].find(value=>value.dataset.channel===group.key)?.focus({preventScroll:true})});node.dataset.channel=group.key;node.setAttribute('aria-pressed',String(group===current));picker.append(node)}content.append(picker)}
  hero.append(content);
  const art=el('div','lux-tv-hero-logo');art.setAttribute('aria-hidden','true');
  const logo=safeImage(current?.primary.logo);if(logo){const img=el('img');img.src=logo;img.alt='';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.remove();art.textContent='AO VIVO'});art.append(img)}else art.textContent=current?'AO VIVO':'LUX TV';hero.append(art);
 }
 function renderNavigation(){
  navigation.replaceChildren();const tabs=el('div','lux-tv-types');
  for(const category of [{key:'all',label:'Todos',channels:index.channels},...index.categories]){
   const node=button(category.label+' · '+category.channels.length.toLocaleString('pt-BR'),()=>{section=category.key;renderNavigation();onFilterChange();[...navigation.querySelectorAll('[data-section]')].find(value=>value.dataset.section===section)?.focus({preventScroll:true})});node.dataset.section=category.key;node.setAttribute('aria-pressed',String(section===category.key));tabs.append(node);
  }navigation.append(tabs);
 }
 function renderEditor(){
  selected.replaceChildren();const rows=draft.days[editingDay];
  selected.append(el('h3','',rows.length+' de 6 canais selecionados'));
  rows.forEach((ref,i)=>{const row=el('div','lux-tv-selected-row');row.append(el('span','',ref.title));
   const up=button('↑',()=>{[rows[i-1],rows[i]]=[rows[i],rows[i-1]];renderEditor()});up.disabled=i===0;up.setAttribute('aria-label','Mover '+ref.title+' para cima');
   const down=button('↓',()=>{[rows[i+1],rows[i]]=[rows[i],rows[i+1]];renderEditor()});down.disabled=i===rows.length-1;down.setAttribute('aria-label','Mover '+ref.title+' para baixo');
   const remove=button('Remover',()=>{rows.splice(i,1);renderEditor()});remove.setAttribute('aria-label','Remover '+ref.title+' dos destaques');row.append(up,down,remove);selected.append(row)});
  results.replaceChildren();const query=normalizeSearchText(search.value),available=groups.filter(group=>!rows.some(ref=>ref.key===group.key)&&(!query||normalizeSearchText(group.title).includes(query))).slice(0,12);
  for(const group of available){const node=button('+ '+group.title,()=>{try{const next={...draft,days:{...draft.days,[editingDay]:[...rows,{key:group.key,title:group.title}]}};draft=cleanTvSchedule(next);editorStatus.textContent='';renderEditor()}catch(error){editorStatus.textContent=error.message}});node.disabled=rows.length>=6;results.append(node)}
  if(!available.length)results.append(el('p','','Nenhum outro canal encontrado na sua playlist.'));
 }
 function openEditor(){if(!canEdit)return;draft=cleanTvSchedule(schedule);editingDay=day;daySelect.value=String(day);search.value='';editorStatus.textContent='';renderEditor();returnFocus=document.activeElement;dialog.showModal();daySelect.focus()}
 dialog.addEventListener('close',()=>{const target=returnFocus?.isConnected?returnFocus:hero.querySelector('[data-tv-editor]');target?.focus()});
 daySelect.addEventListener('change',()=>{editingDay=Number(daySelect.value);search.value='';renderEditor()});search.addEventListener('input',renderEditor);
 async function request(options={}){const response=await fetcher('/api/editorial/tv-highlights',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000),...options});const value=await response.json();if(!response.ok)throw Error(value.error||'Destaques indisponíveis.');return {...value,schedule:cleanTvSchedule(value.schedule)}}
 async function storeSchedule(){try{const key=cacheKey();if(key)await storage.set(key,{schedule,checkedAt:Date.now(),canEdit})}catch{/* Optional local cache never blocks TV. */}}
 async function load(){
  if(guest||loading||Date.now()-lastRead<3600000)return loading;
  loading=(async()=>{
   try{const key=cacheKey(),cached=key?await storage.get(key):null;if(cached?.schedule){schedule=cleanTvSchedule(cached.schedule);canEdit=cached.canEdit===true;renderHero();if(Number.isFinite(cached.checkedAt)&&Date.now()-cached.checkedAt>=0&&Date.now()-cached.checkedAt<3600000){lastRead=cached.checkedAt;return}}}catch{/* Ignore invalid or unavailable local data. */}
   try{const data=await request();schedule=data.schedule;canEdit=data.canEdit===true;lastRead=Date.now();message('');await storeSchedule();renderHero()}catch(error){lastRead=Date.now();message(error.message+' Os canais da playlist continuam disponíveis.')}
  })().finally(()=>{loading=null});return loading;
 }
 form.addEventListener('submit',async event=>{event.preventDefault();if(!canEdit)return;save.disabled=true;editorStatus.textContent='Salvando agenda…';try{
  const data=await request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({schedule:cleanTvSchedule(draft)})});schedule=data.schedule;selectedKey='';lastRead=Date.now();await storeSchedule();renderHero();dialog.close();message('Destaques da semana salvos.');
 }catch(error){editorStatus.textContent=error.message}finally{save.disabled=false}});
 function refreshDay(){const current=saoPauloDay(now());if(current!==day){day=current;selectedKey='';renderHero()}}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active){refreshDay();void load()}});
 const timer=setInterval(()=>{if(active&&!document.hidden)refreshDay()},60000);
 return {
  setGroups(next){if(sourceGroups===next)return;sourceGroups=next;index=guideTvGroups(next);groups=index.groups;if(section!=='all'&&!index.categories.some(row=>row.key===section))section='all';renderHero();renderNavigation();if(dialog.open&&draft)renderEditor()},
  show(value){active=value;root.hidden=!value;if(value){refreshDay();if(!hero.children.length)renderHero();if(!navigation.children.length)renderNavigation();void load()}},
  get filterKey(){return section},
  get allChannels(){return index.channels},
  channels(){return section==='all'?index.channels:index.categories.find(category=>category.key===section)?.channels||[]},
  dispose(){clearInterval(timer);root.remove();dialog.remove()},
 };
}

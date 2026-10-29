import {safeImage} from './home-model.js';
import {setIcon,setIconLabel} from './lux-icons.js';
import {normalizeSearchText} from './media-taxonomy.js';
import {createLocalData} from './local-data.js';
import {TV_DAYS,saoPauloDay,emptyTvSchedule,cleanTvSchedule,channelsForDay} from './tv-feature-model.js';
import {guideTvGroups} from './tv-guide-categories.js';
import {createTvCuratedLoader,curatedTvGroups} from './tv-curated-catalog.js';
const el=(tag,cls='',text)=>{const node=document.createElement(tag);node.className=cls;if(text!==undefined)node.textContent=text;return node};
const button=(text,action,cls='')=>{const node=el('button',cls,text);node.type='button';node.addEventListener('click',action);return node};
export function createTvExperience({host,onPlay,onDetails,onFilterChange=()=>{},guest=false,getProfileId=()=>null,fetcher=fetch,storage=createLocalData(),now=()=>new Date(),catalogLoader=createTvCuratedLoader()}={}){
 let sourceGroups=null,catalog=null,catalogLoading=null,subgroup='',folderLevel='groups',disposed=false,catalogWarning='',statusMessage='';
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
 const renderNotice=()=>{notices.textContent=[statusMessage,catalogWarning].filter(Boolean).join(' ');notices.hidden=!notices.textContent};
 const message=text=>{statusMessage=text;renderNotice()};
 function renderHero(){
  hero.replaceChildren();const choices=channelsForDay(groups,schedule,day),current=choices.find(row=>row.key===selectedKey)||choices[0];selectedKey=current?.key||'';
  const content=el('div','lux-tv-hero-copy');content.append(el('span','lux-tv-eyebrow',(current?'EM DESTAQUE':'TV AO VIVO')+' · '+TV_DAYS[day].toLocaleUpperCase('pt-BR')));
  content.append(el('h2','',current?.title||'Encontre seu próximo canal.'));
  content.append(el('p','',current?'Uma seleção para hoje. Escolha o canal e acompanhe ao vivo.':'Explore os canais da sua playlist. Os destaques escolhidos pelo administrador aparecem aqui.'));
  const actions=el('div','lux-tv-hero-actions');
  if(current){const play=button('',()=>onPlay?.(current.primary),'lux-tv-watch');setIconLabel(play,'play','Assistir ao vivo',true);actions.append(play);const details=button('Fontes e informações',()=>onDetails?.(current.primary),'lux-tv-quiet');actions.append(details);}
  else actions.append(button('Explorar canais',()=>navigation.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),'lux-tv-watch'));
  if(canEdit){const edit=button('Programar destaques',openEditor,'lux-tv-quiet');edit.dataset.tvEditor='true';actions.append(edit)}content.append(actions);
  if(choices.length>1){const picker=el('div','lux-tv-featured-choices');picker.setAttribute('role','group');picker.setAttribute('aria-label','Destaques de hoje');for(const group of choices){const node=button(group.title,()=>{selectedKey=group.key;renderHero();[...hero.querySelectorAll('[data-channel]')].find(value=>value.dataset.channel===group.key)?.focus({preventScroll:true})});node.dataset.channel=group.key;node.setAttribute('aria-pressed',String(group===current));picker.append(node)}content.append(picker)}
  hero.append(content);
  const art=el('div','lux-tv-hero-logo');art.setAttribute('aria-hidden','true');
  const logo=safeImage(current?.primary.logo);if(logo){const img=el('img');img.src=logo;img.alt='';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.remove();art.textContent='AO VIVO'});art.append(img)}else art.textContent=current?'AO VIVO':'LUX TV';hero.append(art);
 }
 function selectedCategory(){return index.categories.find(row=>row.key===section)}
 function syncFolderView(){host.classList.toggle('is-tv-folder-view',active&&folderLevel!=='channels')}
 function moveTo(level,group='all',sub='',focusKey=''){
  folderLevel=level;section=group;subgroup=sub;renderNavigation();onFilterChange({clearSearch:true});
  const target=focusKey?[...navigation.querySelectorAll('[data-folder]')].find(node=>node.dataset.folder===focusKey):navigation.querySelector('.lux-tv-folder-title')||navigation.querySelector('[aria-current="page"]');
  target?.focus({preventScroll:true});
 }
 function goBack(){
  const category=selectedCategory();
  if(folderLevel==='channels'&&category?.subgroups?.length)moveTo('subgroups',section,'',subgroup||'all-channels');
  else moveTo('groups','all','',section==='all'?'all-channels':section);
 }
 function renderNavigation(){
  navigation.replaceChildren();syncFolderView();
  const category=selectedCategory(),path=el('div','lux-tv-folder-path');path.setAttribute('aria-label','Caminho dos canais');
  if(folderLevel!=='groups'){
   const back=button('',goBack,'lux-tv-folder-back');setIconLabel(back,'arrow-left','Voltar');path.append(back);
   path.append(button('TV',()=>moveTo('groups','all','',section),'lux-tv-crumb'));
   if(category){path.append(el('span','lux-tv-crumb-separator','/'));if(folderLevel==='channels')path.append(button(category.label,()=>moveTo('subgroups',section,'',subgroup||'all-channels'),'lux-tv-crumb'));else {const current=el('span','lux-tv-crumb-current',category.label);current.setAttribute('aria-current','page');path.append(current)}}
   if(folderLevel==='channels'){path.append(el('span','lux-tv-crumb-separator','/'));const current=el('span','lux-tv-crumb-current',subgroup||'Todos os canais');current.setAttribute('aria-current','page');current.tabIndex=-1;path.append(current)}
  }else {const current=el('span','lux-tv-crumb-current','TV');current.setAttribute('aria-current','page');path.append(current)}
  navigation.append(path);
  if(folderLevel==='channels')return;
  const title=el('h1','lux-tv-folder-title',folderLevel==='groups'?'Categorias de canais':category?.label||'Canais');title.tabIndex=-1;
  const intro=el('p','lux-tv-folder-intro',folderLevel==='groups'?'Escolha uma categoria para explorar.':'Escolha uma pasta para ver os canais.');
  const grid=el('div','lux-tv-folder-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label',folderLevel==='groups'?'Grupos de canais':'Subgrupos de '+category?.label);
  const choices=folderLevel==='groups'?[{key:'all-channels',label:'Todos os canais',channels:index.channels},...index.categories]:[{key:'all-channels',label:'Todos os canais',channels:category?.channels||[]},...(category?.subgroups||[])];
  for(const row of choices){
   if(!row.channels.length)continue;
   const card=button('',()=>{
    if(folderLevel==='groups')moveTo(row.key==='all-channels'?'channels':row.subgroups?.length?'subgroups':'channels',row.key==='all-channels'?'all':row.key);
    else moveTo('channels',section,row.key==='all-channels'?'':row.key);
   },'lux-tv-folder-card');card.dataset.folder=row.key;card.setAttribute('aria-label','Abrir '+row.label+', '+row.channels.length.toLocaleString('pt-BR')+(row.channels.length===1?' canal':' canais'));
   const icon=el('span','lux-tv-folder-icon');setIcon(icon,row.key==='all-channels'?'tv':'folder');
   const text=el('span','lux-tv-folder-copy');text.append(el('strong','',row.label),el('span','',row.channels.length.toLocaleString('pt-BR')+(row.channels.length===1?' canal':' canais')));
   const arrow=el('span','lux-tv-folder-arrow');setIcon(arrow,'chevron-right');card.append(icon,text,arrow);grid.append(card);
  }
  if(!grid.children.length){const empty=el('div','lux-tv-folder-empty');empty.append(el('p','','Conecte sua playlist para explorar os canais.'),button('Conectar fonte',()=>document.getElementById('open-source')?.click(),'lux-tv-quiet'));grid.append(empty)}
  navigation.append(title,intro,grid);
 }
 function rebuildIndex(){
  index=catalog?curatedTvGroups(sourceGroups||[],catalog):guideTvGroups(sourceGroups||[]);groups=index.groups;
  if(section!=='all'&&!selectedCategory()){section='all';subgroup='';folderLevel='groups'}
  if(subgroup&&!selectedCategory()?.subgroups?.some(row=>row.key===subgroup)){subgroup='';folderLevel='subgroups'}
  renderHero();renderNavigation();if(dialog.open&&draft)renderEditor();
 }
 function loadCatalog(){
  if(catalog||catalogLoading||!sourceGroups?.length||disposed)return;
  catalogLoading=Promise.resolve().then(catalogLoader).then(value=>{
   if(disposed)return;catalog=value;catalogWarning='';renderNotice();rebuildIndex();onFilterChange();
  }).catch(()=>{if(!disposed){catalogWarning='Organização de canais indisponível no momento. Exibindo categorias básicas da playlist.';renderNotice()}}).finally(()=>{catalogLoading=null});
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
  setGroups(next){if(sourceGroups===next)return;sourceGroups=next;rebuildIndex();loadCatalog()},
  show(value){active=value;root.hidden=!value;syncFolderView();if(value){loadCatalog();refreshDay();if(!hero.children.length)renderHero();if(!navigation.children.length)renderNavigation();void load()}},
  get filterKey(){return JSON.stringify([folderLevel,section,subgroup])},
  get allChannels(){return index.channels},
  openAllForSearch(){if(folderLevel!=='channels'){folderLevel='channels';section='all';subgroup='';renderNavigation()}},
  get browseTitle(){return folderLevel==='channels'?(subgroup||selectedCategory()?.label||'Todos os canais'):''},
  channels(){if(folderLevel!=='channels')return [];if(section==='all')return index.channels;const category=selectedCategory();return subgroup?category?.subgroups?.find(row=>row.key===subgroup)?.channels||[]:category?.channels||[]},
  dispose(){disposed=true;host.classList.remove('is-tv-folder-view');clearInterval(timer);root.remove();dialog.remove()},
 };
}

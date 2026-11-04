import {searchSimilarity,normalizeSearchText} from './media-taxonomy.js';
import {titleForDisplay} from './cinema-title.js';

const MIN_SCORE=.70, PAGE_SIZE=24, MAX_CANDIDATES=250;
const recentKey='lux-zero-search-recent-v2';
const trendsKey='lux-zero-search-trends-v2';
const readTrends=()=>{try{return JSON.parse(localStorage.getItem(trendsKey)||'{}')}catch{return{}}};
const saveTrend=q=>{try{const key=normalizeSearchText(q);const all=readTrends();all[key]={title:q,count:(all[key]?.count||0)+1,at:Date.now()};const limited=Object.entries(all).sort((a,b)=>b[1].at-a[1].at).slice(0,50);localStorage.setItem(trendsKey,JSON.stringify(Object.fromEntries(limited)))}catch{}};
const readRecent=()=>{try{return JSON.parse(localStorage.getItem(recentKey)||'[]').slice(0,8)}catch{return[]}};
const saveRecent=q=>{try{localStorage.setItem(recentKey,JSON.stringify([q,...readRecent().filter(x=>normalizeSearchText(x)!==normalizeSearchText(q))].slice(0,8)))}catch{}};
const el=(tag,cls='',text='')=>{const node=document.createElement(tag);node.className=cls;node.textContent=text;return node};
const typeName={movies:'Filme',series:'Série',tv:'TV',game:'Jogo'};
const normalize=v=>normalizeSearchText(String(v||''));
export function createUniversalSearch({getItems,kindFor,onOpen}){
 let dialog,field,results,heading,filterBar,more,active=[],visible=PAGE_SIZE,kind='all',last='',index=null,indexRef=null;
 const recent=()=>readRecent();
 function buildIndex(){
  const items=getItems();if(indexRef===items&&index)return;
  indexRef=items;index=[];const tokens=new Map();
  for(const item of items){
   const role=kindFor(item);if(!typeName[role])continue;
   const title=titleForDisplay(item)||item.name||'';
   const normalized=normalize(title);if(!normalized)continue;
   const row={item,role,title,normalized,year:item.catalogYear||''};
   const n=index.push(row)-1;
   for(const token of new Set(normalized.split(' ').filter(x=>x.length>=2))){
    let bucket=tokens.get(token);if(!bucket){bucket=[];tokens.set(token,bucket)}bucket.push(n);
   }
  }
  index.tokens=tokens;
 }
 function candidates(q){
  const query=normalize(q),words=query.split(' ').filter(Boolean),scores=new Map();
  for(const word of words){
   for(const [token,ids] of index.tokens){
    if(token===word||token.startsWith(word)||word.startsWith(token)){
     for(const id of ids)scores.set(id,(scores.get(id)||0)+1);
    }
   }
  }
  // Limit fuzzy comparison to likely candidates, avoiding full-catalog Levenshtein scans.
  return [...scores].sort((a,b)=>b[1]-a[1]).slice(0,MAX_CANDIDATES).map(([id])=>index[id]);
 }
 function render(){
  results.replaceChildren();filterBar.replaceChildren();
  const counts={all:active.length};
  for(const row of active)counts[row.role]=(counts[row.role]||0)+1;
  for(const [value,label] of [['all','Todos'],['movies','Filmes'],['series','Séries'],['tv','TV']]){
   const btn=el('button','lux-search-filter'+(kind===value?' is-active':''),label+' · '+(counts[value]||0));
   btn.type='button';btn.addEventListener('click',()=>{kind=value;visible=PAGE_SIZE;render()});filterBar.append(btn);
  }
  const filtered=kind==='all'?active:active.filter(x=>x.role===kind);
  heading.textContent=last?'Resultados para “'+last+'” · '+filtered.length:'Explore o catálogo';
  for(const row of filtered.slice(0,visible)){
   const btn=el('button','lux-search-result');btn.type='button';
   const poster=el('span','lux-search-poster');
   const image=row.item.catalogPoster||row.item.poster||row.item.logo||row.item.cover||row.item.stream_icon;
   if(typeof image==='string'&&/^https:\/\//.test(image)){const img=el('img');img.src=image;img.loading='lazy';img.alt='';poster.append(img)}
   const info=el('span','lux-search-result-info');info.append(el('small','',typeName[row.role]),el('strong','',row.title),el('small','',String(row.year||row.item.group||'')));
   btn.append(poster,info,el('span','lux-search-score',Math.round(row.score*100)+'%'));
   btn.addEventListener('click',()=>{dialog.close();onOpen(row.item)});results.append(btn);
  }
  more.hidden=visible>=filtered.length;
  if(!filtered.length)results.append(el('p','lux-search-empty',last?'Nenhum título com similaridade de pelo menos 70%.':'Escolha uma sugestão ou pesquise um título.'));
 }
 function run(q){
  q=String(q||'').trim().slice(0,100);if(q.length<2)return;
  buildIndex();last=q;kind='all';visible=PAGE_SIZE;field.value=q;saveRecent(q);saveTrend(q);
  const norm=normalize(q);
  active=candidates(q).map(row=>({...row,score:searchSimilarity(row.title,norm)})).filter(row=>row.score>=MIN_SCORE).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'pt-BR'));
  render();
 }
 function showDiscovery(){
  last='';active=[];kind='all';visible=PAGE_SIZE;results.replaceChildren();filterBar.replaceChildren();
  heading.textContent='Descubra algo para assistir';
  const section=el('section','lux-search-discovery');
  section.append(el('h3','','Pesquisas recentes'));
  const chips=el('div','lux-search-chips');
  for(const q of recent()){const b=el('button','',q);b.type='button';b.onclick=()=>run(q);chips.append(b)}
  if(!chips.childElementCount)chips.append(el('p','','Suas buscas aparecerão aqui.'));
  section.append(chips,el('h3','','Mais buscados neste dispositivo'));
  const trending=el('div','lux-search-chips');
  for(const row of Object.values(readTrends()).sort((a,b)=>b.count-a.count||b.at-a.at).slice(0,7)){const b=el('button','',row.title);b.type='button';b.onclick=()=>run(row.title);trending.append(b)}
  if(!trending.childElementCount)trending.append(el('p','','As tendências aparecerão após suas primeiras pesquisas.'));
  section.append(trending,el('h3','','Explorar por categoria'));
  const categories=el('div','lux-search-chips');
  for(const [value,label] of [['movies','Filmes'],['series','Séries'],['tv','TV']]){
   const b=el('button','',label);b.type='button';b.onclick=()=>{buildIndex();last='';kind=value;active=index.filter(x=>x.role===value).slice(0,48).map(x=>({...x,score:1}));render()};categories.append(b)
  }
  section.append(categories);
  const surprise=el('button','lux-search-surprise','🎲 Surpreenda-me com 50 sugestões');surprise.type='button';
  surprise.onclick=()=>{buildIndex();last='';kind='all';const safe=index.filter(x=>(x.role==='movies'||x.role==='series')&&!/adulto|xxx|porn|18\+/i.test([x.item.group,...(x.item.catalogTags||[])].join(' ')));active=[];const used=new Set();for(let i=0;i<Math.min(50,safe.length);i++){const n=Math.floor(Math.random()*safe.length);if(used.has(n)){i--;continue}used.add(n);active.push({...safe[n],score:1})}render()};
  section.append(surprise);results.append(section);more.hidden=true;
 }
 function mount(){
  if(dialog)return;
  const style=el('style');style.textContent=`
  .lux-search-dialog{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;padding:0;background:#080711;color:#eee5fb;overflow:auto;z-index:9990;font-family:inherit}
  .lux-search-dialog::backdrop{background:#080711}.lux-search-shell{max-width:1150px;margin:auto;padding:clamp(16px,4vw,44px)}
  .lux-search-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.lux-search-head h1{font-size:clamp(22px,3vw,34px);margin:0 0 6px}
  .lux-search-close,.lux-search-filter,.lux-search-chips button,.lux-search-surprise{background:#21152e;border:1px solid #57406c;border-radius:12px;color:#f4e7ff;padding:10px 14px;cursor:pointer}
  .lux-search-form{display:flex;gap:10px;margin:24px 0}.lux-search-form input{min-width:0;flex:1;background:#181121;border:1px solid #6c4b88;color:white;border-radius:12px;padding:14px;font:inherit}
  .lux-search-form button{background:#7939b8;color:white;border:0;border-radius:12px;padding:0 22px;font-weight:700;cursor:pointer}
  .lux-search-filters,.lux-search-chips{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.lux-search-filter.is-active{background:#7135a7}
  .lux-search-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:20px}
  .lux-search-result{display:flex;align-items:center;gap:12px;min-width:0;padding:10px;text-align:left;border:1px solid #443056;border-radius:14px;background:#171020;color:white;cursor:pointer}
  .lux-search-result:hover{border-color:#b78ce3}.lux-search-poster{width:56px;height:78px;flex:none;border-radius:8px;background:#30213d;overflow:hidden}
  .lux-search-poster img{width:100%;height:100%;object-fit:cover}.lux-search-result-info{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}.lux-search-result-info strong{font-size:13px;overflow:hidden;text-overflow:ellipsis}.lux-search-result-info small{color:#bba9cc}
  .lux-search-score{color:#c5a2e9;font-size:11px}.lux-search-discovery{grid-column:1/-1}.lux-search-discovery h3{margin:22px 0 8px}.lux-search-surprise{margin-top:24px}
  .lux-search-empty{grid-column:1/-1;color:#bba9cc}.lux-search-more{display:block;margin:20px auto;padding:12px 22px;background:#39204c;color:white;border:1px solid #714b90;border-radius:12px;cursor:pointer}
  .lux-search-more[hidden]{display:none}
  @media(max-width:600px){.lux-search-results{grid-template-columns:1fr}.lux-search-shell{padding:18px}.lux-search-form button{padding:0 13px}}
  `;document.head.append(style);
  dialog=el('dialog','lux-search-dialog');dialog.setAttribute('aria-label','Busca universal');
  const shell=el('div','lux-search-shell'),head=el('header','lux-search-head');
  const title=el('div');title.append(el('h1','','Buscar em todo o Lux'),el('p','','Filmes, séries e TV em uma única busca.'));
  const close=el('button','lux-search-close','Fechar ✕');close.type='button';close.onclick=()=>dialog.close();head.append(title,close);
  const form=el('form','lux-search-form');field=el('input');field.type='search';field.placeholder='O que você quer assistir?';field.autocomplete='off';field.setAttribute('aria-label','Buscar títulos');
  const submit=el('button','','Buscar');submit.type='submit';form.append(field,submit);form.onsubmit=e=>{e.preventDefault();run(field.value)};
  filterBar=el('div','lux-search-filters');heading=el('h2');results=el('div','lux-search-results');more=el('button','lux-search-more','Mostrar mais');more.type='button';more.onclick=()=>{visible+=PAGE_SIZE;render()};
  shell.append(head,form,filterBar,heading,results,more);dialog.append(shell);document.body.append(dialog);
 }
 return {open(q=''){mount();dialog.showModal();if(q.trim())run(q);else{field.value='';showDiscovery()}field.focus()},invalidate(){index=null;indexRef=null}};
}

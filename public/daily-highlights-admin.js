import {cleanHighlights,highlightImage} from './daily-highlights-model.js';
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
/** Dentro do dialog Admin existente: prévia primeiro, uma confirmação explícita para publicar. */
export function mountHighlightsAdmin({actions,before,status}){
 const open=node('button','Publicar destaques');open.type='button';actions.insertBefore(open,actions.lastChild);
 const panel=node('section');panel.className='lux-daily-preview';panel.hidden=true;panel.setAttribute('aria-label','Prévia dos destaques do dia');
 const heading=node('h3','Destaques do dia');heading.tabIndex=-1;
 const note=node('p'),grid=node('div');grid.className='lux-daily-columns';
 const controls=node('div');controls.className='lux-daily-actions';
 const publish=node('button','Confirmar publicação'),cancel=node('button','Fechar prévia');publish.type=cancel.type='button';publish.className='lux-vod-primary';publish.disabled=true;controls.append(publish,cancel);panel.append(heading,note,grid,controls);before.before(panel);
 let draft=null,busy=false;
 async function api(body){const response=await fetch('/api/editorial/daily-highlights',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Destaques indisponíveis.');return data;}
 open.addEventListener('click',async()=>{
  if(busy)return;busy=true;open.disabled=true;panel.hidden=false;publish.disabled=true;draft=null;grid.replaceChildren();heading.focus();note.textContent='Conferindo as tendências com o catálogo…';
  try{
   draft=cleanHighlights((await api({action:'prepare'})).draft);
   note.textContent='Seleção de '+draft.day.split('-').reverse().join('/')+'. Somente títulos confirmados no catálogo. A confirmação atualiza as fileiras e o hero do início.';
   for(const [role,label]of [['movies','Filmes'],['series','Séries']]){
    const column=node('div');column.append(node('h4',label+' · '+draft[role].length+'/6'));
    if(!draft[role].length)column.append(node('p','Nenhuma tendência confirmada nesta categoria.'));
    for(const row of draft[role]){const item=node('div');item.className='lux-daily-item';if(highlightImage(row.poster)){const image=node('img');image.src=row.poster;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';item.append(image);}item.append(node('span',row.title+(row.year?' · '+row.year:'')));column.append(item);}grid.append(column);
   }
   publish.disabled=!(draft.movies.length+draft.series.length);
  }catch(error){note.textContent=error.message;}finally{busy=false;open.disabled=false;}
 });
 cancel.addEventListener('click',()=>{if(busy)return;panel.hidden=true;open.focus();});
 publish.addEventListener('click',async()=>{
  if(busy||!draft)return;busy=true;publish.disabled=open.disabled=cancel.disabled=true;note.textContent='Publicando destaques…';
  try{const {selection}=await api({action:'publish',id:draft.id});window.dispatchEvent(new CustomEvent('lux-daily-highlights-published',{detail:selection}));panel.hidden=true;status.textContent='Destaques publicados nas fileiras e no hero do início.';open.focus();}
  catch(error){note.textContent=error.message;publish.disabled=false;}finally{busy=false;open.disabled=cancel.disabled=false;}
 });
}

import {uniqueVod} from './vod-model.js';
const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
const array=value=>{try{return JSON.parse(value||'[]')}catch{return []}};
export async function mountVodAdmin({getItems=()=>[]}={}){
 if(new URL(location.href).searchParams.get('guest')==='1')return;
 const session=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
 if(!session?.authenticated||session.role!=='admin')return;
 const anchor=document.querySelector('#open-admin');if(!anchor)return;
 const launcher=element('button','lux-vod-launch','Admin');launcher.type='button';launcher.setAttribute('aria-label','Abrir administração do catálogo');anchor.after(launcher);
 const modal=element('dialog','lux-vod-admin');modal.setAttribute('aria-labelledby','lux-vod-admin-title');
 const header=element('header','lux-vod-admin-header'),heading=element('div');heading.append(element('span','lux-vod-kicker','ADMINISTRAÇÃO · LUX ZERO'));const title=element('h2','','Seu catálogo, do seu jeito');title.id='lux-vod-admin-title';heading.append(title);
 const close=element('button','lux-vod-close','Fechar ✕');close.type='button';header.append(heading,close);
 const actions=element('div','lux-vod-toolbar'),sync=element('button','lux-vod-primary','Atualizar conteúdo geral');sync.type='button';
 const summary=element('span','lux-vod-summary','Carregando resumo…');actions.append(sync,summary);
 const status=element('p','lux-vod-status','Atualiza as fontes, importa filmes e séries e classifica somente o que ainda está pendente.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=element('p','lux-vod-note','TV não entra nesta etapa. Tags e coleções editadas por você são preservadas. A classificação continua em lotes; você pode fechar este painel.');
 const filters=element('form','lux-vod-filters'),type=element('select');type.setAttribute('aria-label','Tabela do catálogo');
 for(const [value,label]of [['filmes','Filmes'],['series','Séries']]){const option=element('option','',label);option.value=value;type.append(option)}
 const search=element('input');search.type='search';search.placeholder='Buscar pelo início do título';search.setAttribute('aria-label','Buscar título na tabela');
 const find=element('button','','Buscar');find.type='submit';filters.append(type,search,find);
 const layout=element('div','lux-vod-layout'),tableWrap=element('div','lux-vod-table-wrap'),table=element('table','lux-vod-table'),thead=element('thead'),tr=element('tr');
 for(const text of ['Título','Ano','ID fornecedor','TMDB','Classificação','']){const th=element('th','',text);th.scope='col';tr.append(th);}thead.append(tr);const tbody=element('tbody');table.append(thead,tbody);tableWrap.append(table);
 const editor=element('form','lux-vod-editor');editor.hidden=true;editor.append(element('h3','','Editar título'));
 const inputs={};for(const [key,label,inputType]of [['titulo','Título de apresentação','text'],['ano','Ano','number'],['id_provedor','ID do fornecedor (representante)','text'],['tmdb_id','ID do TMDB','number'],['generos','Gêneros (separados por vírgula)','text'],['tags','Suas tags (separadas por vírgula)','text'],['colecoes','Suas coleções (separadas por vírgula)','text']]){
  const wrap=element('label','',label),input=element('input');input.type=inputType;input.name=key;wrap.append(input);editor.append(wrap);inputs[key]=input;
 }
 const original=element('p','lux-vod-note'),save=element('button','lux-vod-primary','Salvar alterações');save.type='submit';editor.append(original,save,element('p','lux-vod-note','Salvar marca o registro como manual. A rotina automática não sobrescreve essa classificação. Alterar IDs aqui não muda o endereço de reprodução da playlist.'));layout.append(tableWrap,editor);
 const pages=element('div','lux-vod-pages'),previous=element('button','','‹ Anterior'),next=element('button','','Próxima ›'),pageText=element('span');previous.type=next.type='button';pages.append(previous,pageText,next);
 modal.append(header,actions,status,note,filters,layout,pages);document.body.append(modal);
 let page=1,selected=null,viewGeneration=0,running=false,closed=false;
 async function api(body,query=''){
  const response=await fetch('/api/admin/vod'+query,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Não foi possível acessar o catálogo.');return data;
 }
 async function totals(){const data=await api();summary.textContent=`${data.filmes.total.toLocaleString('pt-BR')} filmes · ${data.series.total.toLocaleString('pt-BR')} séries · ${((data.filmes.classificados||0)+(data.series.classificados||0)).toLocaleString('pt-BR')} classificados`;return data;}
 async function load(){
  const epoch=++viewGeneration;status.textContent='Consultando a tabela…';
  try{const data=await api(null,'?'+new URLSearchParams({view:'rows',tipo:type.value,page:String(page),q:search.value}));if(epoch!==viewGeneration)return;
   tbody.replaceChildren();for(const row of data.rows){const line=element('tr');for(const value of [row.titulo,row.ano||'—',row.id_provedor||'Não informado',row.tmdb_id||'—',array(row.generos).concat(array(row.tags)).join(' · ')||row.status_metadados])line.append(element('td','',String(value)));
    const cell=element('td'),edit=element('button','','Editar');edit.type='button';edit.setAttribute('aria-label','Editar '+row.titulo);edit.addEventListener('click',()=>{selected={...row,tipo:type.value};editor.hidden=false;for(const key of Object.keys(inputs))inputs[key].value=['generos','tags','colecoes'].includes(key)?array(row[key]).join(', '):row[key]??'';original.textContent='Original: '+(row.nome_original||row.titulo)+' · Fornecedor: '+(row.fornecedor||'não informado');inputs.titulo.focus()});cell.append(edit);line.append(cell);tbody.append(line);
   }
   if(!data.rows.length){const line=element('tr'),cell=element('td','','Nenhum título encontrado.');cell.colSpan=6;line.append(cell);tbody.append(line)}
   previous.disabled=page<=1;next.disabled=page*40>=data.total;pageText.textContent=`Página ${page} · ${data.total.toLocaleString('pt-BR')} registros`;if(!running)status.textContent='Escolha um título para editar.';
  }catch(error){status.textContent=error.message;}
 }
 function hide(){closed=true;modal.close();launcher.focus()}
 close.addEventListener('click',hide);modal.addEventListener('cancel',event=>{event.preventDefault();hide()});
 launcher.addEventListener('click',()=>{closed=false;modal.showModal();void totals().then(load).catch(error=>{status.textContent=error.message})});
 filters.addEventListener('submit',event=>{event.preventDefault();page=1;void load()});type.addEventListener('change',()=>{page=1;selected=null;editor.hidden=true;void load()});previous.addEventListener('click',()=>{page--;void load()});next.addEventListener('click',()=>{page++;void load()});
 editor.addEventListener('submit',async event=>{event.preventDefault();if(!selected)return;save.disabled=true;try{const data={action:'edit',tipo:selected.tipo,id:selected.id};for(const [key,input]of Object.entries(inputs))data[key]=['generos','tags','colecoes'].includes(key)?input.value.split(',').map(s=>s.trim()).filter(Boolean):input.value;await api(data);await totals();await load();status.textContent='Alterações salvas. Sua classificação manual será preservada.';}catch(error){status.textContent=error.message;}finally{save.disabled=false}});
 sync.addEventListener('click',async()=>{
  if(running)return;running=true;sync.disabled=true;closed=false;
  try{
   const initial=await totals();let failures=0;
   const items=getItems();
   if(!items.length&&!initial.sources.length)throw Error('Abra sua lista neste navegador ou conecte uma fonte HTTPS no R2 antes de atualizar.');
   if(items.length){
    let imported=0;const seen=new Set();
    for(let offset=0;offset<items.length&&!closed;offset+=400){
     const batch=uniqueVod(items.slice(offset,offset+400));const records=[...batch.filmes,...batch.series].filter(row=>{const key=row.tipo+'|'+row.id+'|'+(row.id_provedor||'')+'|'+row.tags_fonte.join(',');if(seen.has(key))return false;seen.add(key);return true});
     for(let index=0;index<records.length;index+=60){await api({action:'seed',rows:records.slice(index,index+60)});imported+=Math.min(60,records.length-index);}
     status.textContent=`Importando a lista aberta… ${imported.toLocaleString('pt-BR')} títulos únicos.`;await new Promise(resolve=>setTimeout(resolve,0));
    }
   }
   for(let i=0;i<initial.sources.length&&!closed;i++){
    status.textContent=`Atualizando fonte ${i+1} de ${initial.sources.length}…`;
    try{await api({action:'refresh',catalogId:initial.sources[i].catalog_id})}catch{failures++}
   }
   await api({action:'start'});let rounds=0;
   while(!closed){const result=await api({action:'step'});rounds++;status.textContent=`Importando filmes e séries… ${Number(result.count||0).toLocaleString('pt-BR')} entradas lidas nesta fonte.`;if(result.status==='idle')break;if(rounds%20===0)await totals();await new Promise(resolve=>setTimeout(resolve,120));}
   // O primeiro preenchimento pode ser grande; o cron retoma após fechar o painel.
   let attempts=0;
   while(!closed){status.textContent=`Classificando títulos pendentes… ${attempts.toLocaleString('pt-BR')} consultas neste processamento. Registros com tags são ignorados.`;const result=await api({action:'enrich'});attempts+=result.attempts||0;if(result.paused||result.pending||!result.attempts)break;if(attempts%20===0)await totals();await new Promise(resolve=>setTimeout(resolve,120));}
   await totals();if(!closed)await load();status.textContent=closed?'Atualização pausada neste painel; os lotes já iniciados ficam salvos para a rotina automática.':failures?`${failures} fonte(s) não atualizaram. As cópias anteriores foram mantidas; a classificação pendente continua em lotes.`:'Importação concluída. Títulos novos serão classificados em lotes; os já classificados foram preservados.';
  }catch(error){status.textContent=error.message;}finally{running=false;sync.disabled=false;}
 });
}

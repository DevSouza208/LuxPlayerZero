import {setIconLabel} from './lux-icons.js';
import {scanVod,remainingTime} from './vod-progress.js';
const element=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
const array=value=>{try{return JSON.parse(value||'[]')}catch{return []}};
export async function mountVodAdmin({getItems=()=>[]}={}){
 if(new URL(location.href).searchParams.get('guest')==='1')return;
 const session=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
 if(!session?.authenticated||session.role!=='admin')return;
 const anchor=document.querySelector('#open-admin');if(!anchor)return;
 const launcher=element('button','lux-vod-launch','Admin');launcher.type='button';setIconLabel(launcher,'shield','Admin');launcher.setAttribute('aria-label','Abrir administração do catálogo');anchor.after(launcher);
 const modal=element('dialog','lux-vod-admin');modal.setAttribute('aria-labelledby','lux-vod-admin-title');
 const header=element('header','lux-vod-admin-header'),heading=element('div');heading.append(element('span','lux-vod-kicker','ADMINISTRAÇÃO · LUX ZERO'));const title=element('h2','','Seu catálogo, do seu jeito');title.id='lux-vod-admin-title';heading.append(title);
 const close=element('button','lux-vod-close','Fechar ✕');close.type='button';setIconLabel(close,'x','Fechar');header.append(heading,close);
 const actions=element('div','lux-vod-toolbar'),sync=element('button','lux-vod-primary','Atualizar');sync.type='button';setIconLabel(sync,'refresh-cw','Atualizar');
 const summary=element('span','lux-vod-summary','Carregando resumo…');const scan=element('button','','Scan rápido'),rebuild=element('button','lux-vod-danger','Reconstruir catálogo');scan.type=rebuild.type='button';const metadataOnly=element('button','','Preencher metadados TMDB');metadataOnly.type='button';actions.append(sync,scan,metadataOnly,rebuild,summary);
 const status=element('p','lux-vod-status','Atualiza as fontes, importa filmes e séries e classifica somente o que ainda está pendente.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=element('p','lux-vod-note','TV não entra nesta etapa. Tags e coleções editadas por você são preservadas. A lista aberta precisa deste painel até o envio terminar. Fontes no servidor e classificação são retomadas pela rotina automática.');
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
 const original=element('p','lux-vod-note'),save=element('button','lux-vod-primary','Salvar alterações');save.type='submit';setIconLabel(save,'save','Salvar alterações');editor.append(original,save,element('p','lux-vod-note','Salvar marca o registro como manual. A rotina automática não sobrescreve essa classificação. Alterar IDs aqui não muda o endereço de reprodução da playlist.'));layout.append(tableWrap,editor);
 const pages=element('div','lux-vod-pages'),previous=element('button','','‹ Anterior'),next=element('button','','Próxima ›'),pageText=element('span');previous.type=next.type='button';setIconLabel(previous,'chevron-left','Anterior');setIconLabel(next,'chevron-right','Próxima');pages.append(previous,pageText,next);
 const progress=element('progress','lux-vod-progress');progress.max=100;progress.value=0;progress.hidden=true;progress.setAttribute('aria-label','Progresso da etapa atual');modal.append(header,actions,status,progress,note,filters,layout,pages);document.body.append(modal);
 let page=1,selected=null,viewGeneration=0,running=false,closed=false;
 const busy=value=>{running=value;sync.disabled=scan.disabled=rebuild.disabled=metadataOnly.disabled=value};
 function showProgress(done,total,label,started){progress.hidden=false;progress.value=total?Math.min(100,done/total*100):0;status.textContent=`${label}: ${done.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} · ${Math.round(progress.value)}% · ${remainingTime(done,total,performance.now()-started)}`;}
 async function prepareScan(){const items=getItems();if(!items.length)throw Error('Abra a lista neste navegador para contar os títulos únicos.');const started=performance.now();const result=await scanVod(items,{cancelled:()=>closed,onProgress:(done,total)=>showProgress(done,total,'Lendo lista',started)});return result;}
 async function api(body,query=''){
  const response=await fetch('/api/admin/vod'+query,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(45000),...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({}));if(!response.ok){const error=Error(data.error||'Não foi possível acessar o catálogo.');error.code=data.code;error.stage=data.stage;error.reference=data.reference;throw error;}return data;
 }
 async function totals(){const data=await api();summary.textContent=`${data.filmes.total.toLocaleString('pt-BR')} filmes · ${data.series.total.toLocaleString('pt-BR')} séries · ${((data.filmes.classificados||0)+(data.series.classificados||0)).toLocaleString('pt-BR')} classificados`;if(!data.tmdb?.configured)note.textContent='TMDB sem configuração neste servidor. É necessário TMDB_API_KEY também no Worker de manutenção. A lista aberta precisa deste painel até o envio terminar.';else if(data.tmdb.last?.reason)note.textContent=data.tmdb.last.reason;return data;}
 async function load(){
  const epoch=++viewGeneration;status.textContent='Consultando a tabela…';
  try{const data=await api(null,'?'+new URLSearchParams({view:'rows',tipo:type.value,page:String(page),q:search.value}));if(epoch!==viewGeneration)return;
   tbody.replaceChildren();for(const row of data.rows){const line=element('tr');for(const value of [row.titulo,row.ano||'—',row.id_provedor||'Não informado',row.tmdb_id||'—',array(row.generos).concat(array(row.tags)).join(' · ')||row.status_metadados])line.append(element('td','',String(value)));
    const cell=element('td'),edit=element('button','','Editar');edit.type='button';setIconLabel(edit,'edit-2','Editar');edit.setAttribute('aria-label','Editar '+row.titulo);edit.addEventListener('click',()=>{selected={...row,tipo:type.value};editor.hidden=false;for(const key of Object.keys(inputs))inputs[key].value=['generos','tags','colecoes'].includes(key)?array(row[key]).join(', '):row[key]??'';original.textContent='Original: '+(row.nome_original||row.titulo)+' · Fornecedor: '+(row.fornecedor||'não informado');inputs.titulo.focus()});cell.append(edit);line.append(cell);tbody.append(line);
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
 async function update({reset=false}={}){
  if(running)return;busy(true);closed=false;let phase='scan';
  try{
   const initial=await totals(),items=getItems();
   if(!items.length&&!initial.sources.length)throw Error('Abra sua lista neste navegador ou conecte uma fonte HTTPS no R2 antes de atualizar.');
   // O scan termina antes de qualquer exclusão, inclusive na reconstrução.
   const scanned=items.length?await prepareScan():null;
   if(closed)return;
   if(reset){
    if(!confirm('Reconstruir o catálogo? Todos os filmes, séries, vínculos e edições manuais do catálogo serão apagados. Contas e configurações serão preservadas.')){status.textContent='Reconstrução cancelada. Nenhum dado foi apagado.';return;}
    await api({action:'rebuild',confirmation:'RECONSTRUIR CATALOGO'});selected=null;editor.hidden=true;page=1;
   }
   phase='envio';
   if(scanned){
    const records=[...scanned.filmes,...scanned.series],started=performance.now();let sent=0;
    for(let index=0;index<records.length&&!closed;index+=60){
     await api({action:'seed',rows:records.slice(index,index+60)});sent+=Math.min(60,records.length-index);
     showProgress(sent,records.length,'Títulos conferidos e enviados',started);
     if(index%600===0)await totals();
    }
    if(closed){status.textContent='Envio interrompido ao fechar o painel. Os lotes enviados estão salvos; clique Atualizar para conferir e enviar o restante.';return;}
   }
   phase='servidor';progress.hidden=true;let failures=0;
   for(let i=0;i<initial.sources.length&&!closed;i++){
    status.textContent=`Atualizando fonte ${i+1} de ${initial.sources.length}…`;
    try{await api({action:'refresh',catalogId:initial.sources[i].catalog_id})}catch{failures++}
   }
   await api({action:'start'});let rounds=0;const started=performance.now();let baseline=null;
   while(!closed){
    const result=await api({action:'step'});rounds++;
    const current=await totals();const done=current.progress?.read||0,total=current.progress?.total||0;
    if(baseline===null)baseline=done;
    showProgress(done,total,'Leitura das fontes no servidor',started);
    // ETA usa apenas o trabalho desta sessão, sem contar o checkpoint anterior.
    status.textContent=status.textContent.replace(/ · (?:~.*|calculando tempo…)$/,` · ${remainingTime(done-baseline,total-baseline,performance.now()-started)}`);
    if(rounds%5===0)await api({action:'enrich'});
    if(result.status==='idle'){if(current.jobs.some(job=>job.status==='failed'))throw Error('Uma fonte falhou. Os lotes anteriores foram preservados; use Atualizar para retomar.');break;}
    await new Promise(resolve=>setTimeout(resolve,120));
   }
   phase='metadados';progress.hidden=true;let attempts=0,reason='';
   while(!closed){
    status.textContent=`Importação concluída. Classificando pendentes no TMDB… ${attempts.toLocaleString('pt-BR')} consultas nesta sessão.`;
    const result=await api({action:'enrich'});attempts+=result.attempts||0;
    if(result.reason)reason=result.reason;
    if(result.paused||result.pending||result.busy||!result.attempts)break;
    if(attempts%20===0)await totals();await new Promise(resolve=>setTimeout(resolve,120));
   }
   await totals();if(!closed)await load();
   status.textContent=closed?'Lotes enviados estão salvos. A rotina automática pode retomar as fontes no servidor e a classificação.':reason|| (failures?`${failures} fonte(s) não atualizaram. As cópias anteriores foram mantidas.`:'Importação concluída. Registros e classificações existentes foram preservados.');
  }catch(error){status.textContent=`${error.message} (Etapa: ${error.stage||phase}${error.reference?' · referência '+error.reference:''}.)`;}finally{busy(false);progress.hidden=true;}
 }
 metadataOnly.addEventListener('click',async()=>{
  if(running)return;busy(true);closed=false;progress.hidden=true;let attempts=0,matched=0;
  try{
   let reason='';
   while(!closed){
    status.textContent=`Preenchendo metadados TMDB… ${attempts.toLocaleString('pt-BR')} títulos consultados · ${matched.toLocaleString('pt-BR')} preenchidos nesta sessão.`;
    const result=await api({action:'enrich'});attempts+=result.attempts||0;matched+=result.matched||0;
    if(result.reason)reason=result.reason;
    if(result.paused||result.pending||result.busy||!result.attempts){if(result.busy)reason='Já existe uma classificação em andamento. Aguarde o lote atual.';break;}
    if(attempts%20===0)await totals();await new Promise(resolve=>setTimeout(resolve,120));
   }
   await totals();if(!closed)await load();
   status.textContent=reason||(closed?'Classificação interrompida neste painel. Resultados já gravados foram preservados.':`Metadados TMDB: ${matched.toLocaleString('pt-BR')} títulos preenchidos em ${attempts.toLocaleString('pt-BR')} consultas. Títulos já classificados e edições manuais foram preservados.`);
  }catch(error){status.textContent=error.message+(error.reference?' Referência: '+error.reference:'');}finally{busy(false);}
 });
 sync.addEventListener('click',()=>void update());
 rebuild.addEventListener('click',()=>void update({reset:true}));
 scan.addEventListener('click',async()=>{if(running)return;busy(true);closed=false;try{const result=await prepareScan();status.textContent=`Scan concluído: ${result.filmes.length.toLocaleString('pt-BR')} filmes · ${result.series.length.toLocaleString('pt-BR')} séries únicas. Nenhuma gravação realizada. A estimativa de tempo aparece durante o envio.`;}catch(error){status.textContent=error.message;}finally{busy(false);progress.hidden=true;}});
}

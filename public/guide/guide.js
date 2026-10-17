import {parseXmltv} from '/guide-model.js';
const $=id=>document.getElementById(id),date=new Date(),shown=new Set();let reminders=[];
const localDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
$('date').value=localDate(date);$('channel').value=new URL(location.href).searchParams.get('channel')||'';
const status=(text,error=false)=>{$('feedback').textContent=text;$('feedback').dataset.error=String(error)};
async function api(path,body){const r=await fetch('/api/editorial/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Programação indisponível.');return data}
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n}
function row(title,description){const d=node('article','');d.className='row';const info=node('div','');info.append(node('strong',title),node('p',description));d.append(info);return d}
const clock=time=>new Date(time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
async function refresh(){
 const start=new Date($('date').value+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
 if(!Number.isFinite(+start))throw Error('Escolha uma data válida.');
 const bounds='from='+Number(start)+'&to='+Number(end);
 const [guide,sports,saved]=await Promise.all([api('guide?'+bounds+'&channel='+encodeURIComponent($('channel').value)+'&q='+encodeURIComponent($('query').value)),api('sports?'+bounds),api('reminders?'+bounds)]);
 $('programs').replaceChildren();
 for(const p of guide.programs){const current=p.start<=Date.now()&&p.end>Date.now();const d=row((current?'Agora · ':'')+p.title,clock(p.start)+'–'+clock(p.end)+' · '+p.channel+' · '+p.description);
  if(current){const progress=document.createElement('progress');progress.max=p.end-p.start;progress.value=Date.now()-p.start;progress.setAttribute('aria-label','Progresso do programa');d.firstChild.append(progress)}
  if(p.start>Date.now()){const b=node('button','Lembrar');b.onclick=async()=>{try{await api('reminders',{id:p.id});await refresh();status('Lembrete salvo no perfil.')}catch(e){status(e.message,true)}};d.append(b)}$('programs').append(d)}
 if(!guide.programs.length)$('programs').append(node('p','Sem programação disponível para esta seleção.'));
 if(guide.truncated)$('programs').append(node('p','Há mais de 500 programas. Escolha um canal ou refine a busca.'));
 $('sports').replaceChildren();for(const e of sports.events){const d=row(e.title,clock(e.starts_at)+' · '+e.sport+' · '+e.competition+' · '+(e.channels.length?e.channels.join(', '):'Transmissão não informada'));const a=node('a','Consultar fonte');a.href=e.source_url;a.target='_blank';a.rel='noopener noreferrer';d.append(a);$('sports').append(d)}
 if(!sports.events.length)$('sports').append(node('p','Nenhum evento confirmado cadastrado para este dia.'));
 reminders=saved.reminders;$('reminders').replaceChildren();for(const r of reminders){const d=row(r.title,clock(r.start)+' · '+r.channel),b=node('button','Remover');b.onclick=async()=>{try{await api('reminders',{id:r.id,remove:true});await refresh()}catch(e){status(e.message,true)}};d.append(b);$('reminders').append(d)}
 if(!reminders.length)$('reminders').append(node('p','Nenhum lembrete para este dia.'));
}
$('filters').onsubmit=e=>{e.preventDefault();refresh().catch(e=>status(e.message,true))};
$('xml-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;let imported=0;try{const file=$('xml').files[0];if(!file||file.size>16*1024*1024)throw Error('Escolha XMLTV de até 16 MB.');const parsed=parseXmltv(await file.text());for(let i=0;i<parsed.programs.length;i+=80){await api('guide',{programs:parsed.programs.slice(i,i+80)});imported+=Math.min(80,parsed.programs.length-i);$('import-status').textContent=imported+' programas salvos.'}status(imported+' programas importados. '+parsed.skipped+' registros sem horário/ID válido ignorados.');await refresh()}catch(error){status(error.message+' '+imported+' programas já foram salvos; é seguro reenviar o arquivo.',true)}finally{e.submitter.disabled=false}};
$('sports-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));data.start=+new Date(data.start);data.channels=data.channels.split(',').map(s=>s.trim()).filter(Boolean);data.transmissionConfirmed=data.transmissionConfirmed==='on';await api('sports',data);status('Evento salvo.');await refresh()}catch(error){status(error.message,true)}finally{e.submitter.disabled=false}};
setInterval(()=>{for(const reminder of reminders)if(reminder.start<=Date.now()&&reminder.start>Date.now()-60000&&!shown.has(reminder.id)){shown.add(reminder.id);status('Começando: '+reminder.title+' · '+reminder.channel)}},15000);
try{const r=await fetch('/api/account/session',{credentials:'same-origin',cache:'no-store'}),data=await r.json();if(!data.authenticated)location.replace('/');$('admin').hidden=data.role!=='admin';await refresh()}catch(e){status(e.message,true)}

import {savedSnapshot} from '/saved-catalog.js';
const $=id=>document.getElementById(id),avatars={luxite:'',violet:'◈',moon:'☾',star:'☆'};
function askPin(manage=false){
 const dialog=$('pin-dialog'),form=$('pin-form');form.reset();$('pin-password-label').hidden=!manage;
 $('pin-title').textContent=manage?'Definir PIN (vazio para remover)':'Digite o PIN do perfil';
 return new Promise(resolve=>{
  const finish=value=>{dialog.close();resolve(value)};
  form.onsubmit=event=>{event.preventDefault();finish(Object.fromEntries(new FormData(form)))};
  $('pin-cancel').onclick=()=>finish(null);dialog.oncancel=event=>{event.preventDefault();finish(null)};
  dialog.showModal();form.elements[manage?'password':'pin'].focus();
 });
}
function status(message,error=false){$('feedback').textContent=message;$('feedback').dataset.error=String(error)}
async function api(path,body){
 const r=await fetch('/api/account/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok){if(r.status===401)location.replace('/');throw Error(data.error||'Não foi possível concluir.')}return data;
}
function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>run(b,action);return b}
async function run(button,action){button.disabled=true;try{await action()}catch(e){status(e.message,true)}finally{button.disabled=false}}
function row(text,action){const d=document.createElement('div');d.className='row';const s=document.createElement('span');s.textContent=text;d.append(s);if(action)d.append(action);return d}
async function profiles(){
 const data=await api('profiles');$('profiles').replaceChildren();$('profiles').setAttribute('aria-busy','false');
 if(!data.profiles.length)$('profiles').append(row('Crie seu primeiro perfil para começar.'));
 for(const p of data.profiles){
  const card=document.createElement('div');card.className='profile';card.dataset.default=String(Boolean(p.is_default));
  const choose=button(p.name,async()=>{const answer=p.protected?await askPin():{};if(answer===null)return;await api('profile/select',{id:p.id,pin:answer.pin});location.assign('/cinema/')});
  if(p.avatar==='luxite'){const img=document.createElement('img');img.src='/assets/luxite.png';img.alt='';choose.prepend(img)}
  else{const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=avatars[p.avatar]||'◈';choose.prepend(avatar)}
  card.append(choose,button('Editar',()=>{$('profile-id').value=p.id;$('profile-name').value=p.name;$('profile-avatar').value=p.avatar;$('profile-form').closest('details').open=true;$('profile-name').focus()}),
   button('PIN',async()=>{const answer=await askPin(true);if(!answer)return;await api('profile/pin',{id:p.id,...answer});await profiles();status('Proteção do perfil atualizada.')}),
   button('Excluir',async()=>{if(!confirm('Excluir o perfil '+p.name+' e seu histórico?'))return;await api('profile/delete',{id:p.id});await profiles()}));
  card.append(button(p.is_default?'Remover padrão':'Usar como padrão',async()=>{
   await api('profile/default',{id:p.is_default?null:p.id});await profiles();status(p.is_default?'Escolha de perfil será exibida ao entrar.':'Perfil padrão salvo. Se houver PIN, ele continuará sendo solicitado.');
  }));
  if(p.is_default){const badge=document.createElement('p');badge.className='default-badge';badge.textContent='Seu perfil padrão';card.append(badge);}
  $('profiles').append(card);
 }
}
async function devices(){const data=await api('devices');$('devices').replaceChildren(...data.devices.map(d=>row((d.id===data.current?'Este dispositivo · ':'')+d.device,button('Encerrar',async()=>{await api('revoke',{id:d.id});if(d.id===data.current)location.replace('/');else await devices()}))))}
async function admin(){const data=await api('admin');$('users').replaceChildren(...data.users.map(u=>row(u.username+' · '+u.role+(u.disabled?' · desativada':''),u.role==='user'?button(u.disabled?'Reativar':'Desativar',async()=>{await api('disable',{id:u.id,disabled:!u.disabled});await admin()}):null)));
 $('audit').replaceChildren(...data.events.map(e=>row(new Date(e.created_at).toLocaleString('pt-BR')+' · '+e.action)));}
$('profile-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await api('profiles',{id:$('profile-id').value||undefined,name:$('profile-name').value,avatar:$('profile-avatar').value});$('profile-form').reset();$('profile-id').value='';await profiles();status('Perfil salvo.')})};
$('profile-cancel').onclick=()=>{$('profile-form').reset();$('profile-id').value=''};
$('logout').onclick=()=>run($('logout'),async()=>{await api('logout',{});location.replace('/')});
$('revoke-all').onclick=()=>run($('revoke-all'),async()=>{await api('revoke',{all:true});location.replace('/')});
$('password-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await api('password',Object.fromEntries(new FormData(e.target)));location.replace('/')})};
$('invite').onclick=()=>run($('invite'),async()=>{const data=await api('invite',{});$('invite-result').hidden=false;$('invite-token').value=data.token;status('Convite criado. Compartilhe-o somente com a pessoa convidada.');await admin()});
try{const data=await api('session');if(!data.authenticated)location.replace('/');else{$('identity').textContent='Olá, '+data.username;await Promise.all([profiles(),devices()]);if(data.role==='admin'){$('admin').hidden=false;await admin()}}}catch(e){status(e.message,true)}

$('mfa-form').onsubmit=e=>{e.preventDefault();const action=e.submitter.value;run(e.submitter,async()=>{const data=await api('mfa',{...Object.fromEntries(new FormData(e.target)),action});$('mfa-result').textContent=data.secret?'Adicione esta chave ao seu autenticador e confirme o código: '+data.secret:'2FA ativado. Guarde estes códigos de recuperação em local seguro (cada um funciona uma vez): '+data.recovery.join(' · ');if(data.enabled)e.target.reset()})};

$('catalog-id').value=savedSnapshot()||'';
let indexing=false,generation=null;
$('index-cancel').onclick=()=>{indexing=false};
$('index-form').onsubmit=async event=>{
 event.preventDefault();if(indexing)return;indexing=true;event.submitter.disabled=true;
 try{
  do{
   const response=await fetch('/api/catalog/search',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(generation?{generation}:{catalogId:$('catalog-id').value})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Indexação indisponível.');
   generation=data.generation;$('index-status').textContent=data.count+' entradas indexadas · '+(data.status==='ready'?'Concluído':'Em construção');
   if(data.status==='ready'){indexing=false;generation=null;break;}
  }while(indexing);
 }catch(error){status(error.message,true)}finally{indexing=false;event.submitter.disabled=false}
};

$('diagnostics-refresh').onclick=()=>run($('diagnostics-refresh'),async()=>{
 const result=$('diagnostics-result');result.textContent='Verificando…';
 try{
  const data=await api('diagnostics'),nodes=[];
  const labels={catalog:'Catálogo',guide:'Guia e esportes',search:'Índice de busca',details:'Detalhes TMDB',defaults:'Perfil padrão'};
  nodes.push(row('D1 respondeu · '+data.database.queryMs+' ms nesta consulta'));
  nodes.push(row('R2: '+(data.r2.configured?'configurado; acesso ao objeto não testado':'não configurado')));
  nodes.push(row('TMDB: '+(data.tmdb.configured?'chave configurada; provedor não consultado':'não configurado')));
  nodes.push(row(data.accounts.active+' contas ativas · '+data.accounts.profiles+' perfis · '+data.accounts.sessions+' sessões válidas'));
  for(const [key,value] of Object.entries(data.modules))nodes.push(row((labels[key]||key)+': '+(value==='ready'?'tabelas disponíveis':'migração pendente')));
  nodes.push(row(data.catalogCount+' snapshots registrados. Exibindo os 25 mais recentes.'));
  data.catalogs.forEach((source,i)=>nodes.push(row('Catálogo '+(i+1)+' · '+source.items+' entradas · '+(source.bytes/1048576).toFixed(1)+' MB · '+(source.syncedAt?new Date(source.syncedAt).toLocaleString('pt-BR'):'data indisponível'))));
  for(const job of data.search)nodes.push(row('Índices '+({building:'em construção',ready:'prontos',failed:'com falha'}[job.status]||job.status)+': '+job.total));
  result.replaceChildren(...nodes);
 }catch(error){result.textContent='Não foi possível verificar os serviços.';throw error}
});

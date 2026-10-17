const $=id=>document.getElementById(id),avatars={luxite:'',violet:'◈',moon:'☾',star:'☆'};
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
  const card=document.createElement('div');card.className='profile';
  const choose=button(p.name,async()=>{await api('profile/select',{id:p.id});location.assign('/cinema/')});
  if(p.avatar==='luxite'){const img=document.createElement('img');img.src='/assets/luxite.png';img.alt='';choose.prepend(img)}
  else{const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=avatars[p.avatar]||'◈';choose.prepend(avatar)}
  card.append(choose,button('Editar',()=>{$('profile-id').value=p.id;$('profile-name').value=p.name;$('profile-avatar').value=p.avatar;$('profile-form').closest('details').open=true;$('profile-name').focus()}),
   button('Excluir',async()=>{if(!confirm('Excluir o perfil '+p.name+' e seu histórico?'))return;await api('profile/delete',{id:p.id});await profiles()}));
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

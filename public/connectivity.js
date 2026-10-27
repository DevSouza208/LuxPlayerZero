import {setIconLabel} from './lux-icons.js';
// Browser network signal only; this does not claim that the backend or media provider is reachable.
const notice=document.createElement('aside');notice.className='lux-connectivity';notice.hidden=true;
notice.setAttribute('aria-label','Conexão');
const message=document.createElement('span');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
const retry=document.createElement('button');retry.type='button';setIconLabel(retry,'refresh-cw','Recarregar página');
retry.addEventListener('click',()=>location.reload());
notice.append(message,retry);document.body.prepend(notice);
let wasOffline=!navigator.onLine;
function update(){
 if(!navigator.onLine){wasOffline=true;notice.hidden=false;retry.hidden=true;message.textContent='Sem conexão detectada. Alterações podem não ser salvas.';return;}
 notice.hidden=!wasOffline;retry.hidden=false;
 message.textContent='A conexão de rede voltou. Se houve falha ao salvar, recarregue para sincronizar.';
}
window.addEventListener('offline',update);window.addEventListener('online',update);update();

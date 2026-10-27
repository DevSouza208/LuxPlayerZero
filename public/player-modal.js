/** Apresentação do player existente: move o mesmo nó, sem recriar mídia ou motores. */
export function createPlayerModal(host,{onClose=()=>{}}={}){
 if(!host)return {open(){},close(){}};
 const shell=document.createElement('dialog');shell.className='lux-player-modal';shell.setAttribute('aria-label','Reprodutor Lux Player');
 const toolbar=document.createElement('header');toolbar.className='lux-player-modal-bar';
 const back=document.createElement('button');back.type='button';back.className='lux-player-modal-back';back.textContent='‹ Voltar';back.setAttribute('aria-label','Fechar reprodutor e voltar');
 const brand=document.createElement('span');brand.textContent='LUX PLAYER';
 toolbar.append(back,brand);shell.append(toolbar,host);document.body.append(shell);
 let previousFocus=null,previousOverflow='';
 function close(){
  if(!shell.open)return;
  if(document.fullscreenElement===shell)void document.exitFullscreen?.().catch(()=>{});
  shell.close();document.body.style.overflow=previousOverflow;
  onClose();if(previousFocus?.isConnected)previousFocus.focus?.();
 }
 back.addEventListener('click',close);
 shell.addEventListener('cancel',event=>{event.preventDefault();close()});
 host.addEventListener('click',event=>{if(event.target.closest('.lux-return-details,.lux-continuation>button:last-of-type'))close()});
 return {open(){if(shell.open)return;previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';shell.showModal();back.focus();},close};
}

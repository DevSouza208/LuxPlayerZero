/** Presentation only: delegates to the existing public play callback. */
export function createEpisodeContinuation({host,onPlay,onReturn}){
 const panel=document.createElement('section');panel.className='lux-continuation';panel.hidden=true;
 panel.setAttribute('aria-label','Depois do episódio');
 const label=document.createElement('p');label.setAttribute('role','status');
 const next=document.createElement('button');next.type='button';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';
 const back=document.createElement('button');back.type='button';back.textContent='Voltar aos detalhes';
 panel.append(label,next,cancel,back);host?.append(panel);
 let timer=null,candidate=null;
 function stop(){clearTimeout(timer);timer=null;candidate=null;panel.hidden=true;}
 function play(){const selected=candidate;stop();if(selected)onPlay(selected.item);}
 next.addEventListener('click',play);cancel.addEventListener('click',stop);
 back.addEventListener('click',()=>{stop();onReturn()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;label.textContent='Reprodução automática pausada. Escolha quando continuar.';}});
 return {cancel:stop,show(row,automatic){
  stop();candidate=row;panel.hidden=false;next.hidden=!row;
  next.textContent=row?'Assistir T'+row.season+':E'+row.number:'';
  label.textContent=row?'Próximo episódio disponível no seu catálogo.':'Você chegou ao último episódio disponível. Veja as sugestões na Home.';
  if(row&&row.contiguous&&automatic&&!document.hidden){
   label.textContent='O próximo episódio começa em 10 segundos.';
   timer=setTimeout(play,10000);
  }
 }};
}

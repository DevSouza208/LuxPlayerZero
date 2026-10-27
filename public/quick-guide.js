import {setIconLabel} from './lux-icons.js';
import {nowNext} from './guide-model.js';
/** Guide overlay only. Never touches media elements, source URLs or playback state. */
export function createQuickGuide(host,fetcher=fetch){
 const button=document.createElement('button');button.type='button';button.className='lux-quick-guide-button';setIconLabel(button,'list','Guia do canal');button.hidden=true;
 const dialog=document.createElement('dialog');dialog.className='lux-quick-guide';dialog.setAttribute('aria-label','Programação do canal');
 const close=document.createElement('button');close.type='button';setIconLabel(close,'x','Fechar guia');
 const title=document.createElement('h2'),status=document.createElement('p');status.setAttribute('role','status');
 const content=document.createElement('div'),full=document.createElement('a');full.href='/guide/';setIconLabel(full,'arrow-up-right','Abrir guia completo');
 dialog.append(close,title,status,content,full);host?.append(button);document.body.append(dialog);
 let channel=null,controller=null,epoch=0;
 function cancel(){controller?.abort();controller=null;epoch++;}
 function hide(){cancel();dialog.close();button.focus({preventScroll:true});}
 close.addEventListener('click',hide);dialog.addEventListener('cancel',event=>{event.preventDefault();hide()});
 button.addEventListener('click',async()=>{
  if(!channel)return;cancel();const current=epoch,selected=channel;title.textContent=selected.name;content.replaceChildren();status.textContent='Carregando programação…';dialog.showModal();
  if(!selected.epgId){status.textContent='Este canal não tem identificador de programação na fonte.';return;}
  controller=new AbortController();const localController=controller,timer=setTimeout(()=>localController.abort(),8000);
  try{
   const from=Date.now(),url='/api/editorial/guide?'+new URLSearchParams({channel:selected.epgId,from:String(from),to:String(from+86400000)});
   const response=await fetcher(url,{credentials:'same-origin',cache:'no-store',signal:localController.signal});
   if(!response.ok)throw Error();const data=await response.json();if(epoch!==current||!dialog.open)return;
   const info=nowNext(data.programs||[],selected.epgId,Date.now());
   status.textContent=info.current?'Programação cadastrada para este canal.':'Sem informação do programa atual.';
   for(const [label,program] of [['Agora',info.current],['A seguir',info.next]]){
    if(!program)continue;const section=document.createElement('section'),heading=document.createElement('h3'),time=document.createElement('p');
    heading.textContent=label+' · '+program.title;
    time.textContent=new Date(program.start).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'–'+new Date(program.end).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    section.append(heading,time);
    if(label==='Agora'){const progress=document.createElement('progress');progress.max=1;progress.value=info.progress;progress.setAttribute('aria-label','Progresso do programa');section.append(progress)}
    content.append(section);
   }
   if(!info.current&&!info.next)status.textContent='Não há programação cadastrada para este canal nas próximas 24 horas.';
  }catch{if(epoch===current&&dialog.open)status.textContent='Não foi possível carregar a programação. Feche e tente novamente.';}
  finally{clearTimeout(timer)}
 });
 return {select(item){cancel();if(dialog.open)dialog.close();channel=item?{name:String(item.displayName||item.name||'Canal'),epgId:String(item.epgId||'')}:null;button.hidden=!channel;},close:hide};
}

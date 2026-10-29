import {createHeroSlideState} from './hero-slides-model.js';
import {setIcon} from './lux-icons.js';
export function createHeroSlides({root,onChange,key,seed=0,interval=10000}={}){
 const state=createHeroSlideState({key,seed});if(!root)return {setItems:items=>state.setItems(items),setActive(){},pause(){}};
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let timer=null,active=true,inView=false,hovered=false,focused=false,paused=reduced.matches;
 const controls=document.createElement('div');controls.className='hero-slides';controls.setAttribute('role','group');controls.setAttribute('aria-label','Navegar pelos destaques');controls.hidden=true;
 const make=(label,icon)=>{const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.title=label;setIcon(button,icon);return button;};
 const prev=make('Destaque anterior','chevron-left'),next=make('Próximo destaque','chevron-right'),toggle=make('Pausar destaques','pause'),count=document.createElement('span');count.className='hero-slides-count';count.setAttribute('aria-live','off');
 const announcement=document.createElement('span');announcement.className='hero-slides-announcement';announcement.setAttribute('aria-live','polite');
 controls.append(prev,count,next,toggle,announcement);root.querySelector('.hero-actions')?.after(controls);
 root.setAttribute('aria-roledescription','carrossel');
 function schedule(){
  clearTimeout(timer);timer=null;
  if(state.length<2||!active||!inView||document.hidden||hovered||focused||paused)return;
  timer=setTimeout(()=>{change(1,false)},interval);timer.unref?.();
 }
 function draw(){
  controls.hidden=state.length<2;count.textContent=(state.index+1)+' / '+state.length;
  const label=paused?'Retomar destaques':'Pausar destaques';toggle.setAttribute('aria-label',label);toggle.title=label;setIcon(toggle,paused?'play':'pause');schedule();
 }
 function change(delta,manual=true){
  if(state.length<2)return;const item=state.move(delta);draw();onChange(item);
  if(manual)announcement.textContent='Destaque '+(state.index+1)+' de '+state.length;
 }
 prev.addEventListener('click',()=>change(-1));next.addEventListener('click',()=>change(1));
 toggle.addEventListener('click',()=>{paused=!paused;draw()});
 // Foco e mouse pausam sem mudar a preferência explícita do botão.
 root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;schedule();}});
 root.addEventListener('pointerleave',()=>{hovered=false;schedule();});
 root.addEventListener('focusin',()=>{focused=true;schedule();});
 root.addEventListener('focusout',event=>{focused=root.contains(event.relatedTarget);schedule();});
 controls.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();change(event.key==='ArrowLeft'?-1:1);}});
 document.addEventListener('visibilitychange',schedule);
 reduced.addEventListener('change',event=>{if(event.matches){paused=true;draw();}});
 if(typeof IntersectionObserver==='function')new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting===true&&entries[0].intersectionRatio>=.35;schedule();},{threshold:.35}).observe(root);
 else {inView=true;}
 return {
  setItems(items){const item=state.setItems(items);draw();return item;},
  setActive(value){active=value;schedule();},
  pause(){paused=true;draw();}
 };
}

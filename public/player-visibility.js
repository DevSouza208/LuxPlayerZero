/** Idle timing, independent from the media engine and DOM. */
export function createPlayerVisibility({isPlaying,isBlocked=()=>false,onChange,delay=2800,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,idle=false;
 function clear(){if(timer!==null)clearTimer(timer);timer=null;}
 function update(next){idle=next;onChange(next);}
 function reveal(){
  clear();update(false);
  if(isPlaying())timer=setTimer(()=>{
   timer=null;
   if(isPlaying()&&!isBlocked())update(true);
  },delay);
 }
 function stop(){clear();update(false);}
 return {reveal,stop,get idle(){return idle}};
}

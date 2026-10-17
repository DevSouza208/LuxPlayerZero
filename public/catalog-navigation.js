/** Choose a neighboring card by rendered geometry, independently of media controls. */
export function spatialNeighbor(rects,current,key){
 const base=rects[current];if(!base)return -1;
 const horizontal=key==='ArrowLeft'||key==='ArrowRight',sign=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key))return -1;
 const x=base.left+base.width/2,y=base.top+base.height/2;
 let best=-1,bestScore=Infinity;
 rects.forEach((rect,index)=>{
  if(index===current)return;
  const dx=rect.left+rect.width/2-x,dy=rect.top+rect.height/2-y,forward=sign*(horizontal?dx:dy),side=Math.abs(horizontal?dy:dx);
  if(forward<=1)return;
  const aligned=horizontal?rect.top<base.top+base.height&&rect.top+rect.height>base.top:rect.left<base.left+base.width&&rect.left+rect.width>base.left;
  const score=forward+side*2+(aligned?0:10000);
  if(score<bestScore){bestScore=score;best=index;}
 });
 return best;
}
if(typeof document!=='undefined')document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||!event.key.startsWith('Arrow'))return;
 const current=document.activeElement;
 if(!current?.matches('button[data-details],button.lux-full-episode-card'))return;
 const scope=current.closest('#browse-grid,#home-rails,.lux-full-episode-grid');if(!scope)return;
 const candidates=[...scope.querySelectorAll('button[data-details],button.lux-full-episode-card')].filter(button=>!button.disabled&&button.getClientRects().length&&getComputedStyle(button).visibility!=='hidden');
 const next=spatialNeighbor(candidates.map(button=>button.getBoundingClientRect()),candidates.indexOf(current),event.key);
 if(next<0)return;event.preventDefault();candidates[next].focus({preventScroll:true});candidates[next].scrollIntoView({block:'nearest',inline:'nearest',behavior:'auto'});
});

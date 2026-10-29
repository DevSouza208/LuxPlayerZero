/** Rotação só entre os objetos originais disponíveis na biblioteca. */
export function createHeroSlideState({key=item=>item.id,seed=0}={}){
 let items=[],index=0,initialized=false;
 return {
  setItems(next){
   const current=items[index],seen=new Set();items=next.filter(item=>{const id=key(item);if(seen.has(id))return false;seen.add(id);return true;});
   const found=current?items.findIndex(item=>key(item)===key(current)):-1;
   index=found>=0?found:items.length?Math.min(items.length-1,Math.floor((initialized?0:seed)*items.length)):0;
   if(items.length)initialized=true;
   return items[index]||null;
  },
  move(delta){if(items.length)index=((index+delta)%items.length+items.length)%items.length;return items[index]||null;},
  get current(){return items[index]||null;},get index(){return index;},get length(){return items.length;}
 };
}

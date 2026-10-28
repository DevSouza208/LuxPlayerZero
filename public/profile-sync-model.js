/** Field/item patches merge unrelated changes from another device after HTTP 409. */
const listKeys=new Set(['favorites','recent','watched']);
export const profileKeys=new Set(['settings','favorites','recent','watched','seasons']);
function entries(key,value){
 if(key==='watched')return new Map((value||[]).map(id=>[id,true]));
 if(listKeys.has(key))return new Map((value||[]).map(row=>[row.key,row]));
 return new Map(Object.entries(value||{}));
}
export function profileChanges(key,before,after,at,token){
 if(!profileKeys.has(key))throw Error('Preferência inválida.');
 const old=entries(key,before),next=entries(key,after),ops={};
 for(const item of new Set([...old.keys(),...next.keys()])){
  const a=old.get(item),b=next.get(item);
  // Replaying/pausing at the same position is not a new progress write.
  if(key==='recent'&&a&&b&&JSON.stringify({...a,at:0})===JSON.stringify({...b,at:0}))continue;
  if(JSON.stringify(a)===JSON.stringify(b))continue;
  ops[JSON.stringify([key,item])]={key,item,at,token,...(next.has(item)?{value:structuredClone(b)}:{removed:true})};
 }
 return ops;
}
export function applyProfileChanges(base,ops){
 const result=structuredClone(base||{});
 for(const key of profileKeys){
  const rows=entries(key,result[key]);
  for(const op of Object.values(ops||{}))if(op.key===key){
   const current=rows.get(op.item);
   if((key==='recent'||key==='favorites')&&current?.at>op.at)continue;
   if(op.removed)rows.delete(op.item);else rows.set(op.item,structuredClone(op.value));
  }
  result[key]=listKeys.has(key)?key==='watched'?[...rows.keys()].slice(0,500):[...rows.values()].sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,key==='recent'?30:60):Object.fromEntries(rows);
 }
 return result;
}

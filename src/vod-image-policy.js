/** Strictly bounded public TMDB image cache. Never accepts arbitrary fetch URLs. */
export const IMAGE_BUDGET=Object.freeze({
  maxImagesPerDay:1500,
  maxImagesPerMonth:12000,
  maxBytesPerMonth:2*1024*1024*1024,
  maxProcessingMsPerMonth:6_000_000, // conservative wall time; CPU <= wall time
  maxBytesPerImage:2_500_000,
  maxSourceBytes:6_000_000,
  maxPixels:3_200_000
});
export function tmdbImageSource(value,kind){
 if(!['poster','backdrop'].includes(kind)||typeof value!=='string')return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='image.tmdb.org'||url.username||url.password||url.port||url.search||url.hash)return null;
  const match=/^\/t\/p\/(w500|w1280)\/([a-zA-Z0-9_.-]{3,100})\.(jpg|jpeg|png)$/i.exec(url.pathname);
  if(!match || match[1] !== (kind==='poster'?'w500':'w1280'))return null;
  return url.href;
 }catch{return null}
}
export function imageKey(type,id,kind){
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1||Number(id)>999999999||!['poster','backdrop'].includes(kind))return null;
 return 'metadata/tmdb/'+type+'/'+Number(id)+'/'+kind+'.webp';
}
export function artworkPath(type,id,kind){
 const key=imageKey(type,id,kind);
 return key?'/api/artwork/'+type+'/'+Number(id)+'/'+kind:null;
}
export function imageBudgetAllows(month,day,newSize=0,policy=IMAGE_BUDGET){
 return Number(month?.conversions||0)<policy.maxImagesPerMonth
 && Number(day?.conversions||0)<policy.maxImagesPerDay
 && Number(month?.bytes||0)+newSize<=policy.maxBytesPerMonth
 && Number(month?.processing_ms||0)<policy.maxProcessingMsPerMonth;
}

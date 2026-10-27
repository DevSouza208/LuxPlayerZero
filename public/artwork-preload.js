/** Aquece o cache e espera o decode das imagens, sem inserir imagens fora da tela. */
export function createImagePreloader({ImageClass=globalThis.Image,concurrency=6,timeoutMs=10000}={}){
 const pending=new Map(),queue=[];let active=0;
 function pump(){
  while(active<concurrency&&queue.length){
   const {url,resolve}=queue.shift();active++;
   const image=new ImageClass();let finished=false;
   const done=value=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=image.onerror=null;active--;resolve(value);pump()};
   const timer=setTimeout(()=>done(false),timeoutMs);
   image.referrerPolicy='no-referrer';image.decoding='async';
   image.onload=()=>{if(typeof image.decode==='function')image.decode().then(()=>done(true),()=>done(true));else done(true)};
   image.onerror=()=>done(false);image.src=url;
  }
 }
 return url=>{
  if(!url||!ImageClass)return Promise.resolve(false);
  if(pending.has(url))return pending.get(url);
  const promise=new Promise(resolve=>{queue.push({url,resolve})});
  pending.set(url,promise);if(pending.size>1200)pending.delete(pending.keys().next().value);
  pump();return promise;
 };
}

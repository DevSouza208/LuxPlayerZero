import {canonicalTvName} from './tv-normalizer.js';
export const TVMAP_SOURCE='https://tvmap.com.br/Principais';
export const GUIDE_TTL=15*60000;
const aliases=new Map([['recordtv','record'],['rederecord','record'],['sonychannel','sony'],['warnerchannel','warner'],['warnertv','warner'],['discoveryhh','discoveryhomehealth']]);
export function guideChannelKey(value){
 const key=canonicalTvName(value).toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/&|\band\b|\be\b/g,' ').replace(/[^a-z0-9]/g,'');
 return aliases.get(key)||key;
}
export function matchGuideChannels(guide,items){
 const local=new Map();for(const item of items||[]){const key=guideChannelKey(item.displayName||item.name);if(key&&!local.has(key))local.set(key,item);}
 return (guide?.channels||[]).flatMap(channel=>{const item=local.get(guideChannelKey(channel.name));return item?[{...channel,item}]:[]});
}
const text=(value,max=240)=>typeof value==='string'?value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
export function cleanTvGuide(value){
 if(value?.version!==1||!Number.isFinite(value.fetchedAt)||!Number.isFinite(value.windowStart)||!Number.isFinite(value.windowEnd)||value.windowEnd-value.windowStart!==3*3600000||!Array.isArray(value.channels)||value.channels.length>80)throw Error('Grade de programação inválida.');
 const seen=new Set(),channels=[];
 for(const channel of value.channels){
  const name=text(channel?.name),key=guideChannelKey(name);if(!name||!key||seen.has(key)||!Array.isArray(channel.programs)||channel.programs.length>24)continue;
  const programs=[];
  for(const p of channel.programs){
   const title=text(p?.title),start=Number.isFinite(p?.start)?p.start:null,end=Number.isFinite(p?.end)?p.end:null;
   if(!title||(!p.current&&start===null)||start!==null&&Math.abs(start-value.windowStart)>12*3600000||end!==null&&(Math.abs(end-value.windowStart)>18*3600000||start!==null&&end<=start))continue;
   programs.push({title,start,end,current:p.current===true,progress:Number.isFinite(p.progress)?Math.max(0,Math.min(1,p.progress)):null,sourceUrl:typeof p.sourceUrl==='string'&&/^https:\/\/tvmap\.com\.br\/c\d+\/[a-zA-Z0-9-]+$/.test(p.sourceUrl)?p.sourceUrl:''});
  }
  if(!programs.length)continue;seen.add(key);channels.push({name,logo:typeof channel.logo==='string'&&/^https:\/\/tvmap\.com\.br\/images\/ch\/\d+\.(?:jpg|png)$/.test(channel.logo)?channel.logo:'',programs});
 }
 return {version:1,source:TVMAP_SOURCE,fetchedAt:value.fetchedAt,windowStart:value.windowStart,windowEnd:value.windowEnd,channels};
}

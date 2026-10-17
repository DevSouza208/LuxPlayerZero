/** XMLTV adapter: local authorized file only; never fetches source URLs. */
export function xmltvTime(value) {
 const match=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])(\d{2})(\d{2})$/.exec(String(value||''));
 if(!match)return null;
 const [,year,month,day,hour,minute,second='00',sign,oh,om]=match;
 const parts=[year,month,day,hour,minute,second].map(Number);
 if(parts[1]<1||parts[1]>12||parts[2]<1||parts[2]>31||parts[3]>23||parts[4]>59||parts[5]>59||Number(oh)>14||Number(om)>59)return null;
 const raw=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]);
 const date=new Date(raw);if(date.getUTCMonth()!==parts[1]-1||date.getUTCDate()!==parts[2])return null;
 return raw-(sign==='+'?1:-1)*(Number(oh)*60+Number(om))*60000;
}
export function parseXmltv(text,Parser=globalThis.DOMParser) {
 if(typeof text!=='string'||text.length>16*1024*1024)throw Error('XMLTV deve ter até 16 MB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('XMLTV com entidades externas não é aceito.');
 if(!Parser)throw Error('Leitura XML indisponível neste ambiente.');
 const document=new Parser().parseFromString(text,'application/xml');
 if(document.querySelector('parsererror')||document.documentElement?.tagName!=='tv')throw Error('XMLTV inválido.');
 const programs=[];let skipped=0;
 for(const node of document.querySelectorAll('programme')){
  const start=xmltvTime(node.getAttribute('start')),end=xmltvTime(node.getAttribute('stop'));
  const channel=node.getAttribute('channel')?.trim(),title=node.querySelector('title')?.textContent?.trim();
  if(!channel||!title||start===null||end===null||end<=start){skipped++;continue}
  programs.push({channel:channel.slice(0,160),title:title.slice(0,240),start,end,description:(node.querySelector('desc')?.textContent||'').slice(0,2000)});
  if(programs.length>50000)throw Error('XMLTV ultrapassa 50 mil programas.');
 }
 return {programs,skipped};
}
export function nowNext(programs,channel,now=Date.now()) {
 const rows=programs.filter(p=>p.channel===channel).sort((a,b)=>a.start-b.start);
 const current=rows.find(p=>p.start<=now&&p.end>now)||null;
 const next=rows.find(p=>p.start>now)||null;
 return {current,next,progress:current?Math.max(0,Math.min(1,(now-current.start)/(current.end-current.start))):0};
}

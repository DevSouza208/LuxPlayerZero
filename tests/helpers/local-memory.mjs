export function memoryStorage(){
 const rows=new Map();return {rows,async get(key){return structuredClone(rows.get(key)??null)},async set(key,value){rows.set(key,structuredClone(value));return value},async update(key,fn){const value=fn(structuredClone(rows.get(key)??null));rows.set(key,structuredClone(value));return structuredClone(value)},async remove(key){rows.delete(key)}};
}
export function clock(){let time=1000,id=0;const jobs=new Map();return {now:()=>time,schedule:(fn,delay)=>{const key=++id;jobs.set(key,{fn,at:time+delay});return key},cancel:key=>jobs.delete(key),advance(ms){time+=ms;for(const [key,job]of jobs)if(job.at<=time){jobs.delete(key);job.fn()}},jobs};}

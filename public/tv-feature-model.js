import {normalizeSearchText} from './media-taxonomy.js';
export const TV_DAYS=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const COUNTRIES={BR:'Brasil',US:'Estados Unidos',AR:'Argentina',MX:'México',CO:'Colômbia',CL:'Chile',EC:'Equador',CR:'Costa Rica',DO:'República Dominicana',PR:'Porto Rico',PT:'Portugal',ES:'Espanha',FR:'França',DE:'Alemanha',IT:'Itália',GB:'Reino Unido',CA:'Canadá',UY:'Uruguai',PY:'Paraguai',PE:'Peru',BO:'Bolívia',VE:'Venezuela',CU:'Cuba',PA:'Panamá',GT:'Guatemala',HN:'Honduras',SV:'El Salvador',NI:'Nicarágua',JP:'Japão',KR:'Coreia do Sul',CN:'China',IN:'Índia',AU:'Austrália',TR:'Turquia'};
const ALIASES={BRA:'BR',USA:'US',ARG:'AR',MEX:'MX',COL:'CO',CHI:'CL',CHL:'CL',ECU:'EC',CRI:'CR',DR:'DO',DOM:'DO',PUR:'PR',POR:'PT',ESP:'ES',FRA:'FR',GER:'DE',DEU:'DE',ITA:'IT',UK:'GB',ENG:'GB',GBR:'GB',CAN:'CA',URU:'UY',URY:'UY',PER:'PE',JPN:'JP'};
export function channelCountry(name,providerGroup=''){
 let rest=String(name||'');let prefixed=false;
 for(let i=0;i<3;i++){
  const match=rest.match(/^\s*(?:\[([a-z]{2,3})\]|([a-z]{2,3})\s*[:|])\s*/i);if(!match)break;
  const code=(match[1]||match[2]).toUpperCase(),country=ALIASES[code]||code;
  if(['LA','LT'].includes(code))prefixed=true;
  if(COUNTRIES[country])return {international:country!=='BR',code:country,label:COUNTRIES[country]};
  rest=rest.slice(match[0].length);
 }
 const international=prefixed||/\binternaciona[il]/i.test(normalizeSearchText(providerGroup));
 return {international,code:international?'unknown':'BR',label:international?'País não identificado':'Brasil'};
}
export function tvCountryIndex(groups){
 const all=groups.map(group=>({group,country:channelCountry(group.primary?.name||group.title,group.primary?.group)}));
 const countries=new Map();for(const row of all)if(row.country.international){const value=countries.get(row.country.code)||{...row.country,count:0};value.count++;countries.set(value.code,value)}
 return {all,countries:[...countries.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR')),international:all.filter(row=>row.country.international).map(row=>row.group),other:all.filter(row=>!row.country.international).map(row=>row.group)};
}
export function saoPauloDay(date=new Date()){
 return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short'}).format(date));
}
export const emptyTvSchedule=()=>({schemaVersion:1,days:Object.fromEntries(TV_DAYS.map((_,day)=>[day,[]])),updatedAt:0});
export function cleanTvSchedule(value){
 if(!value||value.schemaVersion!==1||!value.days||typeof value.days!=='object'||Array.isArray(value.days))throw Error('Agenda inválida.');
 const result=emptyTvSchedule();
 for(let day=0;day<7;day++){
  const rows=value.days[day]??[];if(!Array.isArray(rows)||rows.length>6)throw Error('Escolha até seis canais por dia.');
  const seen=new Set();result.days[day]=rows.map(row=>{
   if(!row||typeof row.key!=='string'||! /^(?:epg|name):[a-z0-9 ._:-]{1,200}$/i.test(row.key)||typeof row.title!=='string'||!row.title.trim()||row.title.length>180||/[\x00-\x1f]|https?:\/\//i.test(row.title))throw Error('Canal inválido na agenda.');
   if(seen.has(row.key))throw Error('Canal repetido no mesmo dia.');seen.add(row.key);return {key:row.key,title:row.title.trim()};
  });
 }
 result.updatedAt=Number.isSafeInteger(value.updatedAt)&&value.updatedAt>=0?value.updatedAt:0;return result;
}
export function channelsForDay(groups,schedule,day){
 const byKey=new Map(groups.map(group=>[group.key,group])),byName=new Map();for(const group of groups){const key=normalizeSearchText(group.title);if(!byName.has(key))byName.set(key,group);else byName.set(key,null)}
 const seen=new Set();return (schedule.days[day]||[]).map(ref=>byKey.get(ref.key)||byName.get(normalizeSearchText(ref.title))).filter(group=>group&&!seen.has(group.key)&&seen.add(group.key));
}
// Preserve the provider's labels and order, including channels in multiple groups.
export function providerTvGroups(sourceGroups){
 const groups=tvCountryIndex(sourceGroups).other,categories=new Map();
 for(const group of groups){
  const names=[...new Set((group.categories?.length?group.categories:[group.primary?.group||'Outros']).filter(name=>typeof name==='string'&&name.trim()))];
  for(const label of names.length?names:['Outros']){
   if(/\b(?:internaciona[il]|international)/i.test(normalizeSearchText(label)))continue;
   const key='provider:'+label;let category=categories.get(key);if(!category){category={key,label,groups:[],channels:[]};categories.set(key,category)}category.groups.push(group);category.channels.push(group.primary);
  }
 }
 return {groups,channels:groups.map(group=>group.primary),categories:[...categories.values()]};
}

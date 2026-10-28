import {normalizeSearchText} from './media-taxonomy.js';
import {canonicalTvName} from './tv-normalizer.js';
import {tvCountryIndex} from './tv-feature-model.js';

// Referência editorial consultada em 28/10/2026: https://meuguia.tv/ .
// Apenas nomes de canais/categorias: não importa programação nem consulta o site em runtime.
export const TV_GUIDE_CATEGORIES=[
 ['movies','Filmes'],['series','Séries'],['sports','Esportes'],['kids','Infantil'],
 ['variety','Variedades'],['documentary','Documentários'],['news','Notícias'],['open','TV aberta'],['other','Outros']
];
const names={
 movies:['AMC','Canal Brasil','Cinemax','HBO','HBO 2','HBO Family','HBO Plus','HBO Signature','Megapix','Space','TCM','TCM Turner Classic','TCM - Turner Classic','TNT','Telecine Action','Telecine Cult','Telecine Fun','Telecine Pipoca','Telecine Premium','Telecine Touch'],
 series:['A&E','AXN','Animal Planet','Discovery HD Theater','Discovery Theater','Eurochannel','Film & Arts','Film Arts','Lifetime','Sony','Sony Channel','Studio Universal','TBS','TNT Séries','Universal Channel','Universal TV','Warner','Warner Channel'],
 sports:['Band Sports','BandSports','Combate','ESPN','ESPN 1','ESPN 2','ESPN 3','ESPN 4','ESPN 5','ESPN 6','OFF','OFF HD','Premiere','Premiere Clubes','SporTV','SporTV 1','SporTV 2','SporTV 3'],
 kids:['Baby TV','Cartoon','Disney XD','Nick Jr','Cartoon Network','Discovery Kids','Gloob','Tooncast'],
 variety:['Arte 1','Arte1','Bis','Canal Rural','Canal do Boi','E!','E! Entertainment','E! Entertainment TV','E! Entertainment Television','Futura','GNT','Multishow','RAI International','Rede Boa Vontade','SIC International','TV Espanha','TV Escola','TV Justiça','TV Senado','TV5 Monde','Travel Box Brazil','Viva','Woohoo'],
 documentary:['Nat Geo','National Geographic','Discovery','Discovery Channel','Discovery Home & Health','Discovery Home Health','Discovery Science','Discovery Turbo','Discovery World','History','History Channel','TLC'],
 news:['CNN','CNN Brasil','Fox News','BBC','BBC World News','Band News','BandNews','Bloomberg','CNN International','Deutsche Welle','Globo News','GloboNews'],
 open:['Band','Canal 21','Globo','Record News','Record','Record TV','Rede Record','Rede TV','RedeTV!','Rede Vida','SBT','TV Aparecida','TV Aparecida (aberta)','TV Brasil','TV Cultura','TV Gazeta']
};
function channelKey(value){
 let name=String(value||'');
 for(let i=0;i<4;i++)name=canonicalTvName(name).replace(/\s*[|:-]?\s*\b(?:hevc|h26[45]|full\s*hd|fhd|uhd|hd|sd|4k|2160p|1080p|720p|480p)\s*$/i,'').trim();
 return normalizeSearchText(name);
}
const channels=new Map(Object.entries(names).flatMap(([category,values])=>values.map(name=>[channelKey(name),category])));
export function guideCategoryForChannel(name){
 const key=channelKey(name),exact=channels.get(key);if(exact)return exact;
 // Sufixos regionais e numeração mantêm a família conhecida do canal.
 if(/^premiere\s+\d+$/.test(key))return 'sports';
 if(/^(?:tv )?globo\s+/.test(key)&&!/^globo\s+(?:news|play|novelas)\b/.test(key))return 'open';
 if(/^(?:sbt|record(?: tv)?|rede record|band)\s+/.test(key)&&!/^band\s+(?:news|sports?)\b/.test(key))return 'open';
 return 'other';
}
export function guideTvGroups(sourceGroups){
 const groups=tvCountryIndex(sourceGroups).other;
 const categories=new Map(TV_GUIDE_CATEGORIES.map(([id,label])=>[id,{key:'guide:'+id,label,groups:[],channels:[]} ]));
 for(const group of groups){
  const category=guideCategoryForChannel(group.title||group.primary?.name);
  const row=categories.get(category);row.groups.push(group);row.channels.push(group.primary);
 }
 return {groups,channels:groups.map(group=>group.primary),categories:[...categories.values()].filter(row=>row.channels.length)};
}

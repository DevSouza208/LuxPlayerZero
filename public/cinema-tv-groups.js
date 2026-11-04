/* Logical channel grouping from Lux 2.0: EPG first, normalized name fallback.
 * All sources are retained as independent quality/source variants.
 */
import {canonicalTvName} from './tv-normalizer.js';
import {normalizeSearchText,mediaQuality} from './media-taxonomy.js';
const SCORE={'4K':2160,'Full HD':1080,'HD':720,'SD':480};
export function tvCategory(name,providerGroup='') {
 const text=normalizeSearchText(name+' '+providerGroup);
 if(/\b(adulto|adult|xxx|18\+)\b/.test(text))return'adult';
 if(/\b24\s*h(?:oras)?\b|\b24x7\b|\b24\s*7\b/.test(text))return'always_on';
 if(/\b(usa|estados unidos|argentina|chile|portugal|internacional|espanha)\b/.test(text))return'international';
 if(/\b(sportv|sport|esportes|esporte|futebol|premiere|combate|espn|nba|nfl|ufc|dazn)\b/.test(text))return'sports';
 if(/\b(infantil|kids|desenho|cartoon|nickelodeon|disney junior|gloob)\b/.test(text))return'kids';
 if(/\b(noticia|news|jornal|cnn|globonews|bandnews)\b/.test(text))return'news';
 if(/\b(documentario|discovery|national geographic|history)\b/.test(text))return'documentary';
 if(/\b(religioso|gospel|cancao nova|rede vida)\b/.test(text))return'religious';
 if(/\b(musica|music|mtv|bis|radio)\b/.test(text))return'music';
 if(/\b(filmes|movie|cinema|telecine|hbo|megapix)\b/.test(text))return'movies';
 if(/\b(series|serie|novela|warner channel|axn|universal tv)\b/.test(text))return'series';
 if(/\b(tv aberta|globo|sbt|record|band|rede tv)\b/.test(text))return'open';
 return'other';
}
export const TV_CATEGORY_LABELS={
 sports:'Esportes',kids:'Infantil',news:'Notícias',documentary:'Documentários',religious:'Religiosos',
 music:'Música',movies:'Filmes',series:'Séries',open:'TV aberta',international:'Internacional',
 always_on:'24 horas',adult:'Adulto',other:'Outros'
};
// A fonte sem número é a primeira da mesma família (ESPN == ESPN 1).
// Qualidade e codec já foram removidos do nome canônico pelo normalizador.
export function tvLogicalIdentity(raw){
 const name=canonicalTvName(raw);
 const match=/^(.+?)\s+([1-9][0-9]{0,2})$/.exec(name);
 const number=match?Number(match[2]):1;
 const family=normalizeSearchText(match?match[1]:name);
 return {name,number,identity:family+' '+number};
}
export function groupTvEntries(items){
 const groups=new Map(),byName=new Map(),byEpg=new Map(),byItemId=new Map();
 for(const item of items||[]){
   const normalized=tvLogicalIdentity(item.displayName||item.name);
   const {name,number,identity}=normalized;
   const epg=String(item.epgId||item.tvgId||'').trim().toLowerCase();
   const validEpg=epg&&!/^(0|none|null|undefined|unknown|n\/a|-)$/.test(epg);
   const nameKey='name:'+identity,epgKey=validEpg?'epg:'+epg:'';
   // Mesmo canal/número deve unir inclusive fontes sem tvg-id ou com EPG diferente.
   // Só reutilizamos EPG como alias se a numeração não entrar em conflito.
   let group=byName.get(nameKey)||(epgKey&&byEpg.get(epgKey)?.number===number?byEpg.get(epgKey):null);
   if(!group){
     // Um EPG incorreto não pode fazer o canal 2 sobrescrever o canal 1.
     const key=epgKey&&!groups.has(epgKey)?epgKey:nameKey;
     group={key,title:name,number,primary:item,variants:[],aliases:[],
       categories:new Set(),category:tvCategory(name,item.group)};
     groups.set(key,group);
   }
   if(!byName.has(nameKey))byName.set(nameKey,group);
   if(epgKey&&!byEpg.has(epgKey))byEpg.set(epgKey,group);
   const quality=mediaQuality(item.name)||'Automático';
   const qualityCount=group.variants.filter(x=>x.quality===quality).length+1;
   group.variants.push({item,quality,score:SCORE[quality]||0,
     label:quality==='Automático'?'Fonte '+qualityCount:
       quality+(qualityCount>1?' · fonte '+qualityCount:'')});
   if(!group.aliases.includes(item.name))group.aliases.push(item.name);
   if(item.group)group.categories.add(item.group);
   byItemId.set(item.id,group);
 }
 const logical=[...groups.values()];
 for(const group of logical){
   // Presentation only: retain provider order, all rows and the original first source.
   group.variantCount=group.variants.length;
   group.categories=[...group.categories];
 }
 return {groups:logical,representatives:logical.map(group=>group.primary),sourceCount:items.length,byItemId};
}

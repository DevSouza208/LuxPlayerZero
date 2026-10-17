/**
 * Lux 2.0-inspired media taxonomy. Does not alter M3U rows or source URLs.
 * One title can have multiple genres, collections and provider-declared platforms.
 */
export function normalizeKey(raw) {
  return String(raw??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9+]+/g,' ').replace(/\s+/g,' ').trim();
}
export function normalizeMediaGroup(raw) {
  return String(raw??'').trim().replace(/^[❖◆◇•*▸\s]+/u,'')
    .replace(/^2\s+(?=\S)/i,'').replace(/['’´]+\s*$/u,'').replace(/\s+/g,' ').trim();
}
const PLATFORMS={
  netflix:['Netflix','netflix'],prime:['Prime Video','prime video','amazon prime video'],
  disney:['Disney+','disney+','disney plus'],max:['HBO Max','max','hbo max'],
  apple:['Apple TV+','apple tv+','apple tv plus'],paramount:['Paramount+','paramount','paramount+','paramount plus'],
  globo:['Globoplay','globoplay','globo play'],discovery:['Discovery+','discovery+','discovery plus'],
  crunchyroll:['Crunchyroll','crunchyroll'],star:['Star+','star+','star plus'],telecine:['Telecine','telecine']
};
const GENRES={
  acao:['Ação','acao','action'],aventura:['Aventura','aventura','adventure'],
  animacao:['Animação','animacao','animation','anime','desenhos'],
  comedia:['Comédia','comedia','comedy'],crime:['Crime','crime','policial'],
  documentario:['Documentário','documentario','documentarios','documentary'],
  drama:['Drama','drama'],fantasia:['Fantasia','fantasia','fantasy'],
  ficcao:['Ficção científica','ficcao','ficcao cientifica','science fiction','sci fi','scifi'],
  romance:['Romance','romance','romantico'],suspense:['Suspense','suspense','thriller'],
  terror:['Terror','terror','horror'],familia:['Família','familia','family'],
  misterio:['Mistério','misterio','mystery'],guerra:['Guerra','guerra','war'],
  faroeste:['Faroeste','faroeste','western'],musica:['Música','musica','music'],
  historia:['História','historia','history'],esportes:['Esportes','esportes','esporte','sports'],
  biografia:['Biografia','biografia','biography']
};
const COLLECTIONS={
  animes:['Animes','anime','animes'],doramas:['Doramas','dorama','doramas'],
  novelas:['Novelas','novela','novelas'],desenhos:['Desenhos','desenho','desenhos'],
  legendadas:['Legendadas','legendado','legendados','legendada','legendadas'],
  turcas:['Séries turcas','turca','turcas','turcos'],
  lancamentos:['Lançamentos','lancamento','lancamentos','novidades']
};
const aliasIndex=table=>new Map(Object.entries(table).flatMap(([id,aliases])=>
  aliases.slice(1).map(alias=>[normalizeKey(alias),{id,label:aliases[0]}])));
const platformAliases=aliasIndex(PLATFORMS),genreAliases=aliasIndex(GENRES),collectionAliases=aliasIndex(COLLECTIONS);
export function classifyMediaCategories(groups=[],metadataGenres=[]) {
  const platforms=new Map(),genres=new Map(),collections=new Map(),otherCollections=new Map();
  for(const group of groups)for(const part of String(group??'').split('|')){
    const label=normalizeMediaGroup(part),key=normalizeKey(label);
    if(!key)continue;
    const platform=platformAliases.get(key),genre=genreAliases.get(key);
    const collection=collectionAliases.get(key)||
      (/^(lancamentos?|novidades) (19|20)\d{2}$/.test(key)?{id:'lancamentos',label:'Lançamentos'}:null);
    if(platform)platforms.set(platform.id,platform.label);
    if(genre)genres.set(genre.id,genre.label);
    if(collection)collections.set(collection.id,collection.label);
    if(!platform&&!genre&&!collection&&!otherCollections.has(key))otherCollections.set(key,label);
  }
  for(const raw of metadataGenres)for(const part of String(raw||'').split(/\s+&\s+|[,|]/)){
    const genre=genreAliases.get(normalizeKey(part));if(genre)genres.set(genre.id,genre.label);
  }
  return {platformIds:[...platforms.keys()],genreIds:[...genres.keys()],collectionIds:[...collections.keys()],
    platforms:[...platforms.values()],genres:[...genres.values()],collections:[...collections.values()],
    otherCollections:[...otherCollections.values()]};
}
export function mediaQuality(raw) {
  const key=normalizeKey(raw);
  if(/\b(4k|uhd|2160p)\b/.test(key))return '4K';
  if(/\b(fhd|full hd|1080p)\b/.test(key))return 'Full HD';
  if(/\b(hd|720p)\b/.test(key))return 'HD';
  if(/\b(sd|480p)\b/.test(key))return 'SD';
  return null;
}
export function mediaFeatures(raw) {
  const source=String(raw??''),key=normalizeKey(raw),tags=[];
  if(/\[(dub|dublado)\]/i.test(source)||/\bdublado?s?\b/.test(key)||/\bdub\b/.test(key))tags.push('Dublado');
  if(/\[(l|leg|legendado)\]/i.test(source)||/\blegendado?s?\b/.test(key)||/\bleg\b/.test(key))tags.push('Legendado');
  if(/\[cinema\]/i.test(source))tags.push('Cinema');
  if(/\boriginal\b/.test(key))tags.push('Original');
  if(mediaQuality(raw))tags.push(mediaQuality(raw));
  if(/\bhdr(?:10)?\b/.test(key))tags.push('HDR');
  if(/\b(hevc|h265|x265)\b/.test(key))tags.push('HEVC');
  return tags;
}
export const normalizeSearchText=value=>normalizeKey(value).replace(/\+/g,' ')
  .replace(/\bdois\b/g,'2').replace(/\btres\b/g,'3').replace(/\s+/g,' ').trim();
function editDistance(a,b){
  const before=Array.from({length:b.length+1},(_,i)=>i),after=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){after[0]=i;for(let j=1;j<=b.length;j++)after[j]=Math.min(
    before[j]+1,after[j-1]+1,before[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<=b.length;j++)before[j]=after[j];
  }return before[b.length];
}
export function searchSimilarity(title,query){
  const a=normalizeSearchText(title),b=normalizeSearchText(query);
  if(!a||!b)return 0;if(a===b)return 1;if(a.startsWith(b+' '))return .99;if(a.includes(b))return .97;
  const terms=b.split(' '),words=a.split(' '),results=[];
  for(const term of terms){let best=0;for(const word of words){
    let score=0;
    if(term===word)score=1;
    else if(term[0]===word[0]&&Math.abs(term.length-word.length)<=Math.max(term.length,word.length)*.5)
      score=1-editDistance(term,word)/Math.max(term.length,word.length);
    if(score>best)best=score;if(best===1)break;
  }results.push(best)}
  const cover=results.filter(v=>v>=.65).length/terms.length;
  let score=results.reduce((a,b)=>a+b,0)/terms.length*.82+cover*.18;
  if(terms.length>1&&cover<1)score*=.82;
  return Math.min(1,Math.max(0,score));
}

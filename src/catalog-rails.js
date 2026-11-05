/**
 * Classificação progressiva de exibição. Não altera M3U, URLs nem permissões.
 * A referência central é opcional e NUNCA filtra a disponibilidade individual.
 */
export const FALLBACK_RAIL = 'Novidade no Lux';
const GENRES = new Map([
 ['action','Ação'],['acao','Ação'],['ação','Ação'],['adventure','Aventura'],['aventura','Aventura'],
 ['drama','Drama'],['thriller','Suspense'],['suspense','Suspense'],['mystery','Mistério'],['mistério','Mistério'],
 ['romance','Romance'],['comedy','Comédia'],['comedia','Comédia'],['comédia','Comédia'],
 ['horror','Terror'],['terror','Terror'],['science fiction','Ficção científica'],['ficcao cientifica','Ficção científica'],
 ['ficção científica','Ficção científica'],['animation','Animação'],['animacao','Animação'],['animação','Animação'],
 ['documentary','Documentário'],['documentario','Documentário'],['documentário','Documentário'],
 ['family','Família'],['familia','Família'],['família','Família'],['fantasy','Fantasia'],['fantasia','Fantasia']
]);
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const text = value => typeof value === 'string' ? value.trim() : '';
const asArray = value => {
 if(Array.isArray(value)) return value;
 if(typeof value !== 'string') return [];
 try { const parsed=JSON.parse(value); if(Array.isArray(parsed))return parsed; } catch {}
 return value.split(/[,;|]/).map(s=>s.trim()).filter(Boolean);
};
function reliableYear(item) {
 const explicit=Number(item?.ano ?? item?.year);
 if(Number.isInteger(explicit)&&explicit>=1888&&explicit<=2100)return explicit;
 const match=text(item?.titulo ?? item?.title).match(/(?:^|[\s([])((?:19|20)\d{2})(?=[\s)\]._-]|$)/);
 return match ? Number(match[1]) : null;
}
function genresFrom(item) {
 const raw=[...asArray(item?.generos ?? item?.genres),...asArray(item?.categorias ?? item?.categories)];
 const out=new Set();
 for(const value of raw) {
  const name=typeof value==='string'?value:typeof value?.name==='string'?value.name:'';
  const mapped=GENRES.get(norm(name));
  if(mapped)out.add(mapped);
 }
 return [...out];
}
/**
 * referenceMatch deve ser fornecido APENAS após correspondência inequívoca
 * (ID TMDB verificado ou identidade equivalente), nunca fuzzy match isolado.
 */
export function classifyCatalogItem(item,{referenceMatch=null,nowYear=new Date().getFullYear()}={}) {
 const original=item&&typeof item==='object'?item:{};
 const sourceGenres=genresFrom(original);
 const trustedReference=referenceMatch?.verified===true?referenceMatch:null;
 const genres=[...new Set([...sourceGenres,...(trustedReference?genresFrom(trustedReference):[])])];
 const year=reliableYear(original) ?? (trustedReference?reliableYear(trustedReference):null);
 const rails=[...genres];
 if(year!==null&&year<=nowYear&&year>=1888)rails.push('Lançamentos de '+year);
 if(!rails.length)rails.push(FALLBACK_RAIL);
 return {rails,year,classification:trustedReference?'verified-reference':sourceGenres.length||year?'source':'fallback'};
}
export function buildCatalogRails(items,options={}) {
 const rails=new Map();
 for(const item of items??[]) {
  const referenceMatch=typeof options.resolveVerifiedReference==='function'?options.resolveVerifiedReference(item):null;
  for(const rail of classifyCatalogItem(item,{referenceMatch,nowYear:options.nowYear}).rails){
   if(!rails.has(rail))rails.set(rail,[]);
   rails.get(rail).push(item);
  }
 }
 return rails;
}

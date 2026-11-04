/* Stable TV display aliases. Original channel ids and media URLs are untouched. */
import {normalizeKey} from './media-taxonomy.js';
const known=new Map([
 ['sportv','SporTV'],['sport tv','SporTV'],['sportv 1','SporTV'],['sport tv 1','SporTV'],
 ['sportv 2','SporTV 2'],['sport tv 2','SporTV 2'],['sportv 3','SporTV 3'],['sport tv 3','SporTV 3'],
 ['bandsports','BandSports'],['band sports','BandSports'],['band tv sports','BandSports'],
 ['record','Record TV'],['record tv','Record TV'],['rede record','Record TV'],
 ['rede tv','RedeTV!'],['redetv','RedeTV!'],['globonews','GloboNews'],['globo news','GloboNews'],
 ['bandnews','BandNews'],['band news','BandNews'],['jovem pan news','Jovem Pan News'],
 ['rede vida','Rede Vida'],['cancao nova','Canção Nova']
]);
// Remove somente marcadores tecnicos no fim, sem apagar nomes como "Discovery HD Theater".
const TECH='(?:2160p|1080p|720p|480p|4k|uhd|fhd|full\\s*hd|hd|sd|hevc|h\\.?26[45]|x26[45]|hdr10?)';
const trailingVariant=new RegExp('(?:\\s*\\[(?:'+TECH+')\\]|\\s*\\((?:'+TECH+'|BR\\d+)\\)|\\s*[²³⁴]|\\s+(?:'+TECH+'))\\s*$','i');
const leadingQuality=/^(?:(?:4k|uhd|fhd|full\s*hd|hd|sd)\s*[:|]\s*|\[(?:4k|uhd|fhd|full\s*hd|hd|sd)\]\s*)/i;
export function canonicalTvName(raw) {
 const input=String(raw??'').trim();
 let cleaned=input.replace(/^\s*(br|bra|brasil)\s*[|:-]+\s*/i,'')
   .replace(leadingQuality,'').replace(/\s+/g,' ').trim();
 // "Premiere 6 SD ² [H265]" e "Premiere 6 FHD" devem dar o mesmo nome.
 for(let i=0;i<10;i++){
  const next=cleaned.replace(trailingVariant,'').trim();
  if(next===cleaned||!next)break;
  cleaned=next;
 }
 return known.get(normalizeKey(cleaned))||cleaned||input;
}

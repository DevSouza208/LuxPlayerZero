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
export function canonicalTvName(raw) {
 const input=String(raw??'').trim();
 const cleaned=input.replace(/^\s*(br|bra|brasil)\s*[|:-]+\s*/i,'')
   .replace(/\s*[\[(](?:2160p|1080p|720p|480p|4k|uhd|fhd|full\s*hd|hd|sd|hevc|h265|h264)[\])]/gi,' ')
   .replace(/\s+(?:2160p|1080p|720p|480p|4k|uhd|fhd|full\s*hd|hd|sd)\s*$/i,'')
   .replace(/\s+/g,' ').trim();
 return known.get(normalizeKey(cleaned))||cleaned||input;
}

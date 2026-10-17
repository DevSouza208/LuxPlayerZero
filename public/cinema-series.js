/**
 * Series organization in O(n) by explicit provider episode markers.
 * We do not infer missing episodes, stream URLs, season data or TMDB matches.
 * Original parsed entries remain untouched and are played by their source id.
 */
import {normalizeSearchText} from './media-taxonomy.js';
const PATTERNS=[
  /\bS(?:eason)?\s*0*(\d{1,2})\s*[- ._:]*E(?:pisode)?\s*0*(\d{1,3})\b/i,
  /\bT(?:emporada)?\s*0*(\d{1,2})\s*[- ._:]*E(?:pis[oó]dio)?\s*0*(\d{1,3})\b/i,
  /\b0*(\d{1,2})[xX]0*(\d{1,3})\b/,
  /\bTemporada\s+0*(\d{1,2})\s*(?:[- ._:]+)?(?:Epis[oó]dio|Ep\.?)\s*0*(\d{1,3})\b/i
];
function episodeDescription(name,matched) {
  const before=name.slice(0,matched.index).trim().replace(/[-–—|:\s]+$/,'').trim();
  const after=name.slice(matched.index+matched[0].length).trim().replace(/^[-–—|:\s]+/,'').trim();
  const normalized=before.replace(/^(?:s[eé]ries?\s*[:|]\s*)/i,'').trim();
  return {title:normalized,episodeTitle:after};
}
export function parseEpisodeLabel(raw){
  const text=String(raw||'').trim();
  for(const pattern of PATTERNS){
    const match=pattern.exec(text);
    if(!match)continue;
    const season=Number(match[1]),episode=Number(match[2]);
    if(!season||season>99||!episode||episode>999)continue;
    const extracted=episodeDescription(text,match);
    if(!extracted.title||normalizeSearchText(extracted.title).length<2)continue;
    return {showTitle:extracted.title,season,episode,episodeTitle:extracted.episodeTitle};
  }
  return null;
}
export function buildSeriesIndex(items){
  const groups=new Map(),byItemId=new Map();
  for(const item of items||[]){
    // Only explicit episode markers. The caller must supply the series catalog, not movies/TV.
    const parsed=parseEpisodeLabel(item.displayName||item.name);
    if(!parsed)continue;
    const key=normalizeSearchText(parsed.showTitle);
    if(!key)continue;
    let group=groups.get(key);
    if(!group){
      group={key,title:parsed.showTitle,representative:item,episodes:[],seasonMap:new Map()};
      groups.set(key,group);
    }
    const row={item,season:parsed.season,number:parsed.episode,title:parsed.episodeTitle};
    group.episodes.push(row);
    let episodes=group.seasonMap.get(row.season);
    if(!episodes){episodes=[];group.seasonMap.set(row.season,episodes)}
    episodes.push(row);
    byItemId.set(item.id,group);
  }
  const ordered=[...groups.values()];
  for(const group of ordered){
    group.seasons=[...group.seasonMap.entries()].sort((a,b)=>a[0]-b[0])
      .map(([number,episodes])=>({number,episodes:episodes.sort((a,b)=>a.number-b.number)}));
    group.episodes.sort((a,b)=>a.season-b.season||a.number-b.number);
  }
  const seen=new Set(),representatives=[];
  for(const item of items||[]){
    const group=byItemId.get(item.id);
    if(!group){representatives.push(item);continue}
    if(seen.has(group.key))continue;
    seen.add(group.key);representatives.push(group.representative);
  }
  return {groups:ordered,representatives,byItemId};
}

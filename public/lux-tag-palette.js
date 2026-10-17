/* 256 color slots from Lux Player 2.0: 32 hues × 8 tonal variations. */
import {normalizeKey} from './media-taxonomy.js';
const saturation=[82,76,88,72,84,78,90,74],lightness=[62,58,66,54,64,60,68,56];
export const TAG_PALETTE=Object.freeze(Array.from({length:256},(_,index)=>{
 const tier=Math.floor(index/32),hue=((index%32)*11.25+(tier%2?1.8:0))%360;
 return {solid:'hsl('+hue+' '+saturation[tier]+'% '+lightness[tier]+'%)',
 soft:'hsl('+hue+' '+saturation[tier]+'% '+lightness[tier]+'% / .16)'};
}));
const reserved={
 acao:31,aventura:3,romance:29,comedia:5,drama:24,terror:64,suspense:1,
 'ficcao cientifica':17,fantasia:25,misterio:22,crime:62,documentario:15,
 animacao:10,familia:4,guerra:34,faroeste:35,musica:27,historia:36,esportes:13,biografia:19,
 dublado:237,legendado:244,cinema:229,'4k':230,'full hd':231,hd:232,sd:233,hdr:234,hevc:235
};
function hash(value){let v=2166136261;for(const c of value){v^=c.charCodeAt(0);v=Math.imul(v,16777619)}return v>>>0}
export function tagColor(label){const key=normalizeKey(label),slot=reserved[key]??hash(key)%256;return TAG_PALETTE[slot]}

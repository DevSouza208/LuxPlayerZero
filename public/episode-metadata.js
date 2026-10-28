import {createPresentationMetadataClient} from './presentation-metadata.js';
// Return labels only for the provider season number that was requested.
export function seasonPresentation(number,metadata){
 const fallback='Temporada '+number;
 const candidate=metadata?.seasonNumber===number?metadata?.name:metadata?.seasons?.find(row=>row.number===number)?.name;
 const name=typeof candidate==='string'?candidate.trim().slice(0,120):'';
 const title=!name||/^(?:season|temporada)\s*\d+$/i.test(name)?fallback:name;
 return {title,caption:title===fallback?'':fallback,label:title===fallback?fallback:fallback+' · '+title};
}
// Metadata is presentation only: never modify provider entries or media URLs.
export function episodePresentation(row,metadata){
 const episode=metadata?.episodes?.find(e=>e.season===row.season&&e.number===row.number);
 const bits=['T'+row.season+':E'+row.number];
 if(episode?.runtime>0)bits.push(episode.runtime+' min');
 if(episode?.airDate&&/^\d{4}-\d{2}-\d{2}$/.test(episode.airDate))bits.push(episode.airDate.split('-').reverse().join('/'));
 if(episode?.rating>0&&episode?.voteCount>0)bits.push('★ '+episode.rating.toFixed(1));
 return {title:episode?.title||row.title||'Episódio '+row.number,info:bits.join(' · '),overview:episode?.overview||'',still:episode?.still||null};
}
export function createSeasonMetadataClient(options={}){
 const client=createPresentationMetadataClient({...options,timeout:10000});
 return (id,season)=>client({tmdbId:id,type:'tv',seasonNumber:season});
}

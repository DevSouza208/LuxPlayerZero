const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(cls)node.className=cls;return node};
const statuses={'Released':'Lançado','Post Production':'Pós-produção','In Production':'Em produção','Planned':'Planejado','Returning Series':'Em exibição','Ended':'Encerrada','Canceled':'Cancelada','Pilot':'Piloto'};
const jobs={'Director':'Direção','Screenplay':'Roteiro','Writer':'Roteiro','Novel':'Obra original','Original Music Composer':'Música','Director of Photography':'Fotografia','Producer':'Produção','Executive Producer':'Produção executiva'};
export function detailFacts(data){
 return [data.certification?'Classificação '+data.certification:null,data.releaseDate,
  data.runtime?Math.floor(data.runtime/60)+'h '+data.runtime%60+'min':null,
  ...(data.genres||[]),data.rating!=null?'★ '+data.rating.toFixed(1)+(data.voteCount?' · '+data.voteCount.toLocaleString('pt-BR')+' votos':''):null].filter(Boolean);
}
export function renderRichMetadata(root,data){
 root.replaceChildren();root.classList.add('tmdb-rich');
 const section=(title)=>{const s=el('section',null,'tmdb-rich-section');s.append(el('h2',title));root.append(s);return s};
 if(data.tagline)root.append(el('p',data.tagline,'tmdb-tagline'));
 const facts=section('Informações');const list=el('dl',null,'tmdb-facts');
 const field=(label,value)=>{if(value==null||value===''||Array.isArray(value)&&!value.length)return;list.append(el('dt',label),el('dd',Array.isArray(value)?value.join(', '):value))};
 field('Título original',data.originalTitle);field('Lançamento',data.releaseDate);field('Última exibição',data.lastAirDate);
 field('Duração',data.runtime?data.runtime+' minutos':null);field('Classificação no Brasil',data.certification);
 field('Avaliação TMDB',data.rating!=null?data.rating.toFixed(1)+'/10'+(data.voteCount?' · '+data.voteCount.toLocaleString('pt-BR')+' votos':''):null);
 field('Gêneros',data.genres);field('Situação',statuses[data.status]||data.status);field('Idioma original',data.originalLanguage);
 field('Idiomas',data.languages);field('Países',data.countries);field('Emissoras',data.networks?.map(x=>x.name));
 field('Temporadas no TMDB',data.seasonCount);field('Episódios no TMDB',data.episodeCount);
 const money=value=>value?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value):null;
 field('Orçamento',money(data.budget));field('Receita',money(data.revenue));field('Popularidade TMDB',data.popularity?.toFixed(1));
 field('Produção',data.companies?.map(x=>x.name));field('Criação',data.creators);facts.append(list);
 if(data.cast?.length){const s=section('Elenco'),track=el('div',null,'tmdb-cast');
  for(const person of data.cast){const card=el('article');if(person.photo){const img=el('img');img.src=person.photo;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();card.append(img)}card.append(el('strong',person.name),el('span',person.character));track.append(card)}s.append(track)}
 if(data.seasons?.length){const s=section('Temporadas registradas no TMDB');s.append(el('p','Informações da obra. Os episódios disponíveis para assistir são os da sua biblioteca.'));for(const season of data.seasons){const d=el('details');d.append(el('summary',season.name+(season.episodes!=null?' · '+season.episodes+' episódios':'')));if(season.date)d.append(el('p','Lançamento: '+season.date));if(season.overview)d.append(el('p',season.overview));s.append(d)}}
 if(data.crew?.length){const s=section('Equipe');for(const person of data.crew)s.append(el('p',person.name+' · '+(jobs[person.job]||person.job)))}
 if(data.videos?.length){const s=section('Trailers e vídeos');for(const video of data.videos){if(!/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(video.url))continue;const a=el('a',video.name+(video.official?' · Oficial':''));a.href=video.url;a.target='_blank';a.rel='noopener noreferrer';s.append(a)}}
 const gallery=[...(data.images?.backdrops||[]),...(data.images?.posters||[])];
 if(gallery.length){const s=section('Imagens'),track=el('div',null,'tmdb-gallery');for(const url of gallery){const a=el('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Abrir imagem');const img=el('img');img.src=url;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';a.append(img);track.append(a)}s.append(track)}
 if(data.keywords?.length){const s=section('Palavras-chave'),tags=el('div',null,'tmdb-keywords');for(const word of data.keywords)tags.append(el('span',word));s.append(tags)}
 if(data.reviews?.length){const s=section('Resenhas no TMDB');for(const review of data.reviews){const details=el('details');details.append(el('summary',review.author+(review.rating!=null?' · '+review.rating+'/10':'')),el('p',review.content));s.append(details)}}
 if(data.tmdbUrl){const a=el('a','Ver ficha no TMDB');a.href=data.tmdbUrl;a.target='_blank';a.rel='noopener noreferrer';root.append(a)}
}

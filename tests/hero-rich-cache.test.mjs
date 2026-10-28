import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/home.js',import.meta.url),'utf8');
const metadata=source.slice(source.indexOf('  const richCache='),source.indexOf('  const seasonMetadata='));
const renderer=source.slice(source.indexOf('  function renderHero() {'),source.indexOf('  function render() {'));
for(const details of [null,{tmdbId:1,type:'movie',overview:'Ficha carregada',tagline:'Frase'}])test('hero inicial e após metadados '+(details?'válidos':'indisponíveis')+' mantém cache sem erro ou repetição',async()=>{
 const nodes=new Map();const node=()=>({hidden:false,textContent:'',classList:{add(){},remove(){}},replaceChildren(){},append(){}});const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};let calls=0;
 const context=vm.createContext({Map,config:{heroMode:'movies',heroTitle:'Sua biblioteca',heroSubtitle:'Bem-vindo',summaryEngine:'tmdb',imageEngine:'tmdb'},showcase:{rails:{movies:[],series:[],tv:[]}},pinnedItem:null,heroItem:null,favorites:[],safeImage:()=>'',titleForDisplay:item=>item.name,itemKey:()=>'',queryFor:()=>({type:'movie'}),artworkFor:()=>'',cachedMetadata:item=>item?{status:'matched',tmdbId:1,overview:'Resumo'}:null,detailFacts:()=>[],renderFactBadges(){},setIconLabel(){},document:{createElement:node},$:get,createPresentationMetadataClient:()=>async()=>{calls++;return details}});
 vm.runInContext(metadata+renderer,context);context.renderHero();assert.equal(get('hero-title').textContent,'Sua biblioteca');assert.equal(calls,0);
 context.showcase.rails.movies.push({id:'c0',name:'Exemplo'});context.renderHero();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);context.renderHero();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(get('hero-subtitle').textContent,details?'Ficha carregada':'Resumo');
});

import {prepareCatalogText} from './catalog-prepare.js';
self.onmessage=event=>{
 const {id,text,baseUrl}=event.data||{};
 try{self.postMessage({id,items:prepareCatalogText(text,baseUrl)});}
 catch{self.postMessage({id,error:true});}
};

import {bodyJson,HttpError,reply} from './account-security.js';
import {cleanTvSchedule,emptyTvSchedule} from '../public/tv-feature-model.js';
const KEY='editorial/tv-highlights-v1.json';
export async function tvHighlightsApi(request,env,user){
 try{
  if(!user)throw new HttpError(401,'Entre novamente para continuar.');
  if(!['GET','POST'].includes(request.method))throw new HttpError(405,'Método não permitido.');
  if(request.method==='POST'&&user.role!=='admin')throw new HttpError(403,'Somente o administrador pode escolher os destaques.');
  if(!env.CATALOG_BUCKET?.get||!env.CATALOG_BUCKET?.put)throw new HttpError(503,'Destaques indisponíveis: confira o vínculo CATALOG_BUCKET.');
  if(request.method==='GET'){
   const object=await env.CATALOG_BUCKET.get(KEY);const schedule=object?cleanTvSchedule(await object.json()):emptyTvSchedule();
   return reply({schedule,canEdit:user.role==='admin'});
  }
  const body=await bodyJson(request,20000);let schedule;
  try{schedule=cleanTvSchedule(body.schedule)}catch(error){throw new HttpError(400,error.message)}
  schedule.updatedAt=Date.now();await env.CATALOG_BUCKET.put(KEY,JSON.stringify(schedule),{httpMetadata:{contentType:'application/json'}});
  return reply({schedule,canEdit:true});
 }catch(error){return reply({error:error instanceof HttpError?error.message:'Não foi possível carregar ou salvar os destaques.'},error instanceof HttpError?error.status:503)}
}

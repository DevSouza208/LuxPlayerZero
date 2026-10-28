import {metadataRequestBudget} from '../src/request-budget.js';
import { accountGate } from '../src/account-gate.js';
export async function onRequest({request,env,next}) {
  const limited=await metadataRequestBudget(request,env);if(limited)return limited;
  const blocked=await accountGate(request,env);if(blocked)return blocked;
  const response=await next();
  if(/^\/(?:account|cinema)(?:\/|\.html|$)/.test(new URL(request.url).pathname)){
    const privateResponse=new Response(response.body,response);
    privateResponse.headers.set('cache-control','no-store');return privateResponse;
  }
  return response;
}

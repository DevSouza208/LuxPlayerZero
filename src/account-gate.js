import { session, reply } from './account-security.js';
/** Page/API access only. Existing bridge authorization stays untouched. */
export async function accountGate(request, env) {
  const path=new URL(request.url).pathname;
  const cinema=/^\/(cinema(?:\/|\.html|$)|player\.html$)/.test(path);
  const privatePage=cinema||/^\/account(?:\/|\.html|$)/.test(path);
  const privateApi=path.startsWith('/api/metadata/');
  if(!privatePage&&!privateApi)return null;
  let user;try{user=await session(request,env)}catch{ return privateApi?reply({error:'Acesso indisponível.'},503):new Response('Acesso indisponível. Configure o serviço de contas e as migrações.',{status:503,headers:{'cache-control':'no-store'}}); }
  if(!user)return privateApi?reply({error:'Autenticação necessária.'},401):new Response(null,{status:302,headers:{location:'/', 'cache-control':'no-store'}});
  if(cinema&&!user.profile_id)return new Response(null,{status:302,headers:{location:'/account/', 'cache-control':'no-store'}});
  return null;
}

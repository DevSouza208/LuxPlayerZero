import { session, reply } from './account-security.js';
/** Page/API access only. Existing bridge authorization stays untouched. */
export async function accountGate(request, env) {
  const url=new URL(request.url),path=url.pathname;
  // Public PWA assets contain no user data.
  if(['GET','HEAD'].includes(request.method)&&['/cinema/install.js','/cinema/sw.js','/cinema/manifest.webmanifest'].includes(path))return null;
  // Public interface only. Private APIs retain their own authorization.
  if(['GET','HEAD'].includes(request.method)&&/^\/cinema\/?$/.test(path)&&url.searchParams.get('guest')==='1')return null;
  // Public title metadata contains no account/catalog data; lookup keeps its own
  // same-origin validation, bounded queries, D1 cache and daily quota.
  // TV guide is public schedule data, never user channels, playlist URLs or account data.
  if((request.method==='GET'&&['/api/metadata/status','/api/metadata/tv-guide'].includes(path))||
     (request.method==='POST'&&['/api/metadata/tmdb','/api/metadata/details'].includes(path)))return null;
  const cinema=/^\/(cinema(?:\/|\.html|$)|player\.html$)/.test(path);
  const privatePage=cinema||path.startsWith('/guide/')||/^\/account(?:\/|\.html|$)/.test(path);
  const privateApi=path.startsWith('/api/metadata/');
  if(!privatePage&&!privateApi)return null;
  let user;try{user=await session(request,env)}catch{ return privateApi?reply({error:'Acesso indisponível.'},503):new Response('Acesso indisponível. Configure o serviço de contas e as migrações.',{status:503,headers:{'cache-control':'no-store'}}); }
  if(!user)return privateApi?reply({error:'Autenticação necessária.'},401):new Response(null,{status:302,headers:{location:'/', 'cache-control':'no-store'}});
  if(cinema&&!user.profile_id)return new Response(null,{status:302,headers:{location:'/account/', 'cache-control':'no-store'}});
  return null;
}

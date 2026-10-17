import {authenticatedUser} from '../src/auth-core.js';
export async function onRequest({request,env,next}) {
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/auth/'))return next();
 if(!await authenticatedUser(request,env)){
   if(url.pathname.startsWith('/api/'))return new Response(JSON.stringify({error:'Faça login para continuar.'}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
   return Response.redirect(url.origin+'/',302);
 }
 if(url.pathname==='/player.html'||url.pathname==='/cinema.html')return Response.redirect(url.origin+'/cinema/',302);
 return next();
}

import {serveCachedArtwork} from '../../../../../src/artwork-route.js';
export const onRequestGet=({request,env,params})=>serveCachedArtwork(request,env,params);
export const onRequestHead=({request,env,params})=>serveCachedArtwork(request,env,params);

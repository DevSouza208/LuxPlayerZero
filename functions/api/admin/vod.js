import {vodAdminApi} from '../../../src/vod-api.js';
export const onRequest=({request,env})=>vodAdminApi(request,env);

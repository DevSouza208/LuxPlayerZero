import { editorialApi } from '../../../src/editorial-api.js';
export const onRequest = ({request,env}) => editorialApi(request,env);

import { catalogSearchApi } from '../../../src/catalog-search.js';
export const onRequest = ({request,env}) => catalogSearchApi(request,env);

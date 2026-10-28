import {serveCatalogVersion} from '../../../src/catalog-version.js';
export const onRequest=({request,env})=>serveCatalogVersion(request,env);

import { syncCatalog } from '../../../src/catalog-snapshot.js';
export const onRequestPost = ({ request, env }) => syncCatalog(request, env);

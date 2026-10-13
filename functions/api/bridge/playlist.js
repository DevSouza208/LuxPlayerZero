import { serveCatalog } from '../../../src/catalog-snapshot.js';
export const onRequestGet = ({ request, env }) => serveCatalog(request, env);

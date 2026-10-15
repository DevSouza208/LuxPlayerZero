import { lookupTmdb } from '../../../src/tmdb-metadata.js';
export const onRequestPost = ({ request, env }) => lookupTmdb(request, env);

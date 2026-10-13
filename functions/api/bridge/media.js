import { media } from '../../../src/bridge-core.js';
export const onRequestGet = ({ request, env }) => media(request, env);

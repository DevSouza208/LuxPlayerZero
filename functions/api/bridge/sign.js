import { sign } from '../../../src/bridge-core.js';
export const onRequestPost = ({ request, env }) => sign(request, env);

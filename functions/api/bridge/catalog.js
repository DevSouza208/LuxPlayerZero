import { catalog } from '../../../src/bridge-core.js';
export const onRequestPost = ({ request, env }) => catalog(request, env);

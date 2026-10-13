import { status } from '../../../src/bridge-core.js';
export const onRequestGet = ({ request, env }) => status(request, env);

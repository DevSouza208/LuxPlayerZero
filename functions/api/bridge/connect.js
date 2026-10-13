import { connect } from '../../../src/bridge-core.js';
export const onRequestPost = ({ request, env }) => connect(request, env);

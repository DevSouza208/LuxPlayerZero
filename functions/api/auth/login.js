import { login } from '../../../src/auth-core.js';
export const onRequestPost = ({request,env}) => login(request,env);

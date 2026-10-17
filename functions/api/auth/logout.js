import { logout } from '../../../src/auth-core.js';
export const onRequestPost = ({request,env}) => logout(request,env);

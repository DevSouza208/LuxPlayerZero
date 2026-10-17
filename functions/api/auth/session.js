import { sessionStatus } from '../../../src/auth-core.js';
export const onRequestGet = ({request,env}) => sessionStatus(request,env);

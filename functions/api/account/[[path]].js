import { accountApi } from '../../../src/account-api.js';
export const onRequest = ({request,env}) => accountApi(request,env);

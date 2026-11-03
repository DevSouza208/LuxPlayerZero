import {maintenanceRequest} from '../../../src/maintenance-api.js';
export const onRequest = ({request,env}) => maintenanceRequest(request,env);

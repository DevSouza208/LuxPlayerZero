import {liveMetadata} from '../../../src/live-metadata.js';
export const onRequestPost=({request,env})=>liveMetadata(request,env,'details');

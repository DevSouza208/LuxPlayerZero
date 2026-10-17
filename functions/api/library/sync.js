import { librarySync } from '../../../src/library-core.js';
export const onRequestPost=({request,env})=>librarySync(request,env);

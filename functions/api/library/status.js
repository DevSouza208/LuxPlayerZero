import { libraryStatus } from '../../../src/library-core.js';
export const onRequestGet=({request,env})=>libraryStatus(request,env);

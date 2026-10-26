import { importGuestPlaylist } from '../../../src/guest-playlist.js';
export const onRequest = ({ request, env }) => importGuestPlaylist(request, env);

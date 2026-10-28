# Lux Zero icon refresh

Feather Icons (MIT, Cole Bemis), selected from the SVG Repo Feather collection:
https://www.svgrepo.com/collection/feather-icons/
Original vectors: https://github.com/feathericons/feather
License: public/assets/icons-LICENSE.txt. Picture-in-picture is a local companion vector.

24px grid, 1.8px rounded strokes, currentColor. Play, pause and selected hearts use fill.
Navigation, login, search, source actions, cards, favorites, details, trailers and player share this family. Brand/provider logos stay intact. Local SVGs need no external requests.

The app.js and cinema-app.js baseline hashes were updated only for the reviewed presentation changes: channel glyphs, arrows and source/reconnect button labels. Playback, URLs, authentication and catalog logic are unchanged.

Validation: 208 of 209 local tests passed. The remaining login asset check cannot pass in this text-only checkout because original PNGs could not be downloaded through the connector. Original assets are unchanged in GitHub. Browser smoke was attempted but Chromium is unavailable and its download failed; visual/mobile/remote and actual playback validation remain pending. No production deployment claimed.

## Second pass

Fixed runtime navigation labels removing the movie/series icons. Added icons to profile actions/avatars, upload, guide, connection retry, next episode, watched state and administrative actions; added favorite aria-pressed and synchronized fullscreen tooltip. Mobile header targets are at least 44px.

Cloud-browser review of the deployed guest preview confirmed home, source import using the public demo, details, favorite state change and fullscreen entry. The demo media returned an unsupported-source error in this environment, so playback itself is not verified. Preview login returned a missing database/authentication configuration message; private account screens could only be reviewed in source. Mobile/TV device testing remains pending. GitHub Actions failed without any recorded steps or retrievable logs.

## Filtro do catálogo

O controle de filtro do Cinema usa o vetor filter da mesma família Feather, com grade de 24px e traço 1.8 arredondado. O SVG é local, tem 20px visuais e área de toque de 44px. O rótulo fica disponível para tecnologia assistiva e tooltip, sem texto visível ou seta.

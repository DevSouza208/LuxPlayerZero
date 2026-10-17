# Lux Zero Visual System (DESIGN.md)

The Lux identity is a refined dark streaming experience, not a generic AI dashboard. The visual source of truth is the actual login screenshot and the strongest screens of Lux Player 2.0, including its Visual Design Constitution.

## Real tokens from existing CSS
- Login: background #08070e, text #f7f4ff, secondary #c1b9d1, muted #807a91.
- Violet #9c7bff and #b38aff, lilac #cbb9ff, occasional pink #fa92d1.
- Cinema: near-black #050407 / #07060b and user-content artwork, with scrims for contrast.
- Typography: DM Sans for login text and forms, Outfit for Cinema and expressive headings; existing Space Grotesk stays only where intentional.
- Contextual category colors: TV blue, Movies warm/coral, Series indigo/lilac. Avoid turning the entire app neon.
- Components: small measured radii for fields, comfortable poster rounding, pill season chips, semantic tag colors from the 256-tone taxonomy.

## Layout anchors
LOGIN: split-screen layout on desktop, LuxPlay identity, single clear Lux ID form action and mascot collage; on phone, collapse for readability. No fake working buttons, no permanently visible boot splash, no dead demo links.
HOME: immersive backdrop with large editorial title and visible play action, compact navigation, rails and real catalogs, meaningful skeleton/loading/error states.
MOVIES: full-viewport hero/detail, TMDB backdrop/poster only when matched, description, source metadata, primary Play; never narrow-card modal.
SERIES: same full-viewport identity, tabs per actual season and 16:9 playable episode cards, maintain selected season when returning.
PLAYER: video dominates full viewport; controls/timeline in lower overlay, top back button, HUD hides when idle and is reachable by touch, keyboard and remote.
TV: one logical tile for channels with multiple quality/source variants, selection for real provider URLs, distinct identity for different tvg-id.

## Review protocol (adapted from Impeccable)
1. Audit/critique hierarchy, readability, error states and fake interactions.
2. Clarify/distill ornamental labels, needless glass cards, dead links and fabricated content.
3. Polish fonts, type scaling, poster cropping, focus, hover, scrims and spacing.
4. Adapt and harden to 320px phones, landscape, slow metadata, missing images and accessibility.
5. Optimize without breaking underlying stream identity or increasing O(N) work on every search keystroke.
6. Compare screenshots and perform genuine browser tests before marking visual work completed.

Prior design: https://github.com/DevSouza208/LuxPlayer2.0/blob/main/docs/visual-design-constitution.md

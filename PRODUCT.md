# Lux Player Zero Product Contract

Lux Player Zero is a Cloudflare-native, authenticated streaming player for authorized user-provided M3U/Xtream sources. It does not provide its own TV or film streams.

## User journey
1. Loading checks session and, if available, restores the private catalog.
2. Login verifies Lux ID using the D1-backed server API; do not simulate success or claim credentials were sent when they were not.
3. Home opens only for a valid session. Absent catalog shows an honest setup or empty state.
4. TV/Movies/Series browsing supports pagination, source categories, tags and matching TMDB artwork as available.
5. Movie and Series details open full-screen. Series expose only genuinely present seasons and episodes.
6. Fullscreen player uses the existing HTML video engine. Back returns to the detail and preserves the selected season.
7. TV groups variants by reliable EPG ID or normalized identity while preserving every original source.

## Source correctness
Original M3U never changes because of display cleaning. HTTPS playlist snapshots in R2 do not guarantee HTTPS playback for embedded streams. Credentials remain in Cloudflare secrets, never in GitHub, public HTML, localStorage or UI logs. Treat ratings, synopses, qualities, years and seasons as unknown until backed by source metadata.

## Release status
The public main may still show the original demo login. PR #14 contains the new Lux ID/auth and Cloudflare integration; PR #15 adds immersive Cinema and grouped TV, stacked over #14. Neither being green in GitHub Actions alone means deployed or verified on a real browser.
Production requires D1 and R2 bindings and login/source secrets configured privately on Cloudflare, explicit integration review and real playback tests. Weak 4-digit admin passwords are not appropriate for a public production service.

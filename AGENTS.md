# Lux Player Zero: Working Agreement

Read DESIGN.md and PRODUCT.md before changing the app. Lux Zero runs vanilla JS and CSS on Cloudflare Pages + Pages Functions + D1 + R2, with a separate scheduled Worker. Do not migrate to React/Next.js, Supabase, or Vercel simply to apply a coding skill.

## Approach
- Inspect source, dependencies and tests first, then implement in reviewable commits and run CI.
- Apply Impeccable's critique, clarify, polish, adapt and harden methods to the existing Lux look.
- Take from frontend-design its discipline of explicit tokens and content truth, not its obligation to change the brand aesthetic.
- Apply Vercel's general performance advice (parallel independent fetches, avoid waterfalls, Maps/Sets, DOM batching, small bundles); React hooks and Next.js prescriptions do not fit this repo.
- Use Awesome Codex Skills for selecting specific code-review, webapp-testing and CI-fix workflows. Never run remote install scripts blindly.
- Confirm mobile, keyboard, TV remote and PWA behavior; test real playback separately from unit tests.
- Prefer feature branches and draft PRs. No production deploy, merge or claim of Cloudflare configuration until verified.

## Non-negotiable guarantees
- Original M3U entries and media URLs remain untouched by normalization, TMDB enrichment, episode grouping and TV grouping.
- Delivering a playlist over HTTPS does not turn its internal HTTP streams into HTTPS.
- Never commit source credentials, signed URLs, admin passwords, session keys, authorization tokens or full URLs containing username/password.
- Every private route and API requires server-side authorization; UI hiding alone is insufficient.
- Display real states: disabled/unavailable OAuth and incomplete features cannot act like working features.
- Never fabricate a TMDB result, series episode, program guide entry, watch progress or source quality.
- Avoid injection: textContent for untrusted source text, strict URL validation for image or API links.
- Keep the current HTMLVideoElement/Hls.js/Mpegts.js playback engine intact when refining the visual UI.
- Test accessibility, focus, touch targets, readable contrast, no-data/loading/error states, and prefers-reduced-motion.

References: https://impeccable.style/ ; https://github.com/Ilm-Alan/frontend-design ; https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices ; https://github.com/composio-community/awesome-codex-skills

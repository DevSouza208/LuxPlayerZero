# Login still shows 'Lux ID connection is being prepared'

Observed screenshot: the Login screen with message that no credential was sent and the link to explore the demo.

Confirmed code provenance: main branch head was 20aa1fdbc07561c68780e48fe7d7ce3fdf9d90e2. The D1-backed login implementation is in draft PR #14, and the new Cinema interface is in stacked draft PR #15. Neither was merged when checked. Therefore the screenshot is consistent with the OLD placeholder frontend; typing admin there cannot authenticate.

To activate a real login:
1. Review PR #14 on a test deployment. Do not blindly merge merely to remove the warning.
2. Configure Pages D1 binding named DB and a private LUX_SESSION_SECRET of at least 32 characters.
3. Set LUX_ADMIN_BOOTSTRAP_PASSWORD only as a private test/staging secret. Use a strong admin password before public access.
4. Configure CATALOG_BUCKET R2 and the private source settings LUX_STARTER_M3U_URL, BRIDGE_ACCESS_KEY, BRIDGE_ALLOWED_HOSTS as documented in docs/IMPLANTACAO-ZERO.md.
5. Deploy the approved branch and verify the deployed commit SHA. Confirm POST /api/auth/login, GET /api/auth/session, logout, unauthorized /cinema/, invalid passwords, and no credential leakage.
6. Validate the browser UI and actual media source behavior; then consider merging PR #15.

An authentic UI should report 'Login not configured on this environment' for HTTP 503, not a false or deceptive success. Visible Google/Discord recovery flows are future integrations until implemented.

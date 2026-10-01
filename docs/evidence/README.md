# Local evidence — synthetic data only

Screenshots: actual Chromium rendering at 1440/834 px, EN/ES. Login runs without a session. Detail uses sample venues and servers injected by the test transport; neither the names nor counts represent real DEV data.

browser-smoke.json records the thirteen focused browser checks from tests/browser-smoke.mjs. Six additional unit tests cover signal classification, safe error mapping and equal/nonempty locale catalogs. Live profile/API authorization and recovery email verification remain pending Tom's DEV handoff.

Independent Gaby review covered Auth, access scopes, RPC fields and grants. Its stale invalid-callback flag finding was fixed by clearing callbackInvalid on successful login; a browser regression check covers invalid callback → login → password change. Logout races found during integration were fixed and covered by the interrupted-logout check.

# PE-368 resumed acceptance — 8f77fcfd-f7c4-4061-b352-f1f36ac59474

2026-10-04, same session as Gaby review. Supersedes the pending live verification in the parent README.
Application commit e47a5908ec2052f42784aed5b7ad2f3b195e21eb, republished only to playerp.dev.

- live.json: repeated Tom's backend `_tests/pe368-owner-invite-e2e/owner-invite-e2e.mjs` against the actual published portal and DEV backend. Seven checks passed, no API mocks. New owners completed invitation and password setup, including a real 422 same_password retry, accessed with portal_access=false, managed each other, and could not remove/demote themselves (409 cannot_change_self). Baseline and final membership states match (three owners including Tom's deliberately pending invitation; twelve visible members).
- management-ui.json: six browser checks on the published portal with synthetic API replies. Explicit invitation/appointment/demotion/removal confirmations, cancellation, last_owner and other localized error messages, English/Spanish at 390/1440px. These are UI contract tests, not proof of live authorization.
- publication.json: deployed HTML, JS and CSS are byte-identical to the local build from the application commit. HTTP 200. Publication connector also checked /admin HTTP 200.
- first-attempt.json: first live attempt timed out before the second invitation's password form. No JavaScript error was reported; data were restored. Cause not established. A fresh full repetition passed. An earlier Chromium launch failed due to its read-only crash-report directory before any invitation; using installed Chromium headless shell resolved that test-environment issue.

Commands: `npm test` (80 passed); `npm run build` (passed); `PORTAL_TEST_ORIGIN=https://playerp.dev.bmore.app node tests/owner-management-states.mjs` with installed headless shell; Tom's real browser script copied to the run's verification directory to resolve its ../portal config path, private fixture paths supplied by environment. A catch-only page diagnostic was added locally for the repetition and did not execute on success.

Backend prerequisite and Tom's real last-owner database guard evidence remain in backend main 31b1acb5fae4630c682e509309372120f927aed1. Its reverted SQL block rejected removing or demoting the final owner. No backend or PROD changes in this session. Sink mailboxes verify Auth-issued invitation links, not delivery to a human inbox (Beny already confirmed receipt).

Gaby independently reviewed the implementation and existing real evidence read-only in this session: approved, no verifiable defects. Gaby also reviewed the final repeated results and publication hashes: approved, no findings; the earlier timeout is disclosed above. No credentials, tokens or password files are included here.

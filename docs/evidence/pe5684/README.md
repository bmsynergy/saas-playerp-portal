# PE-568.4 — Maintenance venue list and detail

Base portal: f0d6c46184cb366202707125335c7b6ed4182749, branch uma/portal-dev-resume.
Backend dependency already in main and DEV: 906bbf25a995377b63ee2a985398f46b28731082 (PE-568.3).

- `npm test`: 385 tests, 41 files passed.
- `npm run build`: passed.
- `npm run build:prod`: passed **offline, with a synthetic publishable key and the Auth settings response stubbed by a Node preload outside the source tree**. No production request or credential was used. `rg -l fzwzmwstxlsxdzdmphyq dist` returned no matches. This checks bundle isolation, not real production credentials or deployment readiness. Production config guards are unchanged.
- Lily implemented the presentation. Gaby reviewed the final diff read-only in this same session against all three acceptance criteria and found no verifiable defects. Live browser/backend implementation verification remained with the principal agent.
- `tests/maintenance-venues-live.mjs` is the single acceptance pass for the published DEV site, using existing QA fixtures and real RPCs without changing any data. Run with `node tests/maintenance-venues-live.mjs`; local app smoke check permits only 127.0.0.1:18791 and still uses DEV.

Local browser smoke passed: 133 venues, 25 rows/page, disjoint page 2, QA-120 Sede 117 found by server search. QA-120 Sede 045 detail shows its two error nights, archived attempt and tasks, filters in URL, server task search and reload. Pointer styles have no outline or focus shadow; keyboard Tab restores the indicator. No existing overview/search/recipient RPC was altered.

Publication is exclusively through `coredeva-publish playerp.dev <commit>` from a clean remote commit. The final delivery includes the actual published SHA and the acceptance output from the DEV origin.

Published application commit: `6abb56eb64edacc08c835ecfd3067ee1b2f65019`, verified on GitHub with `git ls-remote origin refs/heads/uma/portal-dev-resume`. Connector publication to playerp.dev returned HTTP 200 without rollback. The real-site acceptance pass (`acceptance.json`) passed all three criteria, including the calculated pointer/keyboard styles; no application exceptions were observed. Screenshots are included for the venue list, search and QA045 detail. The response collector was adjusted to avoid reading Chromium response bodies released on reload; Gaby separately reviewed that final test-only diff and confirmed the acceptance assertions remain intact.

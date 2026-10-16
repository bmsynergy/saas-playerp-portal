# PE-467.3 — local portal check

Base PE-466: 87bb74de818192f110444611f50cbc1db70046b3. Increment only; no shared RPC removed.

`npm run build`: PASS (existing bundle size warning). `npm test`: 32 files / 312 tests PASS.
`node tests/pe466-ai-browser.mjs`: PASS against localhost:18799 with intercepted synthetic API, **not DEV evidence**.

`ui-contract.json` groups the form, request, pagination and keyboard checks. There are exactly two search inputs, one status select and a Search button, and no account-option requests. Search restarts page 1; pagination retains applied venue/owner/status even when a new draft is being typed. `p_tenant: null` preserves the public RPC signature without account filtering.

The screenshots show desktop, mobile and keyboard focus. Status reuses `native-select-wrap`, a white surface, portal border/height/type tokens and 2px discreet focus. No global focus changes. Search input backgrounds remain transparent inside the normal bordered control.

DEV registry and DEV SQL calls were rejected with “MCP tool call requires approval, but approval policy is never”. These local checks do not substitute for publication, real network verification or mail delivery in DEV.

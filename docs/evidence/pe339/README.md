# PE-339.2 — portal certificate download

The shared owner/admin venue panel uses `ps_panel_ca_cert` with the user's session and selected venue. Only a public certificate is downloaded. A single PEM block is accepted, its DER SHA-256 is computed with WebCrypto and must equal `ca_cert_der_sha256`. The bytes stay unchanged; the filename is `playerp-<venue UUID>-ca.crt` for device import. The PEM text hash is never shown as the device fingerprint. These checks do not independently establish X.509 chain validity or that the CA signs the physical server.

Missing CA or missing/invalid DER metadata produces a pending state without a download button. The UI contains the installation and trust instructions in English and Spanish. A changed fingerprint between panel and download is explicitly warned about. It does not install or replace certificates automatically.

Backend dependency is already versioned in `bmsynergy/saas-playerp-backend`, branch `tomjr/pe339-ps-ca-cert-der-dev`, commit `72b9a70`, migration `20261002230000_pe339_ps_ca_cert_der_fingerprint.sql`. No backend, firmware or POS changes in this step.

## Validation scope

- `npm test`: 69 passing unit tests, including DER/hash mismatch, malformed PEM, private-key refusal, pending state and venue RPC arguments.
- `node tests/certificate.mjs`: browser download and mobile checks against explicitly intercepted fixtures, NOT proof of live backend authorization. Downloads from owner/admin EN/ES are byte-identical to the public test certificate and use the same venue filename. The public test certificate is not for installation on actual devices; its private key was discarded.
- Backend live query in this session was rejected by the tool: `MCP tool call requires approval, but approval policy is never`. No real-session verification is claimed. Handoff is needed to compare real owner/admin downloads, confirm foreign-venue/anonymous denials, and check the real pending-CA response on DEV.

## Device verification for Beny

Open https://playerp.dev.bmore.app on the POS itself, sign in as an authorized venue owner, select the venue and open Print Servers. Download the certificate and compare its displayed SHA-256 fingerprint with the device's certificate details. On iPad/iPhone, install its profile, then separately enable full trust in Settings → General → About → Certificate Trust Settings. On Windows, import it into Trusted Root Certification Authorities for the POS user/device. Open the Print Server's stable HTTPS hostname on the local network and check that there is no certificate warning. Repeat after its IP changes, keeping the same hostname. Physical device installation and HTTPS verification remain for Beny.

Official guidance used for the manual trust instructions: [Apple](https://support.apple.com/en-au/102390) and [Google Pixel](https://support.google.com/pixelphone/answer/2844832?hl=en).

Published portal commit: `11a464ef910ae2a18d51472df2c97f1d5f364ccc`. The same 9 fixture browser checks also passed against https://playerp.dev.bmore.app after publication (`hosted-browser-fixtures.json`); network responses for auth/RPC remain intercepted. Existing Print Server smoke regression: 14 checks passed locally, with fixtures. Gaby's independent read-only review in this session returned no findings. The temporary test Vite process was stopped.

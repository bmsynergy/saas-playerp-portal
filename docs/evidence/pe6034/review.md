# Independent check in this run

Gaby reviewed the implementation and fixture evidence read-only, against PE-603.4, within the 15-minute budget. No backend or physical device actions.

- Canonical URL validation: no security defect found; only reported HTTPS URL matching hostname, port and root path is accepted.
- Owner/admin gates and responsive evidence: no blocking defect found. Synthetic evidence covers both roles, EN/ES, 390/1440, invalid URLs, failed reads and long strings; live RPC facts confirm inventory/runtime identity handling.
- Minor observation: the displayed address was plain text beside the portal button. Corrected: the address itself now links to the same validated canonical URL, preserving the explicit button. Gaby reviewed this delta and confirmed closure.
- Integration review additionally restricted certificate admin controls to admin scope when the account also has an admin role. This does not change backend authorization. Owner fixture intentionally reports the platform-admin flag to cover this case.

No review or simulated test establishes mDNS resolution or login on Beny's physical LAN.

Gaby also reviewed the final admin-scope certificate guard and the scoped badge wrapping correction; no findings. Real DEV data exposed a 390→398 px overflow in the English enrollment-confirmed badge. The fixture now includes that state and the sheet's badge wraps within its facts grid.

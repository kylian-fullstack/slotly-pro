# Identity and tenancy threat model

| Threat | Control | Passing evidence |
| --- | --- | --- |
| Session theft at rest | Opaque random token; only SHA-256 digest persisted; HttpOnly/SameSite cookie | session integration and cookie unit tests |
| Session fixation | New token on login; transactional rotation primitive; privilege changes revoke sessions | session lifecycle integration and API flow |
| CSRF | SameSite cookie, trusted-origin check and session-bound HMAC token | pipeline/security unit tests and rejected API mutation |
| Credential enumeration | Identical public error for missing account and bad password plus dummy Argon2 work | login contract and production API flow |
| Replay and duplicate creation | Request fingerprint plus PostgreSQL idempotency record; invitation row lock | concurrent integration tests and API replay tests |
| Privilege escalation | Deny-by-default role matrix; actor and target reloaded in the selected tenant | policy matrix and owner/admin/staff API flow |
| Tenant escape | Organization comes only from an active server-side session; scoped SQL predicates; composite foreign key | cross-tenant database test and rejected caller-supplied identifier |
| Last owner removal | Organization row lock and owner recount in the mutation transaction | concurrent database test and HTTP last-owner rejection |
| Audit tampering | Append-only database trigger and restricted operation surface | direct update/delete integration test |
| Brute-force attempts | Shared PostgreSQL fixed-window limiter on login, registration and invitation acceptance | threshold and recovery integration test |
| Secret leakage in logs | Fixed-field structured logger; raw bodies, headers, tokens and credentials are not accepted | logging redaction unit test |

Residual risks: no external identity provider, MFA, live mail delivery, compliance certification or distributed edge limiter is claimed in this slice.

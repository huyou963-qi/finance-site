# Weekly publisher OAuth design

Replace the MCP adapter's static Bearer gate with a narrow OAuth 2.1 authorization server on the existing site. Only ChatGPT's stable CIMD client is accepted, with the stable issuer-identified redirect URI and PKCE S256. The existing admin session is the only authority allowed to approve weekly-report:write.

Schema coordination notice: this PR adds public OAuth consent, grant and hashed credential tables. These represent authorization facts, not market data or a parallel report store. Codes are short-lived and single use; access tokens expire; rotating refresh tokens support cloud scheduled tasks. Revocation and live admin-role checks invalidate grants. Raw credentials never enter persistence or logs.

Reuse: existing auth sessions, Prisma/PostgreSQL, existing fixed POST /api/weekly-reports ingest, existing WEEKLY_REPORT_INGEST_TOKEN, report validation and writer. Production deploy already executes npm run db:migrate. No new secrets are required.

Acceptance: automated validation and race/replay tests, repository CI, production metadata and unauthenticated challenge checks, then owner-admin OAuth handoff. Publication and schedule creation follow a real report receipt only.

## Endpoints and lifetime

- MCP: `https://gekkotech.cn/api/weekly-reports/mcp`; anonymous initialization and tools/list, OAuth-required tools/call. GET supplies an HTTP 401 discovery challenge.
- RFC 9728: `/.well-known/oauth-protected-resource/api/weekly-reports/mcp` (also the root discovery alias).
- RFC 8414: `/.well-known/oauth-authorization-server`.
- Authorization/token/revocation: `/api/oauth/weekly/authorize`, `/api/oauth/weekly/token`, `/api/oauth/weekly/revoke`.
- Exact accepted client: `https://chatgpt.com/oauth/client.json`. Fetch only this URL, no redirects, 5-second deadline, 32-KiB cap; verify identity, published redirect URI and support for the public `none` method.
- Exact callback: `https://chatgpt.com/connector_platform_oauth_redirect`. All successful and denied authorization callbacks echo the original state and fixed issuer (RFC 9207). Malformed requests fail locally and never redirect.
- Scope: `weekly-report:write`; exact resource and scope at authorization, token exchange and every resource access.
- Consent nonce: 10 minutes, hashed, existing admin login session and Secure HttpOnly browser cookie binding. Same-origin POST approval only; no auto-approval.
- Authorization code: 2 minutes, SHA-256 only, atomically consumed; bound to client, callback, resource and S256 PKCE verifier. A valid replay revokes its grant.
- Access token: at most 1 hour, random 256-bit opaque value; only SHA-256 stored.
- Refresh token: rotates on every use, 90-day idle timeout; grant maximum 365 days. Reuse revokes the family. At the hard expiry, the owner must authorize again.

RFC 7009 revocation accepts a token and the fixed public client identity at the revocation endpoint; it revokes the entire grant. Site operators can also revoke a grant by setting its `revokedAt` in the database. Expiration, revocation, account deletion and current admin-role loss prevent both access and renewal. The dedicated OAuth Prisma client disables query/error logging; handlers sanitize failures.

No test publishes a fixture to production. CI includes isolated PostgreSQL, applies the actual new migration, and tests concurrent exchange, replay, rotation, expiry, revocation, demotion, CSRF and session binding. Local test runners may require `node --import tsx --test` when the executor disallows the tsx CLI's Unix socket.

Production deployment uses the unchanged main-triggered GitHub Actions tar deployment, including `npm run db:migrate`. Check public metadata and OAuth challenges after deployment, then create the ChatGPT MCP connection with OAuth/CIMD. Hand administrator login and approval to the owner. Only after a real previous-week report returns 200/201, id and matching weekEnding may the standalone cloud schedule be created.

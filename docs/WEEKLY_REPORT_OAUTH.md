# Weekly publisher OAuth design

Replace the MCP adapter's static Bearer gate with a narrow OAuth 2.1 authorization server on the existing site. Only ChatGPT's stable CIMD client is accepted, with the stable issuer-identified redirect URI and PKCE S256. The existing admin session is the only authority allowed to approve weekly-report:write.

Schema coordination notice: this PR adds public OAuth consent, grant and hashed credential tables. These represent authorization facts, not market data or a parallel report store. Codes are short-lived and single use; access tokens expire; rotating refresh tokens support cloud scheduled tasks. Revocation and live admin-role checks invalidate grants. Raw credentials never enter persistence or logs.

Reuse: existing auth sessions, Prisma/PostgreSQL, existing fixed POST /api/weekly-reports ingest, existing WEEKLY_REPORT_INGEST_TOKEN, report validation and writer. Production deploy already executes npm run db:migrate. No new secrets are required.

Acceptance: automated validation and race/replay tests, repository CI, production metadata and unauthenticated challenge checks, then owner-admin OAuth handoff. Publication and schedule creation follow a real report receipt only.

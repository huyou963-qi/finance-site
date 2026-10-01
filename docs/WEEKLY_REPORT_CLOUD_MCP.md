# GekkoTech weekly report cloud MCP

## Scope and reuse

Endpoint: `https://gekkotech.cn/api/weekly-reports/mcp` (stateless Streamable HTTP; JSON responses; MCP 2025-03-26, 2025-06-18, 2025-11-25).

Only business tool: `publishWeeklyMarketReport({ meta, bodyMarkdown })`.
It POSTs the complete payload to the fixed existing `https://gekkotech.cn/api/weekly-reports` URL.
Redirects are refused. No caller-controlled destination, read tool, deletion tool, relay, or extra publishing channel exists.
GET/DELETE return 405; initialize, notifications, ping, and tools/list are protocol operations only.

Reuse: existing POST route, `parseWeeklyReportMeta`, `upsertWeeklyReport`, and `WeeklyReport` storage.
New: transport adapter, OAuth authorization records, and contract/security tests. No parallel report writer or report store.

The tool updates an existing report for the same weekEnding, matching the current ingest API; it is not append-only.
Success requires actual upstream HTTP 200/201 plus id and the matching weekEnding.
It returns `{ httpStatus, id, weekEnding }`. Failures and uncertain timeouts are explicitly marked.

## Credentials

The MCP endpoint uses administrator-approved OAuth 2.1, never the ingest credential.
See [OAuth design and operations](WEEKLY_REPORT_OAUTH.md).
Only the server-internal forwarding POST reads the existing production
`WEEKLY_REPORT_INGEST_TOKEN`. No credential belongs in an MCP header configuration,
manifest, prompt, report or tool argument. No new production secret is required.

## Deploy and acceptance

Use the repository feature branch/PR/CI process and existing Actions production deployment.
After deployment, connect the plugin to the endpoint and complete OAuth through the host UI and personally approve using the site admin session.
Preserve the private plugin identity and the existing weekly-market-scan-web Skill and research references.
A packaged OpenAPI file alone does not establish an executable tool.

Run the previous completed trading week's full report in ordinary cloud chat.
Require a receipt showing HTTP 200/201, id, weekEnding before creating any schedule.
Only then create a standalone Cloud task with the installed plugin and Skill selected:
Saturday 08:00 Asia/Shanghai, starting each run from its saved prompt.
Record each full report and publish receipt/failure in Scheduled; no PC folder, local browser session, or local scheduler is required.

Mock tests run automatically in existing CI. They cover authentication, origins, one-tool inventory,
transport, complete input, size limits, fixed destination, redirects, 200/201 receipts,
mismatched receipts, and sanitized failures. They never publish fixture reports to production.

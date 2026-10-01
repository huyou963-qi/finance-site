# GekkoTech weekly report cloud MCP

## Scope and reuse

Endpoint: `https://gekkotech.cn/api/weekly-reports/mcp` (stateless Streamable HTTP; JSON responses; MCP 2025-03-26, 2025-06-18, 2025-11-25).

Only business tool: `publishWeeklyMarketReport({ meta, bodyMarkdown })`.
It POSTs the complete payload to the fixed existing `https://gekkotech.cn/api/weekly-reports` URL.
Redirects are refused. No caller-controlled destination, read tool, deletion tool, relay, or extra publishing channel exists.
GET/DELETE return 405; initialize, notifications, ping, and tools/list are protocol operations only.

Reuse: existing POST route, `parseWeeklyReportMeta`, `upsertWeeklyReport`, and `WeeklyReport` storage.
New: transport adapter plus mock contract/security tests. No migration, parallel writer or report store.

The tool updates an existing report for the same weekEnding, matching the current ingest API; it is not append-only.
Success requires actual upstream HTTP 200/201 plus id and the matching weekEnding.
It returns `{ httpStatus, id, weekEnding }`. Failures and uncertain timeouts are explicitly marked.

## Credentials

The owner must rotate `WEEKLY_REPORT_INGEST_TOKEN` in the production runtime outside source control, then personally enter the same value in the host's Bearer authentication settings.
No credential value belongs in a manifest, MCP tool argument, prompt, skill, report, source, or log.
The adapter never logs requests, headers, report bodies, exceptions or upstream error bodies.
It validates Bearer only, uses constant-time digest comparison, and fails closed if runtime configuration is absent.
It cannot prove rotation from source; a retired-credential rejection and new-credential connection test must be verified privately.

## Deploy and acceptance

Use the repository feature branch/PR/CI process and existing Actions production deployment.
After deployment, connect the plugin to the endpoint and enter authentication through the host UI.
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

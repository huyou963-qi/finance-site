/** Coverage-aligned, resumable earnings guidance backfill. Dry-run by default. */
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { discoverSecFilings, fetchSecReleaseEvidenceByIndex } from "../../src/lib/equity/secEdgar";
import { writeSecFilingIndex } from "../../src/lib/equity/secFilingSync";
import { companyFactsCikCandidates } from "../../src/lib/equity/dailyDisclosurePolicy";
import { loadFundamentalsCoverage } from "../../src/lib/equity/fundamentalsCoverage";
import { readReleaseAttachments } from "../../src/lib/equity/stockDisclosures";
import { extractManagementGuidance, GUIDANCE_PARSER_VERSION } from "../../src/lib/equity/managementGuidance";
import { earningsItem, guidanceBackfillReady, guidanceHistoryStart, guidanceHistoryThrough } from "../../src/lib/equity/managementGuidanceBackfill";

const arg = (name: string) => process.argv.slice(2).find(a => a.startsWith(`${name}=`))?.slice(name.length + 1);
const has = (name: string) => process.argv.includes(name);
type Issuer = { cik: string; symbol: string; symbols: string[]; from: string };
async function main() {
  const symbols = arg("--symbols")?.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const accessions = arg("--accessions")?.split(",").map(s => s.trim());
  const allCovered = has("--all-covered"), apply = has("--apply"), discover = has("--discover"), fetchMissing = has("--fetch-missing");
  const retryUnavailable = has("--retry-unavailable");
  if ((!allCovered && !symbols?.length) || (allCovered && symbols) || symbols?.some(s => !/^[A-Z0-9.-]{1,16}$/.test(s))) throw new Error("指定 --all-covered 或 --symbols=NVDA,AAPL，不能同时使用");
  if (accessions && (allCovered || discover || accessions.some(a => !/^\d{10}-\d{2}-\d{6}$/.test(a)))) throw new Error("--accessions 仅用于指定股票的既有公告");
  if (retryUnavailable && (!fetchMissing || discover)) throw new Error("--retry-unavailable 需配合 --fetch-missing，只处理已登记公告");
  const limit = arg("--limit") ? Number(arg("--limit")) : allCovered ? Infinity : 20;
  if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1 || limit > 100_000)) throw new Error("--limit 必须为 1–100000");
  const requestedConcurrency = Number(arg("--concurrency") ?? 1);
  if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1 || requestedConcurrency > 3) throw new Error("--concurrency 必须为 1–3");
  const concurrency = limit === Infinity ? requestedConcurrency : 1;
  process.env.SEC_BACKFILL_CONCURRENCY = String(concurrency);
  const explicitFrom = arg("--from");
  const through = guidanceHistoryThrough(arg("--through"));
  if (explicitFrom) guidanceHistoryStart(explicitFrom, null);
  const report = path.resolve(arg("--report") ?? ".data/guidance-backfill/run.jsonl");
  fs.mkdirSync(path.dirname(report), { recursive: true });
  const checkpoints = new Map<string, string>();
  if (fs.existsSync(report)) for (const line of fs.readFileSync(report, "utf8").split("\n")) {
    try {
      const e = JSON.parse(line);
      if (e.phase === "discovery" && e.status === "complete" && typeof e.through === "string" && e.through >= through && typeof e.cik === "string" && typeof e.from === "string"
        && (!checkpoints.has(e.cik) || e.from < checkpoints.get(e.cik)!)) checkpoints.set(e.cik, e.from);
    } catch { /* Retry incomplete final line. */ }
  }
  const log = (entry: Record<string, unknown>) => fs.appendFileSync(report, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  const covered = allCovered ? await loadFundamentalsCoverage(prisma) : new Set(symbols!);
  if (!covered.size) throw new Error("覆盖名单为空，未执行回填；请确认数据库");
  const [securities, starts] = await Promise.all([
    prisma.equitySecurity.findMany({ where: { symbol: { in: [...covered] } }, select: { symbol: true, cik: true }, orderBy: [{ marketCap: "desc" }, { symbol: "asc" }] }),
    prisma.equityFundamentalSnapshot.groupBy({ by: ["symbol"], where: { symbol: { in: [...covered] }, periodType: "Q" }, _min: { fiscalDate: true } }),
  ]);
  const oldest = new Map(starts.map(s => [s.symbol, s._min.fiscalDate]));
  const oldestByCik = new Map<string, Date>();
  for (const security of securities) {
    const date = oldest.get(security.symbol);
    if (security.cik && date) {
      const cik = security.cik.padStart(10, "0");
      if (!oldestByCik.has(cik) || date < oldestByCik.get(cik)!) oldestByCik.set(cik, date);
    }
  }
  const issuers = new Map<string, Issuer>();
  const missingCik = [...covered].filter(s => !securities.some(row => row.symbol === s));
  for (const security of securities) {
    if (!security.cik || !/^\d{1,10}$/.test(security.cik)) { missingCik.push(security.symbol); continue; }
    const cik = security.cik.padStart(10, "0"), from = guidanceHistoryStart(explicitFrom, oldestByCik.get(cik) ?? null);
    const existing = issuers.get(cik);
    if (existing) { existing.symbols.push(security.symbol); if (from < existing.from) existing.from = from; }
    else issuers.set(cik, { cik, symbol: security.symbol, symbols: [security.symbol], from });
  }
  const stats = { coveredSymbols: covered.size, eligibleIssuers: issuers.size, missingCik: [...new Set(missingCik)].sort(), issuersDone: 0,
    discovered: 0, visited: 0, changed: 0, ready: 0, pending: 0, recoveredAttachments: 0, noEligibleAttachment: 0, legacyTruncated: 0, records: 0, failed: 0,
    apply, discover, fetchMissing, retryUnavailable, concurrency, through, limited: limit !== Infinity, parserVersion: GUIDANCE_PARSER_VERSION, startedAt: new Date().toISOString() };
  function snapshot(phase: string) {
    fs.writeFileSync(`${report}.summary.tmp`, JSON.stringify({ ...stats, phase, updatedAt: new Date().toISOString() }, null, 2));
    fs.renameSync(`${report}.summary.tmp`, `${report}.summary.json`);
  }
  snapshot("running"); console.log(JSON.stringify({ event: "start", ...stats }));
  let accessDenied = false;
  const processIssuer = async (issuer: Issuer) => {
    if (stats.visited >= limit) return;
    if (discover && (!checkpoints.has(issuer.cik) || checkpoints.get(issuer.cik)! > issuer.from)) {
      try {
        const rows = await discoverSecFilings(issuer.cik, issuer.from, true);
        const earnings = rows.filter(r => r.filedAt <= through && ["8-K", "8-K/A"].includes(r.form) && earningsItem(r.items));
        if (apply) for (const row of earnings) await writeSecFilingIndex(issuer.cik, issuer.symbol, row);
        stats.discovered += earnings.length;
        log({ phase: "discovery", cik: issuer.cik, from: issuer.from, through, status: apply ? "complete" : "dry-run", matched: earnings.length });
      } catch (e) { stats.failed++; log({ phase: "discovery", cik: issuer.cik, from: issuer.from, status: "error", error: e instanceof Error ? e.message : String(e) }); }
    }
    let cursor: string | undefined;
    while (!accessDenied) {
      const rows = await prisma.secFiling.findMany({
        where: {
          cik: issuer.cik, form: { in: ["8-K", "8-K/A"] }, items: { contains: "2.02" },
          ...(accessions ? { accession: { in: accessions } } : {}),
          ...(retryUnavailable ? { earningsRelease: { path: ["managementGuidance", "sourceStatus"], equals: "no_eligible_attachment" } } : {}),
          filedAt: { lte: new Date(through), ...(explicitFrom ? { gte: new Date(explicitFrom) } : {}) },
        },
        orderBy: { id: "asc" }, take: Math.min(25, limit - stats.visited), ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, accession: true, filedAt: true, earningsRelease: true, items: true },
      });
      if (!rows.length) break;
      for (const filing of rows) {
        if (accessDenied) break;
        if (!earningsItem(filing.items)) continue;
        stats.visited++;
        if (guidanceBackfillReady(filing.earningsRelease)) { stats.ready++; continue; }
        try {
          let release = filing.earningsRelease && typeof filing.earningsRelease === "object" && !Array.isArray(filing.earningsRelease) ? filing.earningsRelease : {};
          let attachments = readReleaseAttachments(release), fetched = false;
          const hadAttachments = attachments.length > 0;
          let truncated = attachments.some(a => a.text.length === 20_000);
          if (fetchMissing && (!attachments.length || truncated)) {
            let evidence: Awaited<ReturnType<typeof fetchSecReleaseEvidenceByIndex>> | undefined;
            let lastError: unknown;
            for (const candidate of companyFactsCikCandidates(issuer.cik, filing.accession)) {
              try { evidence = await fetchSecReleaseEvidenceByIndex(candidate, filing.accession, filing.filedAt.toISOString().slice(0, 10)); break; }
              catch (error) {
                if (error instanceof Error && error.message === "SEC HTTP 403") throw error;
                lastError = error;
              }
            }
            if (!evidence) throw lastError ?? new Error("公告附件不可用");
            release = { ...release, attachments: evidence.attachments, publication: evidence.publication ?? release.publication };
            attachments = evidence.attachments; fetched = true; truncated = false;
          }
          if (!attachments.length && !fetched) { stats.pending++; continue; }
          const parsed = extractManagementGuidance(attachments);
          stats.records += parsed.length;
          if (!attachments.length) stats.noEligibleAttachment++;
          if (truncated) stats.legacyTruncated++;
          if (apply) {
            const result = await prisma.secFiling.updateMany({ where: { id: filing.id, earningsRelease: { equals: filing.earningsRelease ?? Prisma.DbNull } }, data: {
              earningsRelease: { ...release, managementGuidance: { parserVersion: GUIDANCE_PARSER_VERSION, records: parsed,
                checkedAt: new Date().toISOString(), sourceStatus: truncated ? "legacy_truncated" : attachments.length ? "available" : "no_eligible_attachment" } },
            } });
            if (!result.count) throw new Error("公告被其他任务更新，请重跑");
            stats.changed++;
          }
          if (!hadAttachments && attachments.length) stats.recoveredAttachments++;
          log({ phase: "filing", cik: issuer.cik, accession: filing.accession, status: apply ? "complete" : "dry-run", records: parsed.length, attachments: attachments.length, truncated });
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          if (error === "SEC HTTP 403") accessDenied = true;
          stats.failed++;
          log({ phase: "filing", cik: issuer.cik, accession: filing.accession, status: "error", error });
        }
        if (stats.visited % 25 === 0) snapshot("running");
      }
      cursor = rows[rows.length - 1].id;
      if (stats.visited >= limit || rows.length < 25) break;
    }
    stats.issuersDone++;
    console.log(JSON.stringify({ event: "issuer", symbol: issuer.symbol, done: stats.issuersDone, total: issuers.size, visited: stats.visited, changed: stats.changed, ready: stats.ready, failed: stats.failed }));
    snapshot("running");
  };
  const queue = issuers.values();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (!accessDenied) { const next = queue.next(); if (next.done) return; await processIssuer(next.value); }
  }));
  snapshot(stats.failed ? "errors" : stats.pending || stats.legacyTruncated ? "pending_sources" : stats.limited && stats.visited >= limit ? "limited" : "complete");
  console.log(JSON.stringify(stats));
  if (stats.failed || stats.pending || stats.legacyTruncated) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

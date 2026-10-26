import { prisma } from "@/lib/prisma";
import { DAILY_DISCLOSURE_FORMS, disclosureDays, financialVersionReady } from "./dailyDisclosurePolicy";
import { discoverSecFilings, fetchSecDailyIndex, fetchSecReleaseAttachments } from "./secEdgar";
import { SEC_FINANCIAL_FORMS, writeSecFilingIndex } from "./secFilingSync";
import { fetchSecCompanyFacts, extractQuarterlyFundamentals } from "./secFundamentals";
import { buildSecFundamentalVintages, listSecPeriodicFilings, upsertFundamentalVintages, type SecFundamentalVintage } from "./fundamentalVintages";
import { upsertQuarterlyFundamentals } from "./equityFundamentalsStore";

export type DailyDisclosureOptions = {
  through?: string; days?: number; symbols?: string[]; maxFilings?: number; delayMs?: number; dryRun?: boolean;
};
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const defaultDependencies = {
  prisma, pause, discoverSecFilings, fetchSecDailyIndex, fetchSecReleaseAttachments,
  writeSecFilingIndex, fetchSecCompanyFacts, listSecPeriodicFilings, buildSecFundamentalVintages,
  extractQuarterlyFundamentals, upsertQuarterlyFundamentals, upsertFundamentalVintages,
};

/** Caller holds the batch lock. Work is bounded, serial and durable in the canonical filing row. */
export async function syncDailyDisclosures(options: DailyDisclosureOptions = {}, dependencies = defaultDependencies) {
  const { prisma, pause, discoverSecFilings, fetchSecDailyIndex, fetchSecReleaseAttachments,
    writeSecFilingIndex, fetchSecCompanyFacts, listSecPeriodicFilings, buildSecFundamentalVintages,
    extractQuarterlyFundamentals, upsertQuarterlyFundamentals, upsertFundamentalVintages } = dependencies;
  const days = disclosureDays(new Date(), options.days ?? 7, options.through);
  const delayMs = Math.max(1000, options.delayMs ?? 1000);
  const maxFilings = options.maxFilings ?? 300;
  if (!Number.isInteger(maxFilings) || maxFilings < 1 || maxFilings > 1000 || !Number.isFinite(delayMs)) {
    throw new Error("max-filings 必须为 1–1000；delay-ms 必须为有效数字");
  }
  const securities = await prisma.equitySecurity.findMany({
    where: { cik: { not: null }, ...(options.symbols?.length ? { symbol: { in: options.symbols } } : {}) },
    select: { symbol: true, cik: true }, orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
  });
  const byCik = new Map<string, typeof securities>();
  for (const security of securities) {
    const cik = security.cik!.replace(/\D/g, "").padStart(10, "0");
    byCik.set(cik, [...(byCik.get(cik) ?? []), security]);
  }
  const result = { days, coveredCompanies: byCik.size, indexed: 0, complete: 0, pending: 0, failed: 0, missingIndexes: [] as string[], remaining: 0 };
  if (options.dryRun) return { ...result, dryRun: true };
  const targets = new Map<string, Set<string>>();
  for (const day of days) {
    // EDGAR has no regular weekend dissemination; holiday/missing files remain visible in the log.
    if ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
    try {
      for (const entry of await fetchSecDailyIndex(day)) {
        if (!byCik.has(entry.cik)) continue;
        const accessions = targets.get(entry.cik) ?? new Set<string>();
        accessions.add(entry.accession);
        targets.set(entry.cik, accessions);
      }
    } catch (error) {
      result.missingIndexes.push(day);
      // 404 may be an official holiday; other errors are failures, never an empty successful day.
      if (!(error instanceof Error && error.message === "SEC HTTP 404")) result.failed++;
      console.warn(`[SEC daily index ${day}]`, error instanceof Error ? error.message : error);
    }
    await pause(delayMs);
  }
  for (const [cik, accessions] of targets) {
    try {
      const existing = await prisma.secFiling.findMany({
        where: { cik, accession: { in: [...accessions] } },
        select: { accession: true, form: true, primaryDocument: true, reportPeriodEnd: true, dailyStatus: true },
      });
      const known = new Set(existing.map(row => row.accession));
      const needsMetadata = new Set(existing.filter(row => row.dailyStatus === null &&
        (!row.primaryDocument || (SEC_FINANCIAL_FORMS.has(row.form) && !row.reportPeriodEnd))).map(row => row.accession));
      if ([...accessions].every(accession => known.has(accession)) && !needsMetadata.size) continue;
      const rows = await discoverSecFilings(cik, days[0], true);
      for (const row of rows) {
        if (!accessions.has(row.accession) || (known.has(row.accession) && !needsMetadata.has(row.accession))) continue;
        await writeSecFilingIndex(cik, byCik.get(cik)![0].symbol, row);
        if (!known.has(row.accession)) result.indexed++;
      }
      if ([...accessions].some(accession => !known.has(accession) && !rows.some(row => row.accession === accession))) {
        throw new Error("日索引与 submissions 不一致，下一批次重试");
      }
    } catch (error) {
      result.failed++;
      console.warn(`[SEC daily discovery ${cik}]`, error instanceof Error ? error.message : error);
    }
    await pause(delayMs);
  }
  const now = new Date();
  // Persist the queue before applying the per-run limit. A backlog must survive the seven-day discovery window.
  await prisma.secFiling.updateMany({
    where: { cik: { in: [...byCik.keys()] }, form: { in: [...DAILY_DISCLOSURE_FORMS] }, dailyStatus: null,
      filedAt: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T23:59:59Z`) } },
    data: { dailyStatus: "pending", dailyNextAttemptAt: new Date(0) },
  });
  // Routine 8-K events need only the canonical index. Do not spend the financial-download budget on them.
  const routine = await prisma.secFiling.updateMany({
    where: { cik: { in: [...byCik.keys()] }, form: { in: ["8-K", "8-K/A"] }, dailyStatus: "pending",
      dailyNextAttemptAt: { lte: now }, OR: [{ items: null }, { NOT: { items: { contains: "2.02" } } }] },
    data: { dailyStatus: "complete", dailyProcessedAt: now, dailyNextAttemptAt: null,
      dailyAttempts: { increment: 1 }, dailyError: null },
  });
  result.complete += routine.count;
  const where = {
    cik: { in: [...byCik.keys()] }, form: { in: [...DAILY_DISCLOSURE_FORMS] },
    OR: [
      { dailyStatus: null, filedAt: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T23:59:59Z`) } },
      { dailyStatus: { in: ["pending", "error"] }, dailyNextAttemptAt: { lte: now } },
    ],
  };
  const filings = await prisma.secFiling.findMany({ where, orderBy: [{ dailyAttempts: "asc" }, { filedAt: "desc" }, { id: "asc" }], take: maxFilings });
  // Only one potentially large Company Facts object is retained at a time.
  const groups = new Map<string, typeof filings>();
  for (const filing of filings) groups.set(filing.cik, [...(groups.get(filing.cik) ?? []), filing]);
  for (const [cik, group] of groups) {
    let facts: unknown;
    let factsError: unknown;
    let vintages: SecFundamentalVintage[] = [];
    let financialWritten = false;
    if (group.some(row => SEC_FINANCIAL_FORMS.has(row.form))) {
      try {
        facts = await fetchSecCompanyFacts(cik, { timeoutMs: 60_000 });
        const versions = listSecPeriodicFilings(facts);
        const oldestNeeded = versions.findIndex(version => group.some(row => row.accession === version.accession));
        // Keep the existing four-filing checkpoint window, extending only for actual pending jobs.
        const emitLastFilings = oldestNeeded < 0 ? 4 : Math.max(4, versions.length - oldestNeeded);
        vintages = buildSecFundamentalVintages(facts, { maxQuarters: 80, emitLastFilings });
      }
      catch (error) { factsError = error; }
    }
    for (const filing of group) {
      const processedAt = new Date();
      try {
        let status = "complete";
        const isEarningsRelease = filing.form.startsWith("8-K") && filing.items?.split(",").some(item => item.trim() === "2.02");
        if (isEarningsRelease && !filing.earningsRelease) {
          const attachments = await fetchSecReleaseAttachments(cik, filing.accession);
          await prisma.secFiling.update({ where: { id: filing.id }, data: { earningsRelease: { attachments } } });
        }
        if (SEC_FINANCIAL_FORMS.has(filing.form)) {
          if (factsError) throw factsError;
          if (!financialVersionReady(filing.accession, vintages, filing.reportPeriodEnd?.toISOString().slice(0, 10))) {
            status = "pending";
          } else if (!financialWritten) {
            const quarters = extractQuarterlyFundamentals(facts, { maxQuarters: 20 });
            if (!quarters.length) throw new Error("对应公告尚无可用季度财务数据");
            for (const security of byCik.get(cik)!) {
              await upsertQuarterlyFundamentals(security.symbol, quarters);
              await upsertFundamentalVintages(security.symbol, vintages);
            }
            financialWritten = true;
          }
        }
        await prisma.secFiling.update({ where: { id: filing.id }, data: {
          dailyStatus: status, dailyProcessedAt: processedAt, dailyAttempts: { increment: 1 }, dailyError: null,
          dailyNextAttemptAt: status === "pending" ? new Date(processedAt.getTime() + 20 * 3600_000) : null,
        } });
        if (status === "pending") result.pending++; else result.complete++;
        console.log(`[SEC daily] ${filing.symbol} ${filing.form} ${filing.accession}: ${status}`);
      } catch (error) {
        result.failed++;
        const message = error instanceof Error ? error.message : String(error);
        await prisma.secFiling.update({ where: { id: filing.id }, data: {
          dailyStatus: "error", dailyProcessedAt: processedAt, dailyAttempts: { increment: 1 },
          dailyError: message.slice(0, 1000), dailyNextAttemptAt: new Date(processedAt.getTime() + 20 * 3600_000),
        } });
        console.warn(`[SEC daily ${filing.accession}] ${message}`);
      }
      await pause(delayMs);
    }
  }
  result.remaining = await prisma.secFiling.count({ where: { ...where, OR: [
    where.OR[0], { dailyStatus: { in: ["pending", "error"] } },
  ] } });
  return result;
}

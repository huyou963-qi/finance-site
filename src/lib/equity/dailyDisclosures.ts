import { prisma } from "@/lib/prisma";
import {
  companyFactsCikCandidates, DAILY_DISCLOSURE_FORMS, disclosureDays, financialVersionReady,
} from "./dailyDisclosurePolicy";
import { discoverSecFilings, fetchSecDailyIndex, fetchSecReleaseEvidence, fetchSecAcceptanceEvidence, fetchSecFilingHeader } from "./secEdgar";
import { SEC_FINANCIAL_FORMS, writeSecFilingIndex } from "./secFilingSync";
import { fetchSecCompanyFacts, extractQuarterlyFundamentals } from "./secFundamentals";
import { buildSecFundamentalVintages, listSecPeriodicFilings, upsertFundamentalVintages, type SecFundamentalVintage } from "./fundamentalVintages";
import { upsertQuarterlyFundamentals } from "./equityFundamentalsStore";
import { supplementSecPeriodicFilingPair } from "./secFilingFacts";
import { loadFundamentalsCoverage } from "./fundamentalsCoverage";

/** Already-indexed financial filings (e.g. from sync-sec) stay null forever unless re-queued beyond the 7-day discovery window. */
export const ORPHAN_FINANCIAL_BACKLOG_DAYS = 120;
/**
 * Filings deep-processed per run. Earnings-season peaks reach ~1,300 covered filings a day
 * (2026-11-05); at ~15 filings/min two daily runs of 1,000 clear that the same day, and the
 * 75-minute budget still ends a run early if SEC is slow. The old 300 left a multi-week backlog.
 */
export const DEFAULT_DAILY_MAX_FILINGS = 1000;

export type DailyDisclosureOptions = {
  through?: string; days?: number; symbols?: string[]; maxFilings?: number; delayMs?: number; dryRun?: boolean;
  timingLimit?: number; filingFallbackLimit?: number; backlogDays?: number;
  /** Stop starting new work after this many minutes so the run ends as a recorded partial batch, not a kill. */
  budgetMinutes?: number;
};
export type DisclosureDiscoveryProgress = { coveredCiks: string[]; failedCiks: string[]; missingIndexes: string[]; indexed: number; failed: number };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const defaultDependencies = {
  prisma, pause, discoverSecFilings, fetchSecDailyIndex, fetchSecReleaseEvidence, fetchSecAcceptanceEvidence,
  writeSecFilingIndex, fetchSecCompanyFacts, listSecPeriodicFilings, buildSecFundamentalVintages,
  extractQuarterlyFundamentals, upsertQuarterlyFundamentals, upsertFundamentalVintages,
  supplementSecPeriodicFilingPair, fetchSecFilingHeader, loadFundamentalsCoverage, now: Date.now,
};
type OptionalDependency = "supplementSecPeriodicFilingPair" | "fetchSecFilingHeader" | "loadFundamentalsCoverage" | "now";
type Dependencies = Omit<typeof defaultDependencies, OptionalDependency> & Partial<Pick<typeof defaultDependencies, OptionalDependency>>;

/** Caller holds the batch lock. Work is bounded, serial and durable in the canonical filing row. */
export async function syncDailyDisclosures(options: DailyDisclosureOptions = {}, dependencies: Dependencies = defaultDependencies,
  onDiscovery?: (progress: DisclosureDiscoveryProgress) => Promise<void>) {
  const { prisma, pause, discoverSecFilings, fetchSecDailyIndex, fetchSecReleaseEvidence, fetchSecAcceptanceEvidence,
    writeSecFilingIndex, fetchSecCompanyFacts, listSecPeriodicFilings, buildSecFundamentalVintages,
    extractQuarterlyFundamentals, upsertQuarterlyFundamentals, upsertFundamentalVintages } = dependencies;
  const days = disclosureDays(new Date(), options.days ?? 7, options.through);
  // The shared SEC transport already spaces requests (at most 4/s; SEC allows 10/s). The old extra
  // fixed pause stretched earnings-week runs past the cron timeout.
  const delayMs = Math.max(0, options.delayMs ?? 0);
  const clock = dependencies.now ?? Date.now;
  const budgetMinutes = options.budgetMinutes;
  if (budgetMinutes != null && (!Number.isFinite(budgetMinutes) || budgetMinutes <= 0 || budgetMinutes > 24 * 60)) throw new Error("budget-minutes 必须为 1–1440");
  const deadline = budgetMinutes ? clock() + budgetMinutes * 60_000 : Number.POSITIVE_INFINITY;
  const overBudget = () => clock() >= deadline;
  const maxFilings = options.maxFilings ?? DEFAULT_DAILY_MAX_FILINGS;
  const timingLimit = options.timingLimit ?? 20;
  const filingFallbackLimit = options.filingFallbackLimit ?? 12;
  const backlogDays = options.backlogDays ?? ORPHAN_FINANCIAL_BACKLOG_DAYS;
  if (!Number.isInteger(filingFallbackLimit) || filingFallbackLimit < 0 || filingFallbackLimit > 20) throw new Error("filing-fallback-limit 必须为0–20");
  let fallbackRemaining = filingFallbackLimit;
  if (!Number.isInteger(timingLimit) || timingLimit < 0 || timingLimit > 100) throw new Error("timing-limit 必须为 0–100");
  if (!Number.isInteger(backlogDays) || backlogDays < 0 || backlogDays > 366) throw new Error("backlog-days 必须为 0–366");
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
  // One universe for filings, financials and the batch record: the fundamentals coverage
  // (S&P 500 + tracked index constituents + companies with history). Companies outside it have no
  // history to show; their stock page still backfills once on first visit. --symbols runs as asked.
  const coverage = options.symbols?.length || !dependencies.loadFundamentalsCoverage ? null
    : await dependencies.loadFundamentalsCoverage(prisma);
  if (coverage) for (const [cik, rows] of byCik) {
    if (!rows.some(row => coverage.has(row.symbol.toUpperCase()))) byCik.delete(cik);
  }
  const financialCiks = [...byCik.keys()];
  const result = { days, coveredCompanies: byCik.size, financialCompanies: financialCiks.length, indexed: 0, complete: 0, pending: 0, failed: 0,
    missingIndexes: [] as string[], failedCiks: [] as string[], remaining: 0, timingUpdated: 0, budgetExhausted: false };
  if (options.dryRun) return { ...result, dryRun: true };
  const targets = new Map<string, Map<string, string>>();
  for (const day of days) {
    // EDGAR has no regular weekend dissemination; holiday/missing files remain visible in the log.
    if ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
    try {
      for (const entry of await fetchSecDailyIndex(day)) {
        if (!byCik.has(entry.cik)) continue;
        const accessions = targets.get(entry.cik) ?? new Map<string, string>();
        accessions.set(entry.accession, entry.form);
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
    if (overBudget()) {
      // Not attempted is not "no filings": keep this company out of the complete-discovery claim.
      result.budgetExhausted = true;
      result.failedCiks.push(cik);
      continue;
    }
    try {
      const existing = await prisma.secFiling.findMany({
        where: { cik, accession: { in: [...accessions.keys()] } },
        select: { accession: true, form: true, primaryDocument: true, reportPeriodEnd: true, dailyStatus: true },
      });
      const known = new Set(existing.map(row => row.accession));
      const needsMetadata = new Set(existing.filter(row => row.dailyStatus === null &&
        (!row.primaryDocument || (SEC_FINANCIAL_FORMS.has(row.form) && !row.reportPeriodEnd))).map(row => row.accession));
      const wanted = [...accessions.keys()].filter(accession => !known.has(accession) || needsMetadata.has(accession));
      if (!wanted.length) continue;
      const symbol = byCik.get(cik)![0].symbol;
      // One small SGML header per filing replaces the multi-MB per-company submissions JSON and
      // also carries the SEC acceptance time. Anything unexpected falls back to submissions.
      const viaSubmissions: string[] = [];
      for (const accession of wanted) {
        let header: Awaited<ReturnType<typeof fetchSecFilingHeader>> = null;
        if (dependencies.fetchSecFilingHeader) {
          try {
            header = await dependencies.fetchSecFilingHeader(cik, accession);
          } catch (error) {
            console.warn(`[SEC header ${accession}]`, error instanceof Error ? error.message : error);
          }
        }
        if (!header || header.form !== accessions.get(accession) || !header.filerCiks.includes(cik)) {
          viaSubmissions.push(accession);
          continue;
        }
        await writeSecFilingIndex(cik, symbol, header,
          header.acceptedAt ? { acceptedAt: header.acceptedAt, acceptedAtSource: header.sourceUrl } : undefined);
        if (!known.has(accession)) result.indexed++;
        await pause(delayMs);
      }
      if (viaSubmissions.length) {
        const rows = await discoverSecFilings(cik, days[0], true);
        for (const row of rows) {
          if (!viaSubmissions.includes(row.accession)) continue;
          await writeSecFilingIndex(cik, symbol, row);
          if (!known.has(row.accession)) result.indexed++;
        }
        if (viaSubmissions.some(accession => !known.has(accession) && !rows.some(row => row.accession === accession))) {
          throw new Error("日索引与 submissions 不一致，下一批次重试");
        }
        await pause(delayMs);
      }
    } catch (error) {
      result.failed++;
      result.failedCiks.push(cik);
      console.warn(`[SEC daily discovery ${cik}]`, error instanceof Error ? error.message : error);
    }
  }
  await onDiscovery?.({ coveredCiks: [...byCik.keys()], failedCiks: result.failedCiks,
    missingIndexes: result.missingIndexes, indexed: result.indexed, failed: result.failed });
  const now = new Date();
  // Persist the queue before applying the per-run limit. A backlog must survive the seven-day discovery window.
  await prisma.secFiling.updateMany({
    where: { cik: { in: financialCiks }, form: { in: [...DAILY_DISCLOSURE_FORMS] }, dailyStatus: null,
      filedAt: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T23:59:59Z`) } },
    data: { dailyStatus: "pending", dailyNextAttemptAt: new Date(0) },
  });
  // sync-sec / missed windows leave daily_status null outside the rolling discovery dates.
  // Re-queue recent already-indexed financials (and Item 2.02 releases) so Q3-season backlogs drain.
  // Anchor to the discovery window end (not wall clock) so --through backfills stay deterministic.
  if (backlogDays > 0) {
    const filedSince = new Date(`${days.at(-1)}T00:00:00Z`);
    filedSince.setUTCDate(filedSince.getUTCDate() - backlogDays);
    await prisma.secFiling.updateMany({
      where: { cik: { in: financialCiks }, form: { in: [...SEC_FINANCIAL_FORMS] }, dailyStatus: null,
        reportPeriodEnd: { not: null }, filedAt: { gte: filedSince } },
      data: { dailyStatus: "pending", dailyNextAttemptAt: new Date(0) },
    });
    await prisma.secFiling.updateMany({
      where: { cik: { in: financialCiks }, form: { in: ["8-K", "8-K/A"] }, dailyStatus: null,
        items: { contains: "2.02" }, filedAt: { gte: filedSince } },
      data: { dailyStatus: "pending", dailyNextAttemptAt: new Date(0) },
    });
  }
  // Routine 8-K events need only the canonical index. Do not spend the financial-download budget on them.
  const routine = await prisma.secFiling.updateMany({
    where: { cik: { in: financialCiks }, form: { in: ["8-K", "8-K/A"] }, dailyStatus: "pending",
      dailyNextAttemptAt: { lte: now }, OR: [{ items: null }, { NOT: { items: { contains: "2.02" } } }] },
    data: { dailyStatus: "complete", dailyProcessedAt: now, dailyNextAttemptAt: null,
      dailyAttempts: { increment: 1 }, dailyError: null },
  });
  result.complete += routine.count;
  const where = {
    cik: { in: financialCiks }, form: { in: [...DAILY_DISCLOSURE_FORMS] },
    OR: [
      { dailyStatus: null, filedAt: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T23:59:59Z`) } },
      { dailyStatus: { in: ["pending", "error"] }, dailyNextAttemptAt: { lte: now } },
    ],
  };
  const filings = await prisma.secFiling.findMany({ where, orderBy: [{ dailyAttempts: "asc" }, { filedAt: "desc" }, { id: "asc" }], take: maxFilings });
  // Only one potentially large Company Facts object is retained at a time.
  const groups = new Map<string, typeof filings>();
  for (const filing of filings) groups.set(filing.cik, [...(groups.get(filing.cik) ?? []), filing]);
  // The 12-slot original-filing budget is per run. Give it to filings that have already
  // waited, and serve a periodic report before an amendment from another company.
  const fallbackRank = (rows: typeof filings) => {
    const financial = rows.filter(row => SEC_FINANCIAL_FORMS.has(row.form));
    const periodic = financial.filter(row => !row.form.endsWith("/A"));
    const pool = periodic.length ? periodic : financial;
    return {
      amendmentOnly: periodic.length ? 0 : 1,
      attempts: pool.reduce((max, row) => Math.max(max, row.dailyAttempts), 0),
      oldest: pool.reduce((min, row) => Math.min(min, row.filedAt.getTime()), Number.POSITIVE_INFINITY),
    };
  };
  const orderedGroups = [...groups.entries()].sort(([, left], [, right]) => {
    const a = fallbackRank(left), b = fallbackRank(right);
    return a.amendmentOnly - b.amendmentOnly || b.attempts - a.attempts || a.oldest - b.oldest;
  });
  for (const [cik, group] of orderedGroups) {
    if (overBudget()) { result.budgetExhausted = true; break; }
    let facts: unknown;
    let factsError: unknown;
    let vintages: SecFundamentalVintage[] = [];
    let financialWritten = false;
    const primaryDeferred = new Set<string>(), budgetSkipped = new Set<string>(), primaryErrors = new Map<string, unknown>();
    // Filing rows may use a preferred-share CIK or an issuer CIK while the accession prefix is a
    // parent co-registrant or a filing agent. Try the row CIK first, then the accession CIK.
    const financialSeed = group.find(row => SEC_FINANCIAL_FORMS.has(row.form));
    let factsCik = cik;
    if (financialSeed) {
      try {
        const accessions = group.filter(row => SEC_FINANCIAL_FORMS.has(row.form)).map(row => row.accession);
        const candidates = companyFactsCikCandidates(cik, financialSeed.accession);
        let lastError: unknown;
        let selected: { cik: string; facts: unknown } | null = null;
        for (const candidate of candidates) {
          try {
            const loaded = await fetchSecCompanyFacts(candidate, { timeoutMs: 60_000 });
            const listed = new Set(listSecPeriodicFilings(loaded).map(row => row.accession));
            selected = { cik: candidate, facts: loaded };
            if (accessions.every(accession => listed.has(accession))) break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!selected) throw lastError ?? new Error("companyfacts 不可用");
        factsCik = selected.cik;
        facts = selected.facts;
        let versions = listSecPeriodicFilings(facts);
        if (dependencies.supplementSecPeriodicFilingPair && filingFallbackLimit > 0) {
          const available = new Set(versions.map(row => row.accession));
          const cachedQuarters = extractQuarterlyFundamentals(facts, { maxQuarters: 20 });
          const missing = group.filter(row => {
            if (!SEC_FINANCIAL_FORMS.has(row.form)) return false;
            const quarter = cachedQuarters.find(p => p.fiscalDate === row.reportPeriodEnd?.toISOString().slice(0, 10));
            return !available.has(row.accession) || !quarter || [quarter.revenue, quarter.netIncome, quarter.ocf, quarter.capex].some(p => p == null);
          }).sort((a, b) => Number(a.form.endsWith("/A")) - Number(b.form.endsWith("/A"))
            || b.dailyAttempts - a.dailyAttempts || a.filedAt.getTime() - b.filedAt.getTime());
          let companyUsed = 0;
          const handled = new Set<string>();
          for (const row of missing) {
            if (handled.has(row.accession)) continue;
            const reserved = Math.min(2 - companyUsed, fallbackRemaining);
            if (reserved <= 0) { budgetSkipped.add(row.accession); primaryDeferred.add(row.accession); continue; }
            fallbackRemaining -= reserved; companyUsed += reserved;
            try {
              const supplemented = await dependencies.supplementSecPeriodicFilingPair(facts, Number(factsCik), {
                accession: row.accession, form: row.form, filedAt: row.filedAt.toISOString().slice(0, 10), primaryDocument: row.primaryDocument,
                reportDate: row.reportPeriodEnd?.toISOString().slice(0, 10),
              }, reserved);
              if (!Number.isInteger(supplemented.filingsUsed) || supplemented.filingsUsed < 1 || supplemented.filingsUsed > reserved) throw new Error("原始申报回补预算无效");
              fallbackRemaining += reserved - supplemented.filingsUsed; companyUsed -= reserved - supplemented.filingsUsed;
              facts = supplemented.facts;
              for (const accession of supplemented.handledAccessions) handled.add(accession);
              if (!handled.has(row.accession)) primaryDeferred.add(row.accession);
            } catch (error) {
              // 单份原始文件失败不毒化同公司的其他已就绪申报；本行仍保持pending并重试。
              console.warn(`[SEC primary fallback ${row.accession}]`, error instanceof Error ? error.message : error);
              primaryErrors.set(row.accession, error);
            }
          }
          versions = listSecPeriodicFilings(facts);
        }
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
          let evidence: Awaited<ReturnType<typeof fetchSecReleaseEvidence>> | null = null;
          let lastReleaseError: unknown;
          for (const candidate of companyFactsCikCandidates(filing.cik, filing.accession)) {
            try {
              evidence = await fetchSecReleaseEvidence(candidate, filing.accession, filing.filedAt.toISOString().slice(0, 10));
              break;
            } catch (error) {
              lastReleaseError = error;
            }
          }
          if (!evidence) throw lastReleaseError ?? new Error("业绩附件不可用");
          await prisma.secFiling.update({ where: { id: filing.id }, data: {
            earningsRelease: { attachments: evidence.attachments, publication: evidence.publication },
            ...(evidence.acceptedAt ? { acceptedAt: evidence.acceptedAt, acceptedAtSource: evidence.acceptedAtSource } : {}),
            ...(evidence.publication ? { publishedAt: evidence.publication.at ? new Date(evidence.publication.at) : null,
              publishedOn: new Date(evidence.publication.date), publicationSource: evidence.publication.sourceUrl } : {}),
            timingCheckedAt: new Date(),
          } });
          if (evidence.acceptedAt) result.timingUpdated++;
        }
        if (SEC_FINANCIAL_FORMS.has(filing.form)) {
          if (!filing.acceptedAt && (!filing.timingCheckedAt || filing.timingCheckedAt.getTime() < Date.now() - 7 * 86_400_000)) {
            try {
              let evidence: Awaited<ReturnType<typeof fetchSecAcceptanceEvidence>> | null = null;
              let lastTimingError: unknown;
              for (const candidate of companyFactsCikCandidates(filing.cik, filing.accession)) {
                try {
                  evidence = await fetchSecAcceptanceEvidence(candidate, filing.accession);
                  break;
                } catch (error) {
                  lastTimingError = error;
                }
              }
              if (!evidence) throw lastTimingError ?? new Error("SEC 接收时刻不可用");
              await prisma.secFiling.update({ where: { id: filing.id }, data: {
                acceptedAt: evidence.acceptedAt, acceptedAtSource: evidence.sourceUrl, timingCheckedAt: new Date(),
              } });
              result.timingUpdated++;
            } catch (error) {
              result.failed++;
              await prisma.secFiling.update({ where: { id: filing.id }, data: { timingCheckedAt: new Date() } });
              console.warn(`[SEC timing ${filing.accession}]`, error instanceof Error ? error.message : error);
            }
          }
          if (factsError) throw factsError;
          // Ready (revenue|eps|netIncome) wins over primaryDeferred and over a failed XBRL merge.
          // SPACs/BDCs often conflict on balance-sheet tags while NI is already in companyfacts;
          // Mortgage REIT/BDC filings may have null revenue/capex so they enter enrichment, but
          // EPS/NI for this accession must not be blocked by empty handledAccessions.
          const ready = financialVersionReady(
            filing.accession, vintages, filing.reportPeriodEnd?.toISOString().slice(0, 10),
          );
          if (!ready && primaryErrors.has(filing.accession)) throw primaryErrors.get(filing.accession);
          if (!ready) {
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
        // 没分到原文回补名额不是一次失败：不累加次数，也不推迟 20 小时，否则会永远排到新申报后面。
        const skippedForBudget = budgetSkipped.has(filing.accession) && status === "pending";
        await prisma.secFiling.update({ where: { id: filing.id }, data: {
          dailyStatus: status, dailyProcessedAt: processedAt, dailyError: null,
          ...(skippedForBudget ? {} : { dailyAttempts: { increment: 1 } }),
          dailyNextAttemptAt: status !== "pending" ? null
            : skippedForBudget ? (filing.dailyNextAttemptAt ?? processedAt)
            : new Date(processedAt.getTime() + 20 * 3600_000),
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
  if (timingLimit) {
    const timingRows = await prisma.secFiling.findMany({ where: {
      cik: { in: financialCiks }, acceptedAt: null, dailyStatus: "complete",
      AND: [
        { OR: [{ form: { in: [...SEC_FINANCIAL_FORMS] } }, { form: { in: ["8-K", "8-K/A"] }, items: { contains: "2.02" } }] },
        { OR: [
          { timingCheckedAt: null, filedAt: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days.at(-1)}T23:59:59Z`) } },
          { timingCheckedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
        ] },
      ],
    }, orderBy: [{ filedAt: "desc" }, { id: "asc" }], take: timingLimit });
    for (const filing of timingRows) {
      if (overBudget()) { result.budgetExhausted = true; break; }
      try {
        let evidence: Awaited<ReturnType<typeof fetchSecAcceptanceEvidence>> | null = null;
        let lastTimingError: unknown;
        for (const candidate of companyFactsCikCandidates(filing.cik, filing.accession)) {
          try {
            evidence = await fetchSecAcceptanceEvidence(candidate, filing.accession);
            break;
          } catch (error) {
            lastTimingError = error;
          }
        }
        if (!evidence) throw lastTimingError ?? new Error("SEC 接收时刻不可用");
        await prisma.secFiling.update({ where: { id: filing.id }, data: {
          acceptedAt: evidence.acceptedAt, acceptedAtSource: evidence.sourceUrl, timingCheckedAt: new Date(),
        } });
        result.timingUpdated++;
      } catch (error) {
        result.failed++;
        await prisma.secFiling.update({ where: { id: filing.id }, data: { timingCheckedAt: new Date() } });
        console.warn(`[SEC timing ${filing.accession}]`, error instanceof Error ? error.message : error);
      }
      await pause(delayMs);
    }
  }
  result.remaining = await prisma.secFiling.count({ where: { ...where, OR: [
    where.OR[0], { dailyStatus: { in: ["pending", "error"] } },
  ] } });
  return result;
}

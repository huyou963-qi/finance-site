/** Full macro freshness audit. Read-only; never changes observations or schedules.
 * npm run data:audit-freshness -- --live-fred --strict
 * npm run data:audit-freshness -- --json=.data/audits/macro-latest.json
 */
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchFredIncremental } from "../../src/lib/data/scheduler/adapters/fredAdapter";
import { fredTransformForInstrument } from "../../src/lib/data/scheduler/fredTransform";
import {
  inspectFreshnessRow,
  type FreshnessAuditRow,
  type FreshnessFinding,
} from "../../src/lib/data/scheduler/freshnessAudit";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const liveFred = args.includes("--live-fred");
const strict = args.includes("--strict");
const jsonPath = args.find((arg) => arg.startsWith("--json="))?.slice(7);

type LatestObs = { instrument_id: string; obs_date: Date; value: number };
type LatestFetch = { instrument_id: string; status: string; started_at: Date };

async function main() {
  const now = new Date();
  const [instruments, excluded, latestObs, latestFetch, lastWorker, lastCalendar] = await Promise.all([
    prisma.instrument.findMany({
      where: { kind: InstrumentKind.MACRO_SERIES },
      select: {
        id: true, code: true, metadata: true,
        dataSubscription: {
          select: {
            enabled: true, sourceId: true, sourceSeriesKey: true, granularity: true,
            nextRunAt: true, lastSuccessAt: true, lastObsDate: true, lastError: true,
            releasePackageId: true, source: { select: { adapterKind: true } },
          },
        },
      },
    }),
    prisma.macroCatalogExcludedKey.findMany({ select: { catalogKey: true } }),
    prisma.$queryRaw<LatestObs[]>`
      SELECT inst.id::text AS instrument_id, obs.obs_date, obs.value
      FROM mds."Instrument" inst
      JOIN LATERAL (
        SELECT mo.obs_date, mo.value FROM mds."MacroObservation" mo
        WHERE mo.instrument_id = inst.id ORDER BY mo.obs_date DESC LIMIT 1
      ) obs ON true
      WHERE inst.kind = 'MACRO_SERIES'::mds."InstrumentKind"
    `,
    prisma.$queryRaw<LatestFetch[]>`
      SELECT DISTINCT ON (ds.instrument_id) ds.instrument_id::text AS instrument_id,
        fr.status::text AS status, fr.started_at
      FROM mds.fetch_run fr JOIN mds.data_subscription ds ON ds.id = fr.subscription_id
      ORDER BY ds.instrument_id, fr.started_at DESC
    `,
    prisma.schedulerInvocation.findFirst({ where: { job: "data:worker", finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true, status: true } }),
    prisma.schedulerInvocation.findFirst({ where: { job: "data:sync-calendar", finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true, status: true } }),
  ]);
  const excludedKeys = new Set(excluded.map((row) => row.catalogKey));
  const obsById = new Map(latestObs.map((row) => [row.instrument_id, row]));
  const fetchById = new Map(latestFetch.map((row) => [row.instrument_id, row]));
  const rows: FreshnessAuditRow[] = [];
  let hidden = 0;
  for (const inst of instruments) {
    const catalogKey = (inst.metadata && typeof inst.metadata === "object" && !Array.isArray(inst.metadata)
      ? (inst.metadata as Record<string, unknown>).catalogKey : null);
    if (excludedKeys.has(`mds:${inst.code}`) || (typeof catalogKey === "string" && excludedKeys.has(catalogKey))) {
      hidden++;
      continue;
    }
    const sub = inst.dataSubscription;
    const actual = obsById.get(inst.id);
    const last = fetchById.get(inst.id);
    rows.push({
      instrumentCode: inst.code, metadata: inst.metadata,
      sourceId: sub?.sourceId ?? null, packageId: sub?.releasePackageId ?? null,
      adapterKind: sub?.source.adapterKind ?? null, sourceSeriesKey: sub?.sourceSeriesKey ?? null,
      enabled: sub?.enabled ?? null, granularity: sub?.granularity ?? null,
      nextRunAt: sub?.nextRunAt ?? null, lastSuccessAt: sub?.lastSuccessAt ?? null,
      subscribedLastObsDate: sub?.lastObsDate ?? null,
      actualLastObsDate: actual?.obs_date ?? null, actualLastValue: actual?.value ?? null,
      lastError: sub?.lastError ?? null, lastFetchStatus: last?.status ?? null,
      lastFetchAt: last?.started_at ?? null,
    });
  }

  const findings = rows.flatMap((row) => inspectFreshnessRow(row, now));
  const schedulerWarnings: string[] = [];
  if (!lastWorker?.finishedAt || now.getTime() - lastWorker.finishedAt.getTime() > 30 * 60_000) {
    schedulerWarnings.push(`data:worker 最近完成时间 ${lastWorker?.finishedAt?.toISOString() ?? "无"}，超过 30 分钟`);
  }
  if (!lastCalendar?.finishedAt || now.getTime() - lastCalendar.finishedAt.getTime() > 2 * 3_600_000) {
    schedulerWarnings.push(`data:sync-calendar 最近完成时间 ${lastCalendar?.finishedAt?.toISOString() ?? "无"}，超过 2 小时`);
  }

  let sourceChecked = 0;
  if (liveFred) {
    const key = process.env.FRED_API_KEY?.trim();
    if (!key) throw new Error("--live-fred 需要 FRED_API_KEY；不能把未核对源端报告为健康");
    const sourceCache = new Map<string, Awaited<ReturnType<typeof fetchFredIncremental>> | Error>();
    for (const row of rows.filter((item) => item.sourceId === "fred" && item.enabled && item.sourceSeriesKey)) {
      const seriesId = row.sourceSeriesKey!;
      if (!sourceCache.has(seriesId)) {
        try { sourceCache.set(seriesId, await fetchFredIncremental(seriesId, key, "1900-01-01")); }
        catch (error) { sourceCache.set(seriesId, error instanceof Error ? error : new Error(String(error))); }
        if (sourceCache.size % 50 === 0) console.log(`[audit-freshness] FRED 源端进度 ${sourceCache.size} 条`);
      }
      const result = sourceCache.get(seriesId)!;
      const add = (code: FreshnessFinding["code"], severity: FreshnessFinding["severity"], detail: string) =>
        findings.push({ code, severity, instrumentCode: row.instrumentCode, sourceId: row.sourceId, packageId: row.packageId, detail });
      if (result instanceof Error) { add("source_probe_failed", "warning", result.message.slice(0, 180)); continue; }
      const sourceDate = result.sourceLatestObsDate;
      if (!sourceDate) { add("source_probe_failed", "warning", "FRED 返回的序列没有数值观测"); continue; }
      sourceChecked++;
      if (!row.actualLastObsDate || sourceDate > row.actualLastObsDate) {
        add("source_ahead", "critical", `FRED 最新 ${sourceDate.toISOString().slice(0, 10)}，本地 ${row.actualLastObsDate?.toISOString().slice(0, 10) ?? "空"}`);
      } else if (sourceDate.getTime() === row.actualLastObsDate.getTime() &&
        fredTransformForInstrument(row.instrumentCode) === "none") {
        const sourceValue = result.points.at(-1)?.value;
        if (sourceValue != null && row.actualLastValue != null && Math.abs(sourceValue - row.actualLastValue) > 1e-8) {
          add("source_value_differs", "critical", `同一期数值不同：FRED ${sourceValue}，本地 ${row.actualLastValue}`);
        }
      }
    }
  }

  const counts = Object.fromEntries([...new Set(findings.map((f) => f.code))].sort().map((code) => [code, findings.filter((f) => f.code === code).length]));
  const bySource = [...new Set(findings.map((f) => f.sourceId ?? "(none)"))].map((sourceId) => ({
    sourceId,
    critical: findings.filter((f) => (f.sourceId ?? "(none)") === sourceId && f.severity === "critical").length,
    warning: findings.filter((f) => (f.sourceId ?? "(none)") === sourceId && f.severity === "warning").length,
  })).sort((a, b) => b.critical - a.critical);
  const byPackage = [...new Set(findings.filter((f) => f.packageId).map((f) => f.packageId!))].map((packageId) => ({
    packageId,
    critical: findings.filter((f) => f.packageId === packageId && f.severity === "critical").length,
  })).sort((a, b) => b.critical - a.critical);
  const report = {
    checkedAt: now.toISOString(), visibleInstruments: rows.length, hiddenInstruments: hidden,
    sourceChecked, sourceUnchecked: rows.length - sourceChecked, liveFred,
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    schedulerWarnings, counts, bySource, byPackage, findings,
  };
  console.log(`[audit-freshness] ${report.checkedAt} visible=${rows.length} hidden=${hidden} 源端核对=${sourceChecked} 尚未源端核对=${report.sourceUnchecked} critical=${report.critical} warning=${report.warning}`);
  console.log(`[audit-freshness] 分类 ${JSON.stringify(counts)}`);
  console.log(`[audit-freshness] 最需处理的数据源 ${JSON.stringify(bySource.slice(0, 10))}`);
  console.log(`[audit-freshness] 最需处理的发布包 ${JSON.stringify(byPackage.slice(0, 10))}`);
  for (const warning of schedulerWarnings) console.log(`  调度器告警: ${warning}`);
  for (const finding of findings.filter((f) => f.severity === "critical").slice(0, 30)) {
    console.log(`  ${finding.code} ${finding.instrumentCode}: ${finding.detail}`);
  }
  if (jsonPath) {
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
    console.log(`[audit-freshness] full report: ${jsonPath}`);
  }
  if (strict && (report.critical > 0 || schedulerWarnings.length > 0)) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { describeIndicator, resolveIndicator } from "./indicators";
import { MarketError, queryMarketSchema } from "./schema";

export type MarketPoint = { date: string; value: number | null; unit: string | null; missing: boolean; publishedAt: string | null; availableAt: string | null; lastUpdatedAt: string | null; revised: boolean | null; revisionCoverage: string };
export type MarketSeries = Awaited<ReturnType<typeof readMarketSeries>>;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const cache = new Map<string, { expires: number; result: MarketSeries }>();
// No upstream requests: this reader uses the same Instrument/MacroObservation tables as the website.
export async function readMarketSeries(input: ReturnType<typeof queryMarketSchema.parse>, requestedId: string) {
  const row = await resolveIndicator(requestedId), indicator = describeIndicator(row);
  if (input.frequency !== "native" && input.frequency !== indicator.frequency) throw new MarketError("FREQUENCY_MISMATCH", `指标 ${indicator.name} 原生频率为 ${indicator.frequency}，请求频率不能静默转换`);
  const start = new Date(input.startDate), end = new Date(input.endDate);
  const obsDate: Prisma.DateTimeFilter = { gte: start, lte: end, ...(input.cursor ? { gt: new Date(input.cursor) } : {}) };
  const [current, versions] = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '12000'`;
    return Promise.all([
      tx.macroObservation.findMany({ where: { instrumentId: row.id, obsDate }, orderBy: { obsDate: "asc" }, take: input.maxPoints + 1, select: { obsDate: true, value: true } }),
      tx.macroObservationVintage.findMany({ where: { instrumentId: row.id, obsDate, ...(input.dataCutoff ? { availableAt: { lte: new Date(input.dataCutoff) } } : {}) }, orderBy: [{ obsDate: "asc" }, { availableAt: "asc" }], take: 20001, select: { obsDate: true, value: true, availableAt: true, realtimeStart: true, source: true, isInitialRelease: true } }),
    ]);
  }, { isolationLevel: "RepeatableRead", timeout: 15000, maxWait: 3000 });
  if (versions.length > 20000) throw new MarketError("RANGE_TOO_LARGE", "版本数据过多，请缩短查询区间");
  const byDate = new Map<string, typeof versions>();
  for (const v of versions) { const d = dateOnly(v.obsDate); const group = byDate.get(d) ?? []; group.push(v); byDate.set(d, group); }
  const selected = input.dataCutoff ? [...byDate].map(([date, v]) => ({ obsDate: new Date(date), value: v.at(-1)!.value })) : current;
  const truncated = selected.length > input.maxPoints;
  const points: MarketPoint[] = selected.slice(0, input.maxPoints).map(point => {
    const date = dateOnly(point.obsDate), v = byDate.get(date) ?? [], last = v.at(-1), matches = last?.value === point.value;
    const officialInitial = v.find(x => x.source === "alfred" && x.isInitialRelease);
    return { date, value: Number.isFinite(point.value) ? point.value : null, unit: indicator.unit, missing: !Number.isFinite(point.value),
      // ALFRED proves a release date, not a midnight publication timestamp.
      publishedAt: officialInitial?.realtimeStart ? dateOnly(officialInitial.realtimeStart) : null,
      availableAt: matches ? last!.availableAt.toISOString() : null,
      lastUpdatedAt: matches ? last!.availableAt.toISOString() : null,
      revised: matches && v.length > 1 && new Set(v.map(x => x.value)).size > 1 ? true : officialInitial && matches ? false : null,
      revisionCoverage: matches ? "captured_versions_only_not_complete_release_history" : "unknown",
    };
  });
  return { indicator, points, timezone: "UTC (date labels only; not publication timestamps)", query: { startDate: input.startDate, endDate: input.endDate, dataCutoff: input.dataCutoff ?? null },
    coverage: { from: points[0]?.date ?? null, to: points.at(-1)?.date ?? null, count: points.length, truncated, nextCursor: truncated ? points.at(-1)?.date ?? null : null },
    transformations: { adjusted: false, converted: false, interpolated: false, resampled: false },
    missingValuePolicy: "未发布/缺失日期不补点；联合比较按日期并集标记缺失，计算只使用同日有效值；历史截止模式不回退最新值",
    revisionFingerprint: createHash("sha256").update(JSON.stringify(points)).digest("hex"),
  };
}
async function cachedRead(p: ReturnType<typeof queryMarketSchema.parse>, id: string) {
  const key = JSON.stringify([p, id]), hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;
  const result = await readMarketSeries(p, id);
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 30000, result });
  return result;
}
export async function queryMarketData(raw: unknown) {
  const p = queryMarketSchema.parse(raw);
  const ids = [...new Set(p.indicatorIds)];
  const effectiveMaxPoints = Math.min(p.maxPoints, Math.floor(2000 / ids.length));
  const series = await Promise.all(ids.map(id => cachedRead({ ...p, maxPoints: effectiveMaxPoints }, id)));
  // A common date cursor must not skip a slower series' unseen points.
  const pages = series.filter(s => s.coverage.truncated);
  const allDates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort();
  const cutoffs = [...pages.map(s => s.coverage.to!), ...(allDates.length > effectiveMaxPoints ? [allDates[effectiveMaxPoints - 1]!] : [])];
  const nextCursor = cutoffs.length ? cutoffs.sort()[0]! : null;
  const dates = allDates.filter(date => !nextCursor || date <= nextCursor);
  return { series: series.map(s => {
    const nativePoints = s.points.filter(point => !nextCursor || point.date <= nextCursor);
    const points = dates.map(date => nativePoints.find(point => point.date === date) ?? { date, value: null, unit: s.indicator.unit, missing: true, publishedAt: null, availableAt: null, lastUpdatedAt: null, revised: null, revisionCoverage: "unknown" });
    return { ...s, points, coverage: { from: nativePoints[0]?.date ?? null, to: nativePoints.at(-1)?.date ?? null, count: nativePoints.length, truncated: Boolean(nextCursor), nextCursor }, revisionFingerprint: createHash("sha256").update(JSON.stringify(points)).digest("hex") };
  }), nextCursor, truncated: Boolean(nextCursor), effectiveMaxPoints, maxTotalPoints: 2000, asOfRequested: p.dataCutoff ?? null, retrievedAt: new Date().toISOString() };
}

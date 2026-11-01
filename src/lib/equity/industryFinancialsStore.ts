import { prisma } from "@/lib/prisma";
import { GICS_SECTOR_DEFS } from "./gicsCatalog";
import { latestCompletedQuarter } from "./fundamentalsAgg";
import {
  buildIndustryFinancialHistory, financialQuarterEnd, selectFinancialHoldingsDate, shiftFinancialQuarter,
  type FinancialHistoryPoint, type FinancialUniverse, type MembershipBasis,
} from "./industryFinancials";

export type IndustryFinancialOptions = { etf: string; quarters: 12 | 20 | 40; membership: MembershipBasis };
const TTL_MS = 5 * 60_000;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_SECURITIES = 1000;
const MAX_HOLDINGS = 600;
const iso = (date: Date) => date.toISOString().slice(0, 10);

async function readIndustryFinancials(options: IndustryFinancialOptions) {
  const def = GICS_SECTOR_DEFS.find(row => row.etf === options.etf)!;
  const now = new Date();
  const latestPeriod = latestCompletedQuarter(now);
  const periods = Array.from({ length: options.quarters }, (_, index) => shiftFinancialQuarter(latestPeriod, index - options.quarters + 1));
  const factPeriods = Array.from({ length: options.quarters + 7 }, (_, index) => shiftFinancialQuarter(latestPeriod, index - options.quarters - 6));
  const latestHolding = await prisma.sectorEtfHolding.findFirst({
    where: { etf: options.etf, asOfDate: { lte: now } }, orderBy: { asOfDate: "desc" }, select: { asOfDate: true },
  });
  const datesByPeriod = new Map<string, string>();
  if (options.membership === "historical") {
    const earliest = new Date(`${financialQuarterEnd(periods[0]!)}T00:00:00Z`);
    earliest.setUTCDate(earliest.getUTCDate() - 7);
    const dates = await prisma.sectorEtfHolding.groupBy({
      by: ["asOfDate"], where: { etf: options.etf, asOfDate: { gte: earliest, lte: new Date(`${financialQuarterEnd(latestPeriod)}T00:00:00Z`) } },
      orderBy: { asOfDate: "asc" }, take: 4001,
    });
    if (dates.length > 4000) throw new Error("持仓历史超出本页查询范围");
    for (const period of periods) {
      const date = selectFinancialHoldingsDate(dates.map(row => iso(row.asOfDate)), financialQuarterEnd(period));
      if (date) datesByPeriod.set(period, date);
    }
  }
  const requestedDates = [...new Set([
    ...(latestHolding ? [iso(latestHolding.asOfDate)] : []), ...datesByPeriod.values(),
  ])];
  const holdings = requestedDates.length ? await prisma.sectorEtfHolding.findMany({
    where: { etf: options.etf, asOfDate: { in: requestedDates.map(date => new Date(`${date}T00:00:00Z`)) }, weight: { gt: 0 } },
    select: { asOfDate: true, symbol: true, cusip: true, name: true, weight: true },
    orderBy: [{ asOfDate: "asc" }, { weight: "desc" }], take: requestedDates.length * MAX_HOLDINGS + 1,
  }) : [];
  const universes = new Map<string, FinancialUniverse>();
  for (const holding of holdings) {
    const date = iso(holding.asOfDate);
    if (!universes.has(date)) universes.set(date, { date, holdings: [] });
    const universe = universes.get(date)!;
    universe.holdings.push(holding);
    if (universe.holdings.length > MAX_HOLDINGS) throw new Error("ETF 成分超出本页查询范围");
  }
  if (holdings.length > requestedDates.length * MAX_HOLDINGS) throw new Error("ETF 成分超出本页查询范围");
  const symbols = [...new Set(holdings.flatMap(row => row.symbol ? [row.symbol] : []))];
  const cusips = [...new Set(holdings.flatMap(row => row.cusip ? [row.cusip] : []))];
  const securitySelect = { symbol: true, cik: true, cusip: true, name: true } as const;
  let securities = symbols.length ? await prisma.equitySecurity.findMany({
    where: { OR: [{ symbol: { in: symbols } }, { cusip: { in: cusips } }] }, select: securitySelect, take: MAX_SECURITIES + 1,
  }) : [];
  const ciks = [...new Set(securities.flatMap(row => row.cik ? [row.cik, row.cik.replace(/^0+/, ""), row.cik.padStart(10, "0")] : []))];
  if (ciks.length) {
    const aliases = await prisma.equitySecurity.findMany({ where: { cik: { in: ciks } }, select: securitySelect, take: MAX_SECURITIES + 1 });
    securities = [...new Map([...securities, ...aliases].map(row => [row.symbol, row])).values()];
  }
  if (securities.length > MAX_SECURITIES) throw new Error("ETF 公司数超出本页查询范围");
  const snapshots: Parameters<typeof buildIndustryFinancialHistory>[0]["snapshots"] = [];
  let sourceUpdatedAt: string | null = null;
  // 40 个代码一批，串行查询；不触发个股读取层的外部懒回补。
  for (let index = 0; index < securities.length; index += 40) {
    const batch = securities.slice(index, index + 40);
    const rows = await prisma.equityFundamentalSnapshot.findMany({
      where: { symbol: { in: batch.map(row => row.symbol) }, periodType: "Q", period: { in: factPeriods } },
      select: { symbol: true, period: true, fiscalDate: true, asOf: true, revenue: true, netIncome: true, ocf: true, capex: true, updatedAt: true },
      take: batch.length * factPeriods.length + 1,
    });
    if (rows.length > batch.length * factPeriods.length) throw new Error("季度事实超出查询范围");
    for (const row of rows) {
      const updated = row.updatedAt.toISOString();
      if (!sourceUpdatedAt || updated > sourceUpdatedAt) sourceUpdatedAt = updated;
      snapshots.push({ ...row, fiscalDate: iso(row.fiscalDate ?? row.asOf) });
    }
  }
  const current = latestHolding ? universes.get(iso(latestHolding.asOfDate)) ?? null : null;
  const historical = new Map<string, FinancialUniverse>();
  for (const [period, date] of datesByPeriod) {
    const universe = universes.get(date);
    if (universe) historical.set(period, universe);
  }
  const history = buildIndustryFinancialHistory({ periods, membership: options.membership, current, historical, securities, snapshots });
  const batch = await prisma.equityDisclosureBatch.findFirst({
    where: { symbols: { isEmpty: true } }, orderBy: [{ startedAt: "desc" }],
    select: { status: true, throughDay: true, finishedAt: true, pending: true, failed: true, remaining: true, missingIndexes: true },
  });
  return {
    etf: def.etf, nameZh: def.nameZh, indexName: `${def.sector === "Information Technology" ? "Technology" : def.sector} Select Sector Index`,
    membership: options.membership, latestPeriod, holdingsDate: current?.date ?? null,
    holdingsStale: current ? Date.parse(iso(now)) - Date.parse(current.date) > 7 * 86_400_000 : false,
    sourceUpdatedAt, generatedAt: now.toISOString(), history,
    batch: batch ? { status: batch.status, through: iso(batch.throughDay), finishedAt: batch.finishedAt?.toISOString() ?? null,
      pending: batch.pending + batch.remaining, failed: batch.failed, missingIndexes: batch.missingIndexes.length } : null,
  };
}

type CachedHistory = Awaited<ReturnType<typeof readIndustryFinancials>>;
const cache = new Map<string, { value: CachedHistory; expiresAt: number; bytes: number }>();
const pending = new Map<string, Promise<CachedHistory>>();
let queue: Promise<unknown> = Promise.resolve();

/** 11 项 / 16 MiB 上限、5 分钟 TTL、同键合并、跨键串行，保护混部服务器。 */
export function loadIndustryFinancials(options: IndustryFinancialOptions): Promise<CachedHistory> {
  const key = `${options.etf}:${options.quarters}:${options.membership}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
  const running = pending.get(key);
  if (running) return running;
  const work = queue.catch(() => undefined).then(async () => {
    const value = await readIndustryFinancials(options);
    const bytes = Buffer.byteLength(JSON.stringify(value));
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(entryKey);
    cache.delete(key);
    if (bytes <= MAX_CACHE_BYTES) {
      while (cache.size >= 11 || [...cache.values()].reduce((sum, item) => sum + item.bytes, 0) + bytes > MAX_CACHE_BYTES) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS, bytes });
    }
    return value;
  });
  queue = work;
  pending.set(key, work);
  void work.finally(() => pending.delete(key)).catch(() => undefined);
  return work;
}

/** 网络只返回所选季度的公司列表，避免每个历史点重复携带公司明细。 */
export function industryFinancialResponse(data: CachedHistory, period?: string | null) {
  const selectedPeriod = period ?? data.latestPeriod;
  const selected = data.history.find(row => row.period === selectedPeriod);
  if (!selected) return null;
  const strip = (point: FinancialHistoryPoint["Q"]) => {
    const { members: _members, ...summary } = point;
    return summary;
  };
  return { ...data, selectedPeriod, selected,
    history: data.history.map(row => ({ period: row.period, Q: strip(row.Q), TTM: strip(row.TTM) })),
  };
}

export type IndustryFinancialResponse = NonNullable<ReturnType<typeof industryFinancialResponse>>;

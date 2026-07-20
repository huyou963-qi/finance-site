/**
 * 月频 PIT 因子快照构建（Phase 1 WS3）。
 *
 * Usage:
 *   npm run quant:build-factors -- --month=2023-06   # 重建单月
 *   npm run quant:build-factors -- --full            # 全量重建（2000-01 起全部宇宙月末）
 *   npm run quant:build-factors -- --full --from=2010-01   # 全量但从指定月起（断点续跑）
 *   npm run quant:build-factors                      # 增量：补 factor_snapshot 缺的最新月
 *
 * 管线：
 *   1) 技术面 pass（symbol 主序）：分批载入日线到内存，对该 symbol 全部在册月末算价格因子
 *      —— 价格全量在内存分 symbol 批处理，不逐行查库。
 *   2) 基本面 pass（月主序，≥2020-06）：buildPitCrossSection(T) → 基本面因子；
 *      turnover20d = 20 日均成交额 / PIT 市值 在此合成。
 *   3) 标准化 pass（逐月）：dollarVolPctile 分位 → winsorize+zscore → sector 内 zscore → 落库。
 */
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
import { ensureDailyBars } from "../../src/lib/equity/equityPriceStore";
import {
  buildPitCrossSection,
  listUniverseDates,
  loadClosesAsOf,
} from "../../src/lib/quant/pitCrossSection";
import {
  buildBenchmarkReturns,
  buildTechSeries,
  computeFundamentalFactors,
  computeTechnicalFactors,
  percentileRanks,
  winsorizedZscores,
  type TechSeries,
} from "../../src/lib/quant/factorCompute";
import { FACTOR_MAP } from "../../src/lib/quant/factorRegistry";

const BENCHMARK_SYMBOL = "SPY";
/** 基本面 pass 起点（Q 快照回填窗口 ~2020H2 起，更早月份全空，跳过省查询） */
const FUNDAMENTAL_MIN_DATE = "2020-06-01";
const PRICE_BATCH = 30;
const INSERT_CHUNK = 1000;

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}
function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

type FactorRow = Record<string, number>;
/** date → symbol → {factorKey: value} */
type ResultStore = Map<string, Map<string, FactorRow>>;

function getRow(store: ResultStore, date: string, symbol: string): FactorRow {
  let bySym = store.get(date);
  if (!bySym) {
    bySym = new Map();
    store.set(date, bySym);
  }
  let row = bySym.get(symbol);
  if (!row) {
    row = {};
    bySym.set(symbol, row);
  }
  return row;
}

async function resolveTargetDates(): Promise<string[]> {
  const all = await listUniverseDates();
  if (!all.length) throw new Error("index_constituent 无月末快照，先跑 equity:rebuild-sp500-history");

  const month = argValue("--month");
  if (month) {
    const hits = all.filter((d) => d.startsWith(month));
    if (!hits.length) throw new Error(`月份 ${month} 无宇宙快照（可用范围 ${all[0]} ~ ${all[all.length - 1]}）`);
    return hits;
  }
  if (argFlag("--full")) {
    const from = argValue("--from");
    return from ? all.filter((d) => d.slice(0, 7) >= from) : all;
  }
  // 增量：补 factor_snapshot 尚无的最新月份；空表只补最新一月（避免误触全量）
  const agg = await prisma.factorSnapshot.aggregate({ _max: { date: true } });
  const maxDone = agg._max.date ? agg._max.date.toISOString().slice(0, 10) : null;
  if (!maxDone) return [all[all.length - 1]!];
  const pending = all.filter((d) => d > maxDone);
  return pending;
}

async function loadBenchmark(): Promise<Map<number, number>> {
  const read = () =>
    prisma.equityDailyBar.findMany({
      where: { symbol: BENCHMARK_SYMBOL },
      orderBy: { date: "asc" },
      select: { date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true },
    });
  let rows = await read();
  if (!rows.length) {
    console.log(`基准 ${BENCHMARK_SYMBOL} 无日线，触发回补…`);
    await ensureDailyBars([BENCHMARK_SYMBOL]);
    rows = await read();
    if (!rows.length) throw new Error(`基准 ${BENCHMARK_SYMBOL} 回补失败`);
  }
  return buildBenchmarkReturns(buildTechSeries(rows));
}

async function upsertFactorRows(
  rows: { symbol: string; date: string; factorKey: string; value: number; zscore: number | null; sectorZscore: number | null }[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values = chunk.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${r.symbol}, ${new Date(`${r.date}T00:00:00.000Z`)}::date, ${r.factorKey}, ${r.value}, ${r.zscore}, ${r.sectorZscore}, CURRENT_TIMESTAMP)`,
    );
    written += await prisma.$executeRaw`
      INSERT INTO "mds"."factor_snapshot"
        ("id", "symbol", "date", "factor_key", "value", "zscore", "sector_zscore", "updated_at")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("symbol", "date", "factor_key") DO UPDATE SET
        "value" = EXCLUDED."value",
        "zscore" = EXCLUDED."zscore",
        "sector_zscore" = EXCLUDED."sector_zscore",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }
  return written;
}

async function main() {
  const t0 = Date.now();
  const dates = await resolveTargetDates();
  if (!dates.length) {
    console.log("无待构建月份（factor_snapshot 已含最新宇宙月末）");
    return;
  }
  console.log(`目标月份 ${dates.length} 个：${dates[0]} ~ ${dates[dates.length - 1]}`);

  // 宇宙成员：date → symbols / symbol → dates
  const memberRows = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { in: dates.map((d) => new Date(`${d}T00:00:00.000Z`)) } },
    select: { asOfDate: true, symbol: true },
  });
  const universeByDate = new Map<string, string[]>();
  const datesBySymbol = new Map<string, string[]>();
  for (const r of memberRows) {
    const d = r.asOfDate.toISOString().slice(0, 10);
    (universeByDate.get(d) ?? universeByDate.set(d, []).get(d)!).push(r.symbol);
    (datesBySymbol.get(r.symbol) ?? datesBySymbol.set(r.symbol, []).get(r.symbol)!).push(d);
  }
  const allSymbols = [...datesBySymbol.keys()].sort();
  console.log(`宇宙 symbol 合计 ${allSymbols.length} 只`);

  // sector 现值近似（非 PIT，文档口径）
  const secRows = await prisma.equitySecurity.findMany({
    where: { symbol: { in: allSymbols } },
    select: { symbol: true, gicsSector: true },
  });
  const sectorBySymbol = new Map(secRows.map((r) => [r.symbol, r.gicsSector]));

  const benchmark = await loadBenchmark();

  const store: ResultStore = new Map();
  /** date → symbol → 20 日均成交额（中间量） */
  const advolStore = new Map<string, Map<string, number>>();

  // ── 1) 技术面 pass：分批 symbol 载入全历史日线 ──
  let techSymbolsWithPrice = 0;
  for (let i = 0; i < allSymbols.length; i += PRICE_BATCH) {
    const batch = allSymbols.slice(i, i + PRICE_BATCH);
    const bars = await prisma.equityDailyBar.findMany({
      where: { symbol: { in: batch } },
      orderBy: [{ symbol: "asc" }, { date: "asc" }],
      select: { symbol: true, date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true },
    });
    const bySym = new Map<string, typeof bars>();
    for (const b of bars) {
      (bySym.get(b.symbol) ?? bySym.set(b.symbol, []).get(b.symbol)!).push(b);
    }
    for (const sym of batch) {
      const rows = bySym.get(sym);
      if (!rows?.length) continue;
      const series: TechSeries = buildTechSeries(rows);
      if (!series.times.length) continue;
      techSymbolsWithPrice++;
      for (const d of datesBySymbol.get(sym) ?? []) {
        const tSec = Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);
        const res = computeTechnicalFactors(series, tSec, benchmark);
        if (!res) continue;
        Object.assign(getRow(store, d, sym), res.values);
        if (res.avgDollarVol20 != null) {
          (advolStore.get(d) ?? advolStore.set(d, new Map()).get(d)!).set(sym, res.avgDollarVol20);
        }
      }
    }
    if ((i / PRICE_BATCH) % 5 === 0) {
      console.log(`  技术面 pass ${Math.min(i + PRICE_BATCH, allSymbols.length)}/${allSymbols.length} …`);
    }
  }
  console.log(`技术面 pass 完成（有价格 symbol ${techSymbolsWithPrice}/${allSymbols.length}）`);

  // ── 2) 基本面 pass（月主序） ──
  const fundDates = dates.filter((d) => d >= FUNDAMENTAL_MIN_DATE);
  for (const d of fundDates) {
    const closes = await loadClosesAsOf(universeByDate.get(d) ?? [], d);
    const cs = await buildPitCrossSection(d, { closes });
    let n = 0;
    const advol = advolStore.get(d);
    for (const row of cs.rows) {
      const vals = computeFundamentalFactors(row, d);
      const adv = advol?.get(row.symbol);
      if (adv != null && row.marketCap != null && row.marketCap > 0) {
        vals["turnover20d"] = adv / row.marketCap;
      }
      if (Object.keys(vals).length) {
        Object.assign(getRow(store, d, row.symbol), vals);
        n++;
      }
    }
    console.log(`  基本面 ${d}：${n}/${cs.rows.length} 只有因子`);
  }

  // ── 3) 标准化 + 落库（逐月） ──
  let totalRows = 0;
  for (const d of dates) {
    const universe = (universeByDate.get(d) ?? []).sort();
    const bySym = store.get(d) ?? new Map<string, FactorRow>();

    // dollarVolPctile：当月宇宙内 20 日均成交额分位
    const advol = advolStore.get(d);
    if (advol) {
      const ranks = percentileRanks(universe.map((s) => advol.get(s) ?? null));
      universe.forEach((s, idx) => {
        const r = ranks[idx];
        if (r != null) getRow(store, d, s)["dollarVolPctile"] = r;
      });
    }

    const factorKeys = new Set<string>();
    for (const row of bySym.values()) for (const k of Object.keys(row)) factorKeys.add(k);

    const out: { symbol: string; date: string; factorKey: string; value: number; zscore: number | null; sectorZscore: number | null }[] = [];
    for (const key of factorKeys) {
      if (!FACTOR_MAP.has(key)) throw new Error(`未注册因子键：${key}`);
      const values = universe.map((s) => bySym.get(s)?.[key] ?? null);
      const z = winsorizedZscores(values);

      // sector 内 zscore：按现值 GICS 分组
      const sectorZ: (number | null)[] = universe.map(() => null);
      const groups = new Map<string, number[]>();
      universe.forEach((s, idx) => {
        const sec = sectorBySymbol.get(s);
        if (!sec) return;
        (groups.get(sec) ?? groups.set(sec, []).get(sec)!).push(idx);
      });
      for (const idxs of groups.values()) {
        const gz = winsorizedZscores(idxs.map((idx) => values[idx]!));
        idxs.forEach((idx, k) => {
          sectorZ[idx] = gz[k]!;
        });
      }

      universe.forEach((s, idx) => {
        const v = values[idx];
        if (v == null) return;
        out.push({ symbol: s, date: d, factorKey: key, value: v, zscore: z[idx]!, sectorZscore: sectorZ[idx]! });
      });
    }

    // 幂等重建：先清当月旧行（口径变化时避免残留），再插入
    await prisma.factorSnapshot.deleteMany({ where: { date: new Date(`${d}T00:00:00.000Z`) } });
    const written = await upsertFactorRows(out);
    totalRows += written;
    console.log(`  ${d}：写入 ${written} 行（${factorKeys.size} 因子）`);
    // 释放该月内存
    store.delete(d);
    advolStore.delete(d);
  }

  console.log(
    `完成：${dates.length} 个月，共 ${totalRows} 行，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

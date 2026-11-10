/**
 * 「股票数据」页（/equity/data）的估值与趋势指标，和月度因子快照逐值对账（spec §7 P2 验收）。
 *
 * 取 factor_snapshot 里某个月末（默认最新一个）的一批股票，以该月末为截止日走页面同一条
 * queryStockData 路径，比较两边的值，相对误差须 < 1e-6。
 *
 * Usage:
 *   npm run equity:verify-stock-data-factors
 *   npm run equity:verify-stock-data-factors -- --date=2025-06-30 --sample=50
 *
 * 分两步：
 * 1. 与「快照生成方式」现场重算的值比（同一批库内数据，全历史日线 + 指数成分截面），
 *    相对误差须 < 1e-6 —— 这一步证明页面与快照是同一套口径，失败即退出码 1；
 * 2. 与库里存着的快照值比，仅供参考：快照生成之后库里的数据可能又更新过
 *    （日线重抓后复权价末位变化、财报补录回购等），这类差异列出来但不算失败。
 */

import { prisma } from "../../src/lib/prisma";
import { queryStockData } from "../../src/lib/equity/stockData/query";
import {
  buildBenchmarkReturns,
  buildTechSeries,
  computeFundamentalFactors,
  computeTechnicalFactors,
} from "../../src/lib/quant/factorCompute";
import { buildPitCrossSection } from "../../src/lib/quant/pitCrossSection";
import type { ColumnSpec } from "../../src/lib/equity/stockData/types";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const TOLERANCE = 1e-6;

/** 页面列 → 快照里的因子键；倍数类列取倒数后比 */
const PAIRS: { indicatorId: string; factorKey: string; inverse?: boolean }[] = [
  { indicatorId: "trend.ret1m", factorKey: "ret1m" },
  { indicatorId: "trend.ret3m", factorKey: "ret3m" },
  { indicatorId: "trend.ret6m", factorKey: "ret6m" },
  { indicatorId: "trend.ret12m", factorKey: "ret12m" },
  { indicatorId: "trend.mom12_1", factorKey: "mom12_1" },
  { indicatorId: "trend.dist52wHigh", factorKey: "dist52wHigh" },
  { indicatorId: "trend.vol60d", factorKey: "vol60d" },
  { indicatorId: "trend.beta252d", factorKey: "beta252d" },
  { indicatorId: "trend.maxDrawdown12m", factorKey: "maxDrawdown12m" },
  { indicatorId: "val.earningsYield", factorKey: "earningsYield" },
  { indicatorId: "val.fcfYield", factorKey: "fcfYield" },
  { indicatorId: "val.dividendYield", factorKey: "dividendYield" },
  { indicatorId: "val.buybackYield", factorKey: "buybackYield" },
  { indicatorId: "val.pe", factorKey: "earningsYield", inverse: true },
  { indicatorId: "val.pb", factorKey: "bookYield", inverse: true },
  { indicatorId: "val.ps", factorKey: "salesYield", inverse: true },
  { indicatorId: "val.evToOcf", factorKey: "ocfToEv", inverse: true },
];

async function main() {
  const latest = await prisma.factorSnapshot.aggregate({ _max: { date: true } });
  const date = arg("date") ?? latest._max.date?.toISOString().slice(0, 10);
  if (!date) throw new Error("factor_snapshot 为空");
  const sample = Math.min(50, Number(arg("sample") ?? 50));

  const syms = await prisma.factorSnapshot.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`), factorKey: "earningsYield" },
    select: { symbol: true },
    orderBy: { symbol: "asc" },
  });
  if (!syms.length) throw new Error(`${date} 没有因子快照`);
  const step = Math.max(1, Math.floor(syms.length / sample));
  const symbols = syms.filter((_, i) => i % step === 0).slice(0, sample).map((s) => s.symbol);

  const columns: ColumnSpec[] = PAIRS.map((p, i) => ({ key: `c${i}`, indicatorId: p.indicatorId, params: { asOf: { kind: "date", date } } }));
  const res = await queryStockData(symbols, columns);
  const snaps = await prisma.factorSnapshot.findMany({
    where: { date: new Date(`${date}T00:00:00.000Z`), symbol: { in: symbols }, factorKey: { in: [...new Set(PAIRS.map((p) => p.factorKey))] } },
    select: { symbol: true, factorKey: true, value: true },
  });
  const snap = new Map(snaps.map((s) => [`${s.symbol}|${s.factorKey}`, s.value]));

  // 按快照生成脚本（build-factors）的方式现场重算：全历史日线、标普 500 成分截面
  const recomputed = new Map<string, number>();
  const tSec = Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
  const barSelect = { symbol: true, date: true, open: true, high: true, low: true, close: true, adjClose: true, volume: true } as const;
  const spy = await prisma.equityDailyBar.findMany({ where: { symbol: "SPY" }, orderBy: { date: "asc" }, select: barSelect });
  const benchmark = buildBenchmarkReturns(buildTechSeries(spy));
  const bars = await prisma.equityDailyBar.findMany({ where: { symbol: { in: symbols } }, orderBy: [{ symbol: "asc" }, { date: "asc" }], select: barSelect });
  for (const sym of symbols) {
    const tech = computeTechnicalFactors(buildTechSeries(bars.filter((b) => b.symbol === sym)), tSec, benchmark);
    for (const [k, v] of Object.entries(tech?.values ?? {})) recomputed.set(`${sym}|${k}`, v);
  }
  const cs = await buildPitCrossSection(date);
  for (const row of cs.rows.filter((r) => symbols.includes(r.symbol))) {
    for (const [k, v] of Object.entries(computeFundamentalFactors(row, date))) recomputed.set(`${row.symbol}|${k}`, v);
  }

  const strict = compare(res.rows, recomputed);
  const stored = compare(res.rows, snap);
  console.log(`截止日 ${date}，${res.rows.length} 只股票 × ${PAIRS.length} 列`);
  report("与快照口径现场重算比较（须全部一致）", strict);
  report("与库内已存快照比较（仅供参考）", stored);
  if (strict.mismatches.length) process.exitCode = 1;
}

type Comparison = { compared: number; onlyPage: number; onlyOther: number; mismatches: string[] };

function report(title: string, c: Comparison) {
  console.log(`
${title}`);
  console.log(`  两边都有值：${c.compared}；只有页面有值：${c.onlyPage}；只有对照有值：${c.onlyOther}`);
  if (!c.mismatches.length) { console.log(`  全部一致（相对误差 < ${TOLERANCE}）`); return; }
  console.log(`  不一致 ${c.mismatches.length} 处：`);
  for (const m of c.mismatches.slice(0, 30)) console.log(`    ${m}`);
}

function compare(rows: Awaited<ReturnType<typeof queryStockData>>["rows"], other: Map<string, number>): Comparison {
  let compared = 0;
  let onlyPage = 0;
  let onlyOther = 0;
  const mismatches: string[] = [];
  for (const row of rows) {
    PAIRS.forEach((p, i) => {
      const cell = row.cells[`c${i}`];
      const raw = other.get(`${row.symbol}|${p.factorKey}`);
      const expected = raw == null ? null : p.inverse ? (raw === 0 ? null : 1 / raw) : raw;
      const got = cell?.s === "ok" && typeof cell.v === "number" ? cell.v : null;
      if (expected == null && got == null) return;
      if (expected == null) { onlyPage++; return; }
      if (got == null) { onlyOther++; mismatches.push(`${row.symbol} ${p.indicatorId}: 页面 ${cell?.s}，对照 ${expected}`); return; }
      compared++;
      const rel = Math.abs(got - expected) / Math.max(1e-12, Math.abs(expected));
      if (rel >= TOLERANCE) mismatches.push(`${row.symbol} ${p.indicatorId}: 页面 ${got}，对照 ${expected}（相对误差 ${rel.toExponential(2)}）`);
    });
  }
  return { compared, onlyPage, onlyOther, mismatches };
}

main().finally(() => prisma.$disconnect());

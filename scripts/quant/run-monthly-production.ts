/**
 * 生产月度量化派生链：月末 S&P500 宇宙 → 日线增量 → 个股/行业因子 → Regime。
 *
 * 默认目标是上一个已完整结束的自然月；任务可每日触发，完成后按 DB 事实幂等跳过。
 * 月末宇宙优先复用已归档的 SPY 官方持仓；缺失时才回退到此前最近的 SP500 快照，
 * 且绝不读取目标日之后的成员信息。
 */
import { spawnSync } from "node:child_process";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
import {
  isCalendarMonthEnd,
  previousCompletedMonthEnd,
} from "../../src/lib/quant/monthlyProduction";

const MIN_UNIVERSE_SIZE = 480;
const MAX_UNIVERSE_SIZE = 520;
const MAX_SPY_SNAPSHOT_AGE_DAYS = 10;
const MAX_FALLBACK_UNIVERSE_AGE_DAYS = 62;
const DAY_MS = 86_400_000;

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ageDays(target: string, source: string): number {
  return Math.floor((Date.parse(`${target}T00:00:00.000Z`) - Date.parse(`${source}T00:00:00.000Z`)) / DAY_MS);
}

function validateUniverse(symbols: readonly string[], source: string): string[] {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].sort();
  if (unique.length < MIN_UNIVERSE_SIZE || unique.length > MAX_UNIVERSE_SIZE) {
    throw new Error(`${source} 宇宙规模 ${unique.length}，不在 ${MIN_UNIVERSE_SIZE}–${MAX_UNIVERSE_SIZE}`);
  }
  return unique;
}

async function exactUniverse(target: string): Promise<string[]> {
  const rows = await prisma.indexConstituent.findMany({
    where: {
      indexCode: SP500_INDEX_CODE,
      asOfDate: new Date(`${target}T00:00:00.000Z`),
    },
    select: { symbol: true },
  });
  return rows.map((row) => row.symbol);
}

async function sourceUniverse(target: string): Promise<{ symbols: string[]; source: string; asOfDate: string }> {
  const targetDate = new Date(`${target}T00:00:00.000Z`);
  const latestSpy = await prisma.sectorEtfHolding.findFirst({
    where: { etf: "SPY", asOfDate: { lte: targetDate }, symbol: { not: null } },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (latestSpy) {
    const sourceDate = iso(latestSpy.asOfDate);
    if (ageDays(target, sourceDate) <= MAX_SPY_SNAPSHOT_AGE_DAYS) {
      const rows = await prisma.sectorEtfHolding.findMany({
        where: { etf: "SPY", asOfDate: latestSpy.asOfDate, symbol: { not: null } },
        select: { symbol: true },
      });
      return {
        symbols: validateUniverse(rows.flatMap((row) => row.symbol ? [row.symbol] : []), `SPY ${sourceDate}`),
        source: "SPY official holdings",
        asOfDate: sourceDate,
      };
    }
  }

  const latestIndex = await prisma.indexConstituent.findFirst({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { lte: targetDate } },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (!latestIndex) throw new Error(`${target} 之前没有 SPY 持仓或 SP500 成分快照`);
  const sourceDate = iso(latestIndex.asOfDate);
  if (ageDays(target, sourceDate) > MAX_FALLBACK_UNIVERSE_AGE_DAYS) {
    throw new Error(`最近 SP500 宇宙 ${sourceDate} 距目标 ${target} 超过 ${MAX_FALLBACK_UNIVERSE_AGE_DAYS} 天`);
  }
  const rows = await prisma.indexConstituent.findMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: latestIndex.asOfDate },
    select: { symbol: true },
  });
  return {
    symbols: validateUniverse(rows.map((row) => row.symbol), `SP500 fallback ${sourceDate}`),
    source: "latest prior IndexConstituent fallback",
    asOfDate: sourceDate,
  };
}

async function ensureMonthEndUniverse(target: string): Promise<number> {
  const existing = await exactUniverse(target);
  if (existing.length >= MIN_UNIVERSE_SIZE && existing.length <= MAX_UNIVERSE_SIZE) {
    console.log(`[monthly-quant] 复用 ${target} 已有宇宙 ${existing.length} 只`);
    return existing.length;
  }
  const source = await sourceUniverse(target);
  const targetDate = new Date(`${target}T00:00:00.000Z`);
  await prisma.$transaction([
    prisma.indexConstituent.deleteMany({
      where: { indexCode: SP500_INDEX_CODE, asOfDate: targetDate },
    }),
    prisma.indexConstituent.createMany({
      data: source.symbols.map((symbol) => ({ indexCode: SP500_INDEX_CODE, symbol, asOfDate: targetDate })),
      skipDuplicates: true,
    }),
  ]);
  console.log(
    `[monthly-quant] ${target} 宇宙 ${source.symbols.length} 只，来源=${source.source} as-of=${source.asOfDate}`,
  );
  return source.symbols.length;
}

function runNpm(script: string, args: string[] = []): void {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(`[monthly-quant] npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}`);
  const result = spawnSync(executable, ["run", script, ...(args.length ? ["--", ...args] : [])], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} 失败，exit=${result.status ?? "unknown"}`);
}

async function completion(target: string) {
  const date = new Date(`${target}T00:00:00.000Z`);
  const [factorRows, sectorRows, regime] = await Promise.all([
    prisma.factorSnapshot.count({ where: { date } }),
    prisma.factorSectorSnapshot.count({ where: { date } }),
    prisma.macroRegime.findUnique({ where: { date }, select: { date: true, dalioRegime: true } }),
  ]);
  return { factorRows, sectorRows, regime };
}

async function main() {
  const now = new Date();
  const target = argValue("--target") ?? previousCompletedMonthEnd(now);
  if (!isCalendarMonthEnd(target)) throw new Error(`--target 必须是自然月末：${target}`);
  if (target > previousCompletedMonthEnd(now) && !process.argv.includes("--allow-current-month")) {
    throw new Error(`目标 ${target} 尚未成为完整历史月份`);
  }

  const before = await completion(target);
  if (before.factorRows > 0 && before.sectorRows > 0 && before.regime) {
    console.log(`[monthly-quant] ${target} 已完成，幂等跳过（factor=${before.factorRows}, sector=${before.sectorRows}）`);
    return;
  }

  await ensureMonthEndUniverse(target);
  runNpm("equity:sync-prices", [`--index-date=${target}`]);
  runNpm("quant:build-factors", [`--date=${target}`]);
  runNpm("quant:build-sector-factors", [`--date=${target}`]);
  runNpm("quant:build-regime", ["--append-only"]);

  const after = await completion(target);
  if (after.factorRows === 0 || after.sectorRows === 0 || !after.regime) {
    throw new Error(
      `${target} 验收失败：factor=${after.factorRows}, sector=${after.sectorRows}, regime=${Boolean(after.regime)}`,
    );
  }
  console.log(
    `[monthly-quant] ${target} 完成：factor=${after.factorRows}, sector=${after.sectorRows}, regime=${after.regime.dalioRegime ?? "unknown"}`,
  );
}

main()
  .catch((error) => {
    console.error("[monthly-quant] 失败：", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

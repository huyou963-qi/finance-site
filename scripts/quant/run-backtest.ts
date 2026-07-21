/**
 * 回测 CLI（Phase 3 WS3）。策略来源二选一：已存 StrategyDefinition 或本地 config 文件。
 *
 * Usage:
 *   npm run quant:backtest -- --strategy-id=<uuid> [--start=2015-01-01] [--end=2025-12-31] \
 *     [--weighting=equal|mcap|score] [--execution=nextClose|sameClose] [--cost-bps=10] [--name="..."]
 *   npm run quant:backtest -- --config-file=./my-config.json --weighting=equal
 *
 * 执行同步落库（backtest_run/nav/position），打印 metrics 摘要。
 */
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/prisma";
import type { ScreenerConfig } from "../../src/lib/quant/screener";
import type { BacktestParams, BacktestWeighting, BacktestExecution } from "../../src/lib/quant/backtest";
import { createRun, executeRun, normalizeParams } from "../../src/lib/quant/backtestRuns";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

async function main() {
  const strategyId = argValue("--strategy-id");
  const configFile = argValue("--config-file");
  if (!strategyId && !configFile) {
    throw new Error("需提供 --strategy-id=<uuid> 或 --config-file=<path>");
  }

  let config: ScreenerConfig;
  let name: string;
  if (strategyId) {
    const strat = await prisma.strategyDefinition.findUnique({ where: { id: strategyId } });
    if (!strat) throw new Error(`策略不存在：${strategyId}`);
    config = strat.config as unknown as ScreenerConfig;
    name = argValue("--name") ?? `回测：${strat.name}`;
  } else {
    config = JSON.parse(readFileSync(configFile!, "utf8")) as ScreenerConfig;
    name = argValue("--name") ?? `回测：${configFile}`;
  }

  const params: BacktestParams = normalizeParams({
    start: argValue("--start") ?? null,
    end: argValue("--end") ?? null,
    weighting: (argValue("--weighting") as BacktestWeighting) ?? "equal",
    execution: (argValue("--execution") as BacktestExecution) ?? "nextClose",
    costBps: argValue("--cost-bps") != null ? Number(argValue("--cost-bps")) : 10,
  });

  console.log(`策略：${name}`);
  console.log(`参数：`, params);

  const { id } = await createRun({ name, config, params });
  console.log(`已创建 run ${id}，开始执行…`);

  const started = Date.now();
  await executeRun(id, (p) => {
    process.stdout.write(`\r  [${p.phase}] ${p.done}/${p.total}   `);
  });
  process.stdout.write("\n");

  const run = await prisma.backtestRun.findUnique({ where: { id } });
  if (!run || run.status !== "done") {
    throw new Error(`执行失败：${run?.error ?? "未知"}`);
  }
  const m = run.metrics as Record<string, number | null>;
  const s = run.summary as Record<string, unknown>;
  console.log(`\n完成（${((Date.now() - started) / 1000).toFixed(1)}s）：`);
  console.log(`  区间起点 ${s.effectiveStart}（数据下限 ${s.dataFloor}）｜调仓 ${s.rebalanceCount} 期｜持仓宇宙 ${s.symbolCount} 只`);
  console.log(`  CAGR        ${pct(Number(m.cagr))}`);
  console.log(`  年化波动     ${pct(Number(m.vol))}（252 日口径）`);
  console.log(`  夏普        ${Number(m.sharpe).toFixed(3)}`);
  console.log(`  最大回撤     ${pct(Number(m.maxDrawdown))}`);
  console.log(`  Calmar      ${m.calmar != null ? Number(m.calmar).toFixed(3) : "—"}`);
  console.log(`  月胜率(vsSPY) ${m.monthlyWinRate != null ? pct(Number(m.monthlyWinRate)) : "—"}（${m.monthlyCount} 月）`);
  console.log(`  平均年换手   ${Number(m.avgAnnualTurnover).toFixed(2)}x（单边）`);
  console.log(`  基准 CAGR    ${m.benchCagr != null ? pct(Number(m.benchCagr)) : "—"}`);
  console.log(`\n  run id：${id}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n[run-backtest] 失败：", e instanceof Error ? e.message : e);
    process.exit(1);
  });

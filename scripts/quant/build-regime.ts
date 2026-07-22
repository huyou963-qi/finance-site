/**
 * 宏观 regime 构建 CLI（Phase 4 WS3）。按 factor 月频网格计算并落库 MacroRegime。
 *
 * Usage:
 *   npm run quant:build-regime                       # 全网格默认参数
 *   npm run quant:build-regime -- --start=2000-01-01 --end=2025-12-31
 *   npm run quant:build-regime -- --z-window=120 --growth-z=0 --infl-z=0 --infl-mom=3
 */
import { listResearchGrid } from "../../src/lib/quant/factorResearchData";
import {
  DEFAULT_REGIME_THRESHOLDS,
  REGIME_LABEL_ZH,
  computeRegimeSeries,
  persistRegimeSeries,
  type RegimeThresholds,
} from "../../src/lib/quant/macroRegime";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}
function numArg(name: string, dflt: number): number {
  const v = argValue(name);
  return v != null && Number.isFinite(Number(v)) ? Number(v) : dflt;
}

async function main() {
  const thresholds: RegimeThresholds = {
    growthZThreshold: numArg("--growth-z", DEFAULT_REGIME_THRESHOLDS.growthZThreshold),
    inflationZThreshold: numArg("--infl-z", DEFAULT_REGIME_THRESHOLDS.inflationZThreshold),
    zWindowMonths: numArg("--z-window", DEFAULT_REGIME_THRESHOLDS.zWindowMonths),
    inflationMomentumMonths: numArg("--infl-mom", DEFAULT_REGIME_THRESHOLDS.inflationMomentumMonths),
    minZSample: numArg("--min-sample", DEFAULT_REGIME_THRESHOLDS.minZSample),
  };
  const start = argValue("--start") ?? null;
  const end = argValue("--end") ?? null;

  console.log("参数：", thresholds, { start, end });
  const grid = await listResearchGrid({ start, end });
  console.log(`网格 ${grid.length} 期（${grid[0]} → ${grid[grid.length - 1]}）`);

  const started = Date.now();
  const points = await computeRegimeSeries(grid, thresholds);
  const written = await persistRegimeSeries(points);
  console.log(`落库 ${written} 行（${((Date.now() - started) / 1000).toFixed(1)}s）`);

  const dist = new Map<string, number>();
  for (const p of points) dist.set(p.regime, (dist.get(p.regime) ?? 0) + 1);
  console.log(
    "regime 分布：",
    [...dist.entries()]
      .map(([k, v]) => `${REGIME_LABEL_ZH[k as keyof typeof REGIME_LABEL_ZH]}=${v}`)
      .join("  "),
  );
  const rec = points.filter((p) => p.recession === 1);
  const contraction = rec.filter((p) => p.regime === "contraction").length;
  const growthBelow = rec.filter((p) => p.growthState === "below").length;
  console.log(
    `NBER 衰退月 ${rec.length}：衰退式象限 ${contraction}（${((contraction / Math.max(1, rec.length)) * 100).toFixed(0)}%）｜增长下 ${growthBelow}（${((growthBelow / Math.max(1, rec.length)) * 100).toFixed(0)}%）`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n[build-regime] 失败：", e instanceof Error ? e.message : e);
    process.exit(1);
  });

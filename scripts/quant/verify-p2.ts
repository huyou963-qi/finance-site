/**
 * P2 验收（过拟合防护）。npm run quant:verify-p2。
 *
 * 教学式、靶向「选择性过拟合」（selection overfitting）：
 *  A 稳健策略——mom12_1 top50：scan 邻域普遍好、OOS 不崩、walk-forward 连续。
 *  B 故意过拟合（核心 demo）——大网格 IS 挑最优 → OOS 显著退化 + DSR 被多重检验吃掉。
 *  C 随机策略 + 多试验 → Deflated Sharpe 判不显著（≈随机）。
 *  D 无前视——walk-forward 每折 trainEnd < testStart，训练段不回看测试段。
 * 纯统计核心单测在 test:quant（robustness.test.ts）。
 */
import {
  executeRobustness,
  type ScanAxis,
} from "../../src/lib/quant/robustnessData";
import { deflatedSharpe, returnMoments } from "../../src/lib/quant/robustness";
import type { ScreenerConfig } from "../../src/lib/quant/screener";
import type { BacktestParams } from "../../src/lib/quant/backtest";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ""}`);
  }
}
const pct = (x: number | null | undefined) =>
  x == null ? "—" : `${(x * 100).toFixed(2)}%`;
const f2 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(2));

const MOM: ScreenerConfig = {
  conditions: [],
  ranking: { mode: "single", sortFactor: "mom12_1", topN: 50 },
};
const BASE: BacktestParams = {
  start: "2005-01-01",
  end: "2023-12-31",
  weighting: "equal",
  execution: "nextClose",
  costBps: 10,
};

/** LCG（确定性） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function gauss(rnd: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function sectionA() {
  console.log("\nA 稳健策略 mom12_1 top50（scan / oos / walk-forward）");
  const topNAxis: ScanAxis = { key: "topN", kind: "topN", values: [30, 50, 80] };

  // scan：邻域普遍好（可评估点全部有正夏普）
  const scanExec = await executeRobustness(MOM, BASE, { mode: "scan", axes: [topNAxis] });
  const scan = scanExec.scan!;
  const evaluable = scan.points.filter((p) => p.metrics != null);
  check("scan 全部网格点可评估", evaluable.length === scan.points.length, `${evaluable.length}/${scan.points.length}`);
  const allPos = evaluable.every((p) => (p.metrics!.sharpeAnnual ?? 0) > 0);
  check("scan 邻域夏普普遍为正（稳健，非仅一点好）", allPos,
    evaluable.map((p) => `${p.label}:${f2(p.metrics!.sharpeAnnual)}`).join(" "));
  check("scan 记录了试验数 N = 网格点数", scan.deflated?.nTrials === scan.points.length, `N=${scan.deflated?.nTrials}`);

  // oos：训练段挑最优 → 测试段不崩
  const oosExec = await executeRobustness(MOM, BASE, {
    mode: "oos",
    axes: [topNAxis],
    splitDate: "2016-12-31",
  });
  const oos = oosExec.oos!;
  check("oos 选出赢家", oos.winnerIndex != null, `winner=${oos.winnerLabel}`);
  check("oos 样本外不崩溃（OOS 夏普 > 0）", (oos.oosMetrics?.sharpeAnnual ?? -1) > 0,
    `IS ${f2(oos.isMetrics?.sharpeAnnual)} → OOS ${f2(oos.oosMetrics?.sharpeAnnual)}`);
  check("oos degradation.collapsed = false", oos.degradation?.collapsed === false);

  // walk-forward（固定策略）：拼接连续、每折有测试指标
  const wfExec = await executeRobustness(MOM, BASE, { mode: "walkforward", folds: 4, minTrainPeriods: 36 });
  const wf = wfExec.walkforward!;
  check("walk-forward 固定策略标记", wf.fixedStrategy === true);
  check("walk-forward 各折均有测试指标", wf.folds.every((f) => f.testMetrics != null), `${wf.folds.length} 折`);
  check("walk-forward 拼接净值连续（月末点 > 折数）", wf.stitchedNav.length > wf.folds.length, `pts=${wf.stitchedNav.length}`);
  check("walk-forward 整体指标有限", wf.overallMetrics != null && Number.isFinite(wf.overallMetrics.sharpe),
    `CAGR ${pct(wf.overallMetrics?.cagr)} Sharpe ${f2(wf.overallMetrics?.sharpe)}`);
}

async function sectionB() {
  console.log("\nB 故意过拟合（核心 demo：IS 挑最优 → OOS 退化 + DSR 被吃掉）");
  // 大网格：多个排序因子 × 多个 topN。跨因子挑「IS 最优」正是选择性过拟合的温床。
  const axes: ScanAxis[] = [
    {
      key: "因子",
      kind: "sortFactor",
      values: ["mom12_1", "ret1m", "ret3m", "vol60d", "dist52wHigh", "turnover20d"],
    },
    { key: "topN", kind: "topN", values: [15, 30, 60] },
  ];
  const exec = await executeRobustness(MOM, BASE, {
    mode: "oos",
    axes,
    splitDate: "2016-12-31",
  });
  const oos = exec.oos!;
  console.log(`    网格 ${exec.gridSize} 点；IS 赢家 = ${oos.winnerLabel}`);
  console.log(
    `    赢家 IS 夏普 ${f2(oos.isMetrics?.sharpeAnnual)} → OOS 夏普 ${f2(oos.oosMetrics?.sharpeAnnual)}（退化 ${f2(oos.degradation?.sharpeDelta)}）`,
  );
  const dsr = oos.deflated!;
  console.log(
    `    DSR: 观测每期夏普 ${dsr.observedSharpe.toFixed(4)}｜N=${dsr.nTrials}｜期望最大夏普 SR0 ${dsr.expectedMaxSharpe.toFixed(4)}｜PSR(vs0) ${pct(dsr.psrVsZero)} → DSR ${pct(dsr.dsr)}`,
  );

  check("IS 挑最优后样本外退化（OOS 夏普 < IS 夏普）",
    (oos.oosMetrics?.sharpeAnnual ?? 0) < (oos.isMetrics?.sharpeAnnual ?? 0),
    `Δ=${f2(oos.degradation?.sharpeDelta)}`);
  check("多重检验抬高了显著性门槛（SR0 > 0）", dsr.expectedMaxSharpe > 0, `SR0=${dsr.expectedMaxSharpe.toFixed(4)}`);
  check("DSR < 未校正 PSR（校正吃掉了显著性）", dsr.dsr < dsr.psrVsZero,
    `DSR ${pct(dsr.dsr)} < PSR ${pct(dsr.psrVsZero)}`);
}

function sectionC() {
  console.log("\nC 随机策略 + 多试验 → Deflated Sharpe 判不显著");
  const rnd = lcg(2026);
  const N = 120;
  const nObs = 252 * 4;
  let best = returnMoments([0, 1]);
  const trials: number[] = [];
  for (let k = 0; k < N; k++) {
    const rets = Array.from({ length: nObs }, () => gauss(rnd) * 0.01); // 零 alpha 纯噪音
    const m = returnMoments(rets);
    trials.push(m.sharpe);
    if (m.sharpe > best.sharpe) best = m;
  }
  const dsr = deflatedSharpe({
    observedSharpe: best.sharpe,
    n: best.n,
    skew: best.skew,
    kurtosis: best.kurtosis,
    trialSharpes: trials,
  });
  console.log(
    `    ${N} 个零 alpha 策略取最优：观测年化夏普 ${(best.sharpe * Math.sqrt(252)).toFixed(2)}｜DSR ${pct(dsr.dsr)}`,
  );
  check("纯噪音里挑最优 → DSR 判不显著", dsr.significant === false, `DSR=${pct(dsr.dsr)}`);
  check("试验数如实记录 N", dsr.nTrials === N, `N=${dsr.nTrials}`);
}

async function sectionD() {
  console.log("\nD 无前视（walk-forward 训练段严格早于测试段）");
  const axes: ScanAxis[] = [{ key: "topN", kind: "topN", values: [30, 50, 80] }];
  const exec = await executeRobustness(MOM, BASE, {
    mode: "walkforward",
    axes,
    folds: 4,
    minTrainPeriods: 36,
  });
  const wf = exec.walkforward!;
  check("walk-forward 有网格 → 非固定策略（每折训练段挑参）", wf.fixedStrategy === false);
  const allBefore = wf.folds.every((f) => f.trainEnd < f.testStart);
  check("每折 trainEnd < testStart（训练段不含测试段）", allBefore,
    wf.folds.map((f) => `[${f.trainEnd}<${f.testStart}]`).join(" "));
  // 折间非重叠、递增
  let monotonic = true;
  for (let i = 1; i < wf.folds.length; i++) {
    if (wf.folds[i]!.testStart <= wf.folds[i - 1]!.testEnd) monotonic = false;
  }
  check("测试段折间非重叠、时间递增", monotonic);
  check("每折训练段起点一致（扩张窗口，只加不减历史）",
    wf.folds.every((f) => f.trainStart === wf.folds[0]!.trainStart));
}

async function main() {
  console.log("P2 验收（过拟合防护）");
  await sectionA();
  await sectionB();
  sectionC();
  await sectionD();
  console.log(`\n结果：PASS ${pass} / FAIL ${fail}`);
  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n[verify-p2] 异常：", e instanceof Error ? e.stack : e);
    process.exit(1);
  });

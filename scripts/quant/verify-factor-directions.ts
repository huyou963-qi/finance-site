/**
 * 因子方向一致性验收：注册表的 `higherIsBetter` vs 全历史实测 IC 的符号。
 *
 * 为什么需要：`higherIsBetter` 决定选股器的排序方向与复合分符号，方向写反的因子
 * 会让整条策略链路系统性地反向选股，而单测无法发现——它是一个关于**真实世界**的
 * 断言，只能用数据检验。
 *
 * 判定规则（避免把噪声当错误）：
 *   - 期望 IC 符号 = higherIsBetter ? 正 : 负
 *   - 仅当实测符号相反**且** BH(FDR) 校正后仍显著（α=0.05）才判为「方向存疑」
 *   - 符号相反但不显著 → 记为「无证据」，不是错误：全样本 IC≈0 的因子很正常
 *   - 显著同号 → 「已验证」
 *
 * 注意这是「注册方向是否与历史一致」的体检，不是「因子有没有 alpha」的结论：
 * 显著同号也可能只是行业暴露的代理（对照 sectorZscore 口径的中性化 IC）。
 * 单一全样本口径还会掩盖时变——某因子 2000–2012 显著、2013 后消失，全样本可能相互抵消。
 *
 * Usage:
 *   npm run quant:verify-factor-directions
 *   npm run quant:verify-factor-directions -- --start=2013-01-01
 *   npm run quant:verify-factor-directions -- --batch=4
 */
import { prisma } from "../../src/lib/prisma";
import { FACTOR_DEFS } from "../../src/lib/quant/factorRegistry";
import { runFactorResearch } from "../../src/lib/quant/factorResearchData";
import {
  icTStatToPValue,
  multipleTestingCorrection,
} from "../../src/lib/quant/robustness";

type Row = {
  factorKey: string;
  nameZh: string;
  category: string;
  higherIsBetter: boolean;
  meanIC: number;
  neutralIC: number;
  tStat: number;
  n: number;
  pValue: number;
};

function argOf(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const start = argOf("start");
  const end = argOf("end");
  const batchSize = Math.max(1, Number(argOf("batch") ?? 6));

  console.log("因子方向一致性验收（注册表 higherIsBetter vs 实测 IC）");
  console.log(`区间 ${start ?? "全历史"} → ${end ?? "最新"}｜批大小 ${batchSize}\n`);

  const keys = FACTOR_DEFS.map((d) => d.key);
  const rows: Row[] = [];
  let gridInfo = "";

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    process.stdout.write(
      `  计算 ${i + 1}–${Math.min(i + batchSize, keys.length)} / ${keys.length} …`,
    );
    let report;
    try {
      report = await runFactorResearch(batch, { start, end });
    } catch (e) {
      console.log(` 失败：${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    gridInfo = `${report.start} → ${report.end}，${report.gridDates.length} 期，${report.symbolCount} 只`;
    for (const f of report.factors) {
      rows.push({
        factorKey: f.factorKey,
        nameZh: f.nameZh,
        category: f.category,
        higherIsBetter: f.higherIsBetter,
        meanIC: f.icSummary.meanIC,
        neutralIC: f.neutralizedIcSummary.meanIC,
        tStat: f.icSummary.tStat,
        n: f.icSummary.n,
        pValue: icTStatToPValue(f.icSummary.tStat, f.icSummary.n),
      });
    }
    console.log(" ok");
  }

  if (rows.length === 0) {
    console.log("\n没有可评估的因子（检查 FactorSnapshot 是否已构建）。");
    await prisma.$disconnect();
    process.exit(1);
  }

  // 一次性对全部因子做多重检验校正：逐个看 t 值会把 32 次检验的选择性忽略掉
  const mtc = new Map(
    multipleTestingCorrection(
      rows.map((r) => ({ label: r.factorKey, pValue: r.pValue })),
      0.05,
    ).map((r) => [r.label, r]),
  );

  console.log(`\n网格：${gridInfo}\n`);
  console.log(
    "因子".padEnd(30) +
      "方向".padEnd(6) +
      "均值IC".padStart(9) +
      "中性IC".padStart(9) +
      "t".padStart(8) +
      "BH p".padStart(10) +
      "  判定",
  );
  console.log("─".repeat(92));

  const mismatched: Row[] = [];
  const confirmed: Row[] = [];
  const inconclusive: Row[] = [];
  /** 反号但只在未校正口径下显著——不算错误，但是人工复核的优先级清单 */
  const watch: Row[] = [];

  for (const r of rows.sort((a, b) => Math.abs(b.tStat) - Math.abs(a.tStat))) {
    const m = mtc.get(r.factorKey)!;
    const expectPositive = r.higherIsBetter;
    const actualPositive = r.meanIC > 0;
    const sameSign = expectPositive === actualPositive;
    let verdict: string;
    if (!m.bhSignificant) {
      if (!sameSign && r.pValue < 0.05) {
        verdict = "· 反号（仅未校正显著）";
        watch.push(r);
      } else {
        verdict = "无证据（IC 不显著）";
      }
      inconclusive.push(r);
    } else if (sameSign) {
      verdict = "✔ 已验证";
      confirmed.push(r);
    } else {
      verdict = "✖ 方向存疑（显著反号）";
      mismatched.push(r);
    }
    console.log(
      `${r.nameZh}(${r.factorKey})`.padEnd(30).slice(0, 30) +
        (r.higherIsBetter ? "越大好" : "越小好").padEnd(6) +
        r.meanIC.toFixed(4).padStart(9) +
        r.neutralIC.toFixed(4).padStart(9) +
        r.tStat.toFixed(2).padStart(8) +
        m.bh.toExponential(1).padStart(10) +
        `  ${verdict}`,
    );
  }

  console.log("─".repeat(92));
  console.log(
    `已验证 ${confirmed.length}｜无证据 ${inconclusive.length}（其中反号待观察 ${watch.length}）｜方向存疑 ${mismatched.length}（共 ${rows.length}）`,
  );

  if (watch.length > 0) {
    console.log(
      "\n反号待观察（单看 t 值显著、但扣除多重检验后不显著）——不构成改注册表的理由，" +
        "\n只是下次做单因子专项研究时的优先级：",
    );
    for (const r of watch) {
      console.log(
        `  · ${r.nameZh}(${r.factorKey})：注册「${r.higherIsBetter ? "越大越好" : "越小越好"}」，` +
          `实测 IC ${r.meanIC.toFixed(4)}（t=${r.tStat.toFixed(2)}，原始 p=${r.pValue.toFixed(4)}）`,
      );
    }
  }

  if (mismatched.length > 0) {
    console.log("\n方向存疑的因子（注册方向与显著的历史 IC 相反，需人工复核）：");
    for (const r of mismatched) {
      console.log(
        `  · ${r.nameZh}(${r.factorKey})：注册「${r.higherIsBetter ? "越大越好" : "越小越好"}」，` +
          `实测均值 IC ${r.meanIC.toFixed(4)}（t=${r.tStat.toFixed(2)}）`,
      );
    }
    console.log(
      "\n复核要点：① 注册方向是否真写反；② 是否只是本区间的时变现象（换区间再跑）；" +
        "③ 中性 IC 与原始 IC 是否同号（差异大说明由行业暴露驱动）。" +
        "\n不要仅凭本脚本就改注册表——方向是先验假设，翻转它等于换了一个因子。",
    );
  }

  await prisma.$disconnect();
  process.exit(mismatched.length > 0 ? 1 : 0);
}

void main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

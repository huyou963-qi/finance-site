/**
 * 阶段 B–D 验收：30 个历史阶段解析、PIT 截面边界、11 行业完整性、
 * 三个原型摘要，以及市值加权收益桥的加总恒等式与残差披露。
 *
 * 运行：npm run equity:verify-sector-transmission
 */

import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { SECTOR_HISTORICAL_PERIODS } from "../../src/lib/equity/sectorHistoricalPeriods";
import { getSectorStageTransmission } from "../../src/lib/equity/sectorStageTransmission";

const PROTOTYPES = [
  "qt-trade-tightening",
  "policy-rescue-stayhome",
  "svb-btfp-ai",
] as const;

const STRONG_ATTRIBUTION_LABELS = new Set([
  "盈利与估值共振",
  "基本面驱动",
  "估值驱动",
  "盈利抵消估值收缩",
  "预期先行，基本面尚未兑现",
  "基本面恶化",
]);

function pct(value: number | null): string {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

async function main() {
  let macroOnly = 0;
  for (const stage of SECTOR_HISTORICAL_PERIODS) {
    const result = await getSectorStageTransmission(stage.id, "asOf");
    assert.equal(result.sectors.length, 11, `${stage.id}: 必须固定返回 11 行业`);
    assert.ok(!result.stage.t0 || result.stage.t0 <= stage.start, `${stage.id}: T0 不得晚于 S`);
    assert.ok(!result.stage.t1 || result.stage.t1 <= result.stage.end, `${stage.id}: T1 不得晚于 E`);
    assert.equal(result.aggregation, "median", `${stage.id}: 默认聚合必须保持 median`);

    if (result.quality.overall === "macro-only") macroOnly += 1;
    for (const sector of result.sectors) {
      if (
        sector.quality.fundamentalCoverage != null &&
        sector.quality.fundamentalCoverage < 0.6
      ) {
        assert.equal(
          sector.attribution.fundamentalScore,
          null,
          `${stage.id}/${sector.etf}: 覆盖不足不得生成基本面分数`,
        );
        assert.ok(
          !sector.attribution.label || !STRONG_ATTRIBUTION_LABELS.has(sector.attribution.label),
          `${stage.id}/${sector.etf}: 覆盖不足不得生成强归因标签`,
        );
      }
    }
  }

  console.log(
    `阶段解析通过：${SECTOR_HISTORICAL_PERIODS.length}/${SECTOR_HISTORICAL_PERIODS.length}；macro-only=${macroOnly}`,
  );

  for (const stageId of PROTOTYPES) {
    const asOf = await getSectorStageTransmission(stageId, "asOf");
    const capWeighted = await getSectorStageTransmission(stageId, "asOf", "capWeighted");
    assert.equal(capWeighted.sectors.length, 11, `${stageId}: capWeighted 必须固定返回 11 行业`);
    assert.equal(capWeighted.aggregation, "capWeighted");
    for (const sector of capWeighted.sectors) {
      const bridge = sector.returnBridge;
      if (!bridge?.available) continue;
      const sum =
        bridge.fundamentalContribution! +
        bridge.valuationContribution! +
        bridge.dividendContribution! +
        bridge.residual!;
      assert.ok(
        Math.abs(sum - bridge.totalLogReturn!) < 1e-10,
        `${stageId}/${sector.etf}: 收益桥必须精确加总到 ETF 对数总回报`,
      );
      assert.ok(
        bridge.coverage != null && bridge.coverage >= 0.6,
        `${stageId}/${sector.etf}: 开放收益桥须满足 60% 市值覆盖`,
      );
    }
    const realized =
      stageId === "policy-rescue-stayhome"
        ? await getSectorStageTransmission(stageId, "realized")
        : null;
    const leaders = [...asOf.sectors]
      .filter((row) => row.market.excessVsSpy != null)
      .sort((a, b) => b.market.excessVsSpy! - a.market.excessVsSpy!)
      .slice(0, 3)
      .map((row) => `${row.etf} ${pct(row.market.absoluteReturn)} / ${pct(row.market.excessVsSpy)}`)
      .join("；");
    console.log(
      `${stageId}: T0=${asOf.stage.t0} T1=${asOf.stage.t1} T2=${asOf.stage.t2} ` +
        `SPY=${pct(asOf.benchmark.return)} quality=${asOf.quality.overall} ` +
        `coverage=${pct(asOf.quality.fundamentalCoverage)} | ${leaders}`,
    );
    const techBridge = capWeighted.sectors.find((row) => row.etf === "XLK")?.returnBridge;
    console.log(
      `  XLK capWeighted bridge: basis=${techBridge?.basis ?? "—"} ` +
        `F=${pct(techBridge?.fundamentalContribution ?? null)} ` +
        `V=${pct(techBridge?.valuationContribution ?? null)} ` +
        `D=${pct(techBridge?.dividendContribution ?? null)} ` +
        `residual=${pct(techBridge?.residual ?? null)}`,
    );
    if (realized) {
      const techAsOf = asOf.sectors.find((row) => row.etf === "XLK")!;
      const techRealized = realized.sectors.find((row) => row.etf === "XLK")!;
      console.log(
        `  XLK asOf→realized: ${techAsOf.attribution.label ?? "无标签"} → ` +
          `${techRealized.attribution.label ?? "无标签"}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

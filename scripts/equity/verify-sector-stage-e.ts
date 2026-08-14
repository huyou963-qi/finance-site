/**
 * 阶段 E 总验收：覆盖率、无前视、历史分类、严格/降级原子性、
 * 收益桥恒等式、响应体积，以及代表阶段冷/热查询性能。
 *
 * 运行：npm run equity:verify-sector-stage-e
 */

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { prisma } from "../../src/lib/prisma";
import { GICS_SECTOR_DEFS, type GicsSector } from "../../src/lib/equity/gicsCatalog";
import { SECTOR_HISTORICAL_PERIODS } from "../../src/lib/equity/sectorHistoricalPeriods";
import { STYLE_BUCKETS } from "../../src/lib/equity/styleBuckets";
import {
  clearSectorStageTransmissionCache,
  getSectorStageTransmission,
  type SectorStageTransmissionResponse,
} from "../../src/lib/equity/sectorStageTransmission";
import { loadSectorHistoricalFactGates } from "../../src/lib/equity/sectorHistoricalFactGates";
import { loadStrictEtfSectorSnapshots } from "../../src/lib/equity/sectorStrictHistorical";

const MAX_PAYLOAD_BYTES = 150 * 1024;
const COLD_TARGET_MS = 1_000;
const WARM_TARGET_MS = 200;
const PERFORMANCE_STAGES = [
  "qt-trade-tightening",
  "policy-rescue-stayhome",
  "svb-btfp-ai",
] as const;
const EXPECTED_SECTOR_ORDER = STYLE_BUCKETS.flatMap((bucket) => bucket.sectors);

type Timing = {
  stageId: string;
  aggregation: "median" | "capWeighted";
  coldMs: number;
  warmMs: number;
  bytes: number;
};

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

function assertCoverage(value: number | null, context: string): void {
  if (value == null) return;
  assert.ok(value >= -1e-9 && value <= 1.001, `${context}: coverage=${value} 不在 [0,1]`);
}

function assertBridgeIdentity(
  response: SectorStageTransmissionResponse,
  stageId: string,
): void {
  for (const row of response.sectors) {
    const bridge = row.returnBridge;
    if (!bridge?.available) continue;
    const total = bridge.fundamentalContribution! + bridge.valuationContribution! +
      bridge.dividendContribution! + bridge.residual!;
    assert.ok(
      Math.abs(total - bridge.totalLogReturn!) < 1e-10,
      `${stageId}/${row.etf}: 收益桥加总误差 ${total - bridge.totalLogReturn!}`,
    );
    assertCoverage(bridge.coverage, `${stageId}/${row.etf}/bridge`);
    assert.ok((bridge.coverage ?? 0) >= 0.6, `${stageId}/${row.etf}: 开放收益桥覆盖低于 60%`);
  }
}

function assertResponse(
  response: SectorStageTransmissionResponse,
  stageId: string,
  aggregation: "median" | "capWeighted",
): { strictApplied: number; maxPayloadBytes: number } {
  assert.equal(response.definitionsVersion, "2026-08-13.d3", `${stageId}: 定义版本未锁定 D3`);
  assert.equal(response.aggregation, aggregation, `${stageId}: aggregation 回传不一致`);
  assert.equal(response.sectors.length, 11, `${stageId}: 未完整返回 11 行业`);
  assert.deepEqual(
    response.sectors.map((row) => row.sector),
    EXPECTED_SECTOR_ORDER,
    `${stageId}: 行业顺序不是成长→周期→防御`,
  );
  assert.equal(new Set(response.sectors.map((row) => row.etf)).size, 11, `${stageId}: ETF 重复`);
  assert.ok(!response.stage.t0 || response.stage.t0 <= response.stage.start, `${stageId}: T0 晚于 S`);
  assert.ok(!response.stage.t1 || response.stage.t1 <= response.stage.end, `${stageId}: T1 晚于 E`);
  if (response.stage.t1 && response.stage.t2) {
    assert.ok(response.stage.t2 >= response.stage.t1, `${stageId}: T2 早于 T1`);
    assert.ok(response.stage.t2 <= addDays(response.stage.t1, 120), `${stageId}: T2 越过确认窗`);
  }

  let strictApplied = 0;
  for (const row of response.sectors) {
    assertCoverage(row.quality.fundamentalCoverage, `${stageId}/${row.etf}/quality`);
    for (const [factorKey, metric] of Object.entries(row.fundamentals)) {
      assertCoverage(metric.coverageStart, `${stageId}/${row.etf}/${factorKey}/start`);
      assertCoverage(metric.coverageEnd, `${stageId}/${row.etf}/${factorKey}/end`);
      assert.ok((metric.sampleStart ?? 0) >= 0, `${stageId}/${row.etf}/${factorKey}: sampleStart<0`);
      assert.ok((metric.sampleEnd ?? 0) >= 0, `${stageId}/${row.etf}/${factorKey}: sampleEnd<0`);
    }
    for (const layer of Object.values(row.quality.factLayers ?? {})) {
      assertCoverage(layer.coverage, `${stageId}/${row.etf}/fact-layer`);
      for (const endpoint of layer.endpoints) {
        assertCoverage(endpoint.coverage, `${stageId}/${row.etf}/fact-endpoint/${endpoint.date}`);
      }
    }

    if (aggregation === "median") {
      assert.equal(row.strictAudit.applied, false, `${stageId}/${row.etf}: median 不得标记严格 ETF 聚合`);
      assert.equal(row.strictAudit.activeMethod, "median");
      assert.equal(row.returnBridge, null, `${stageId}/${row.etf}: median 不生成收益桥`);
      continue;
    }

    if (row.strictAudit.applied) {
      strictApplied += 1;
      assert.equal(row.strictAudit.eligible, true, `${stageId}/${row.etf}: 未过闸门却应用严格路径`);
      assert.equal(row.strictAudit.activeMethod, "historical-etf-holdings");
      assert.equal(row.strictAudit.fallbackReason, null);
      assert.equal(row.quality.strictPipelineApplied, true);
      assert.equal(row.quality.vintageMode, "strict-filing-vintage");
      assert.equal(row.quality.classificationMode, "historical-gics");
      assert.equal(row.quality.weightMode, "historical-etf-holdings");
      assert.ok(Object.values(row.quality.factLayers ?? {}).every((layer) => layer.strict));
      const fundamentalEnd = response.mode === "realized" ? response.stage.t2 : response.stage.t1;
      assert.ok(
        !row.strictAudit.holdingSnapshotStart || row.strictAudit.holdingSnapshotStart <= response.stage.t0!,
        `${stageId}/${row.etf}: 起点持仓越过 T0`,
      );
      assert.ok(
        !row.strictAudit.holdingSnapshotEnd || row.strictAudit.holdingSnapshotEnd <= fundamentalEnd!,
        `${stageId}/${row.etf}: 终点持仓越过基本面端点`,
      );
      assert.ok(
        !row.strictAudit.latestFilingDateStart || row.strictAudit.latestFilingDateStart <= response.stage.t0!,
        `${stageId}/${row.etf}: 起点 filing 越过 T0`,
      );
      assert.ok(
        !row.strictAudit.latestFilingDateEnd || row.strictAudit.latestFilingDateEnd <= fundamentalEnd!,
        `${stageId}/${row.etf}: 终点 filing 越过基本面端点`,
      );
      if (row.returnBridge) {
        assert.equal(row.returnBridge.method, "etf-holdings-matched-start-weight");
      }
      if ((row.quality.fundamentalCoverage ?? 0) >= 0.8) {
        assert.equal(row.quality.overall, "A", `${stageId}/${row.etf}: 严格高覆盖未升 A`);
      }
    } else {
      assert.equal(row.strictAudit.activeMethod, "market-cap-proxy");
      assert.ok(row.strictAudit.fallbackReason, `${stageId}/${row.etf}: 回退缺少原因`);
      assert.equal(row.quality.strictPipelineApplied, false);
      assert.notEqual(row.quality.overall, "A", `${stageId}/${row.etf}: 近似路径不得为 A`);
      assert.equal(row.quality.vintageMode === "none" || row.quality.vintageMode === "latest-restated-asof-visible", true);
      assert.equal(row.quality.classificationMode === "none" || row.quality.classificationMode === "current-gics-approx", true);
      assert.equal(row.quality.weightMode === "none" || row.quality.weightMode === "market-cap-proxy", true);
      if (row.returnBridge) assert.equal(row.returnBridge.method, "market-cap-total");
    }
  }
  assertBridgeIdentity(response, stageId);
  const bytes = Buffer.byteLength(JSON.stringify(response));
  assert.ok(bytes < MAX_PAYLOAD_BYTES, `${stageId}/${aggregation}: JSON ${(bytes / 1024).toFixed(1)}KB 超过 150KB`);
  return { strictApplied, maxPayloadBytes: bytes };
}

async function assertClassificationIntegrity(): Promise<void> {
  const [invalidRanges, overlaps, duplicateActive] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM mds.equity_sector_classification_history
      WHERE valid_to IS NOT NULL AND valid_to < valid_from
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM mds.equity_sector_classification_history a
      JOIN mds.equity_sector_classification_history b
        ON a.symbol=b.symbol AND a.scheme=b.scheme AND a.id<b.id
       AND a.valid_from<=COALESCE(b.valid_to,'9999-12-31'::date)
       AND b.valid_from<=COALESCE(a.valid_to,'9999-12-31'::date)
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM (
        SELECT symbol, scheme
        FROM mds.equity_sector_classification_history
        WHERE valid_to IS NULL
        GROUP BY symbol, scheme
        HAVING COUNT(*) > 1
      ) d
    `,
  ]);
  assert.equal(Number(invalidRanges[0]?.count ?? 0), 0, "历史分类存在 validTo<validFrom");
  assert.equal(Number(overlaps[0]?.count ?? 0), 0, "历史分类有效期重叠");
  assert.equal(Number(duplicateActive[0]?.count ?? 0), 0, "历史分类存在重复开放区间");
}

async function assertCurrentStrictPilot(): Promise<{
  date: string;
  etf: string;
  vintageCoverage: number;
  classificationCoverage: number;
}> {
  const etf = (arg("pilot-etf") ?? "XLK").trim().toUpperCase();
  const definition = GICS_SECTOR_DEFS.find((item) => item.etf === etf);
  assert.ok(definition, `未知试点 ETF ${etf}`);
  const latest = await prisma.sectorEtfHolding.findFirst({
    where: { etf },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  assert.ok(latest, `${etf} 无持仓快照`);
  const date = arg("pilot-date") ?? latest.asOfDate.toISOString().slice(0, 10);
  const gate = (await loadSectorHistoricalFactGates(date, date)).get(definition.sector)!;
  assert.equal(gate.strict, true, `${etf}/${date}: 当前严格试点未过三层闸门`);
  const snapshot = (await loadStrictEtfSectorSnapshots(date, [definition.sector])).get(definition.sector)!;
  assert.ok(snapshot, `${etf}/${date}: 严格截面为空`);
  assert.ok(!snapshot.latestFilingDateUsed || snapshot.latestFilingDateUsed <= date, "试点 filing 前视");
  assert.ok(snapshot.holdingAsOfDate <= date, "试点持仓前视");
  const vintageCoverage = snapshot.vintageWeight / snapshot.holdingTotalWeight;
  const classificationCoverage = snapshot.classifiedWeight / snapshot.holdingTotalWeight;
  assert.ok(vintageCoverage >= 0.8, "试点 vintage 覆盖不足 80%");
  assert.ok(classificationCoverage >= 0.95, "试点分类覆盖不足 95%");
  return { date, etf, vintageCoverage, classificationCoverage };
}

async function measurePerformance(): Promise<Timing[]> {
  const timings: Timing[] = [];
  for (const stageId of PERFORMANCE_STAGES) {
    for (const aggregation of ["median", "capWeighted"] as const) {
      clearSectorStageTransmissionCache();
      const coldStarted = performance.now();
      const response = await getSectorStageTransmission(stageId, "asOf", aggregation);
      const coldMs = performance.now() - coldStarted;
      const warmStarted = performance.now();
      await getSectorStageTransmission(stageId, "asOf", aggregation);
      const warmMs = performance.now() - warmStarted;
      timings.push({
        stageId,
        aggregation,
        coldMs,
        warmMs,
        bytes: Buffer.byteLength(JSON.stringify(response)),
      });
    }
  }
  return timings;
}

async function main() {
  await assertClassificationIntegrity();
  const pilot = await assertCurrentStrictPilot();
  let maxPayloadBytes = 0;
  let strictApplied = 0;
  let auditedResponses = 0;
  for (const stage of SECTOR_HISTORICAL_PERIODS) {
    for (const aggregation of ["median", "capWeighted"] as const) {
      const response = await getSectorStageTransmission(stage.id, "asOf", aggregation);
      const result = assertResponse(response, stage.id, aggregation);
      strictApplied += result.strictApplied;
      maxPayloadBytes = Math.max(maxPayloadBytes, result.maxPayloadBytes);
      auditedResponses += 1;
    }
  }
  for (const stageId of PERFORMANCE_STAGES) {
    for (const aggregation of ["median", "capWeighted"] as const) {
      const response = await getSectorStageTransmission(stageId, "realized", aggregation);
      const result = assertResponse(response, `${stageId}/realized`, aggregation);
      strictApplied += result.strictApplied;
      maxPayloadBytes = Math.max(maxPayloadBytes, result.maxPayloadBytes);
      auditedResponses += 1;
    }
  }

  const timings = await measurePerformance();
  const coldP95 = percentile(timings.map((row) => row.coldMs), 0.95);
  const warmP95 = percentile(timings.map((row) => row.warmMs), 0.95);
  const warnings: string[] = [];
  if (coldP95 >= COLD_TARGET_MS) warnings.push(`冷查询 p95 ${coldP95.toFixed(0)}ms 高于 1s 目标`);
  if (warmP95 >= WARM_TARGET_MS) warnings.push(`缓存命中 p95 ${warmP95.toFixed(0)}ms 高于 200ms 目标`);
  const report = {
    status: "passed",
    definitionsVersion: "2026-08-13.d3",
    auditedStages: SECTOR_HISTORICAL_PERIODS.length,
    auditedResponses,
    auditedSectorRows: auditedResponses * 11,
    strictHistoricalRowsApplied: strictApplied,
    fallbackHistoricalRows: auditedResponses * 11 - strictApplied,
    currentStrictPilot: {
      ...pilot,
      vintageCoverage: `${(pilot.vintageCoverage * 100).toFixed(1)}%`,
      classificationCoverage: `${(pilot.classificationCoverage * 100).toFixed(1)}%`,
    },
    payload: {
      maxKb: Number((maxPayloadBytes / 1024).toFixed(1)),
      limitKb: 150,
    },
    performance: {
      coldP95Ms: Number(coldP95.toFixed(1)),
      warmP95Ms: Number(warmP95.toFixed(1)),
      targetColdMs: COLD_TARGET_MS,
      targetWarmMs: WARM_TARGET_MS,
      samples: timings.map((row) => ({
        ...row,
        coldMs: Number(row.coldMs.toFixed(1)),
        warmMs: Number(row.warmMs.toFixed(1)),
        kb: Number((row.bytes / 1024).toFixed(1)),
      })),
    },
    warnings,
  };
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

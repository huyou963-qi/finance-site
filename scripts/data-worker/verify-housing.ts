/**
 * 美国住房与地产自检
 *
 * npm run data:verify-housing
 * npm run data:verify-housing -- --db
 * Spec: docs/specs/us-housing.spec.md §6
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import {
  HOUSING_FRED_REUSED,
  HOUSING_FRED_SERIES,
} from "../../src/lib/data/scheduler/housingFredSeedCatalog";

loadEnvConfig(process.cwd());

/** 近期观测阈值：月 3 个自然月 / 周 21 天 / 季 9 个月（含发布滞后） */
function obsCutoffIso(granularity: DataGranularity, now = new Date()): string {
  const d = new Date(now);
  if (granularity === "WEEKLY") {
    d.setUTCDate(d.getUTCDate() - 21);
    return d.toISOString().slice(0, 10);
  }
  if (granularity === "QUARTERLY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 9, 1)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
}

/** 历史深度断言：首观测年份不晚于此（EXHOSLUSM495S 因 NAR 许可短史，不做严格断言） */
const HISTORY_DEPTH_MAX_FIRST_YEAR: Record<string, number> = {
  PERMIT: 1961,
  HOUST1F: 1960,
  HSN1F: 1964,
  MSACSR: 1964,
  COMPUTSA: 1969,
  MORTGAGE30US: 1972,
  MORTGAGE15US: 1992,
  RHORUSQ156N: 1966,
  DRSFRMACBS: 1992,
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");

  console.log(
    `[verify-housing] 目录 ${HOUSING_FRED_SERIES.length} 条新 seed + ${HOUSING_FRED_REUSED.length} 条复用`,
  );

  if (!useDb) {
    console.log("[verify-housing] 通过（加 --db 检查数据库与近期观测）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-housing] 订阅启用与 releaseRule（日历型=economic_calendar，probe 型=probe_interval）");
    let subsOk = 0;
    for (const row of HOUSING_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) {
        console.error(`  ✗ 缺 Instrument ${row.code}`);
        errors++;
        continue;
      }
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub?.enabled) {
        console.error(`  ✗ 未启用订阅 ${row.code}`);
        errors++;
        continue;
      }
      const rule = sub.releaseRule as { type?: string } | null;
      const expected = row.scheduleKind === "calendar" ? "economic_calendar" : "probe_interval";
      if (rule?.type !== expected) {
        console.error(`  ✗ ${row.code} releaseRule 应为 ${expected}，实际 ${rule?.type}`);
        errors++;
        continue;
      }
      subsOk++;
    }
    console.log(`  ✓ ${subsOk}/${HOUSING_FRED_SERIES.length} 条订阅启用且 releaseRule 正确`);

    console.log("[verify-housing] 复用序列存在（phase2 seed）+ unit 完整性");
    for (const reused of HOUSING_FRED_REUSED) {
      const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
      if (!inst) {
        console.error(`  ✗ 缺复用序列 ${reused.code}（data:seed-${reused.seededBy}）`);
        errors++;
        continue;
      }
      if (!inst.unit?.trim()) {
        console.error(`  ✗ ${reused.code} unit 为空（运行 data:seed-housing 回填）`);
        errors++;
        continue;
      }
      console.log(`  ✓ ${reused.code}（unit=${inst.unit}）`);
    }

    console.log("[verify-housing] 发布包归属（按 FRED 官方 Release 分组）");
    let pkgOk = 0;
    const pkgExpectations = [
      ...HOUSING_FRED_SERIES.map((r) => ({ code: r.code, expected: r.releasePackageId })),
      ...HOUSING_FRED_REUSED.map((r) => ({ code: r.code, expected: r.expectedReleasePackageId })),
    ];
    for (const { code, expected } of pkgExpectations) {
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) continue;
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (sub?.releasePackageId !== expected) {
        console.error(
          `  ✗ ${code} 所属发布包应为 ${expected}，实际 ${sub?.releasePackageId ?? "无"}（跑 data:seed-release-packages）`,
        );
        errors++;
        continue;
      }
      pkgOk++;
    }
    console.log(`  ✓ ${pkgOk}/${pkgExpectations.length} 条发布包归属正确`);

    console.log("[verify-housing] Instrument metadata（仅本维度 seed 的 10 条）");
    let metaOk = 0;
    for (const row of HOUSING_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const meta =
        inst.metadata && typeof inst.metadata === "object" && !Array.isArray(inst.metadata)
          ? (inst.metadata as Record<string, unknown>)
          : {};
      const missing: string[] = [];
      if (meta.countryCode !== "US") missing.push("countryCode");
      if (meta.countryNameZh !== "美国") missing.push("countryNameZh");
      if (typeof meta.source !== "string" || !meta.source.trim()) missing.push("source");
      if (typeof meta.displayName !== "string" || !meta.displayName.trim()) missing.push("displayName");
      if (typeof meta.catalogCategory !== "string" || !meta.catalogCategory.trim()) missing.push("catalogCategory");
      if (!inst.unit?.trim()) missing.push("unit");
      if (!inst.freqLabel?.trim()) missing.push("freqLabel");
      if (missing.length > 0) {
        console.error(`  ✗ ${row.code} 缺 metadata: ${missing.join(", ")}`);
        errors++;
      } else {
        metaOk++;
      }
    }
    console.log(`  ✓ ${metaOk}/${HOUSING_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-housing] 近期观测");
    let obsOk = 0;
    const allRows = [
      ...HOUSING_FRED_SERIES.map((r) => ({ code: r.code, fredId: r.fredId, granularity: r.granularity })),
      ...HOUSING_FRED_REUSED.map((r) => ({ code: r.code, fredId: r.fredId, granularity: r.granularity })),
    ];
    for (const row of allRows) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const latest = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const cutoff = obsCutoffIso(row.granularity);
      if (!latest) {
        console.error(`  ✗ ${row.fredId} 无观测（运行 data:backfill-empty 或 data:sync-one -- ${row.code}）`);
        errors++;
        continue;
      }
      const latestIso = latest.obsDate.toISOString().slice(0, 10);
      if (latestIso < cutoff) {
        console.error(`  ✗ ${row.fredId} 最新 ${latestIso} 早于阈值 ${cutoff}（${row.granularity}）`);
        errors++;
        continue;
      }
      obsOk++;
    }
    console.log(`  ✓ ${obsOk}/${allRows.length} 条近期观测在窗口内`);

    console.log("[verify-housing] 历史深度（Spec §3 核实列，EXHOSLUSM495S 因 NAR 许可短史豁免）");
    let depthOk = 0;
    for (const row of HOUSING_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const first = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "asc" },
      });
      if (!first) continue;
      if (row.fredId === "EXHOSLUSM495S") {
        console.log(`  · EXHOSLUSM495S 实际历史深度：首观测 ${first.obsDate.toISOString().slice(0, 10)}`);
        depthOk++;
        continue;
      }
      const firstYear = first.obsDate.getUTCFullYear();
      const maxFirstYear = HISTORY_DEPTH_MAX_FIRST_YEAR[row.fredId];
      if (maxFirstYear && firstYear > maxFirstYear) {
        console.error(`  ✗ ${row.fredId} 首观测 ${firstYear} 晚于预期 ≤${maxFirstYear}（历史回填不完整？）`);
        errors++;
        continue;
      }
      depthOk++;
    }
    console.log(`  ✓ ${depthOk}/${HOUSING_FRED_SERIES.length} 条历史深度符合预期`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-housing] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-housing] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 美国对外部门与美元自检
 *
 * npm run data:verify-external-dollar
 * npm run data:verify-external-dollar -- --db
 * Spec: docs/specs/us-external-dollar.spec.md §6
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import {
  EXTERNAL_DOLLAR_FRED_REUSED,
  EXTERNAL_DOLLAR_FRED_SERIES,
} from "../../src/lib/data/scheduler/externalDollarFredSeedCatalog";

loadEnvConfig(process.cwd());

function obsCutoffIso(granularity: DataGranularity, now = new Date()): string {
  const d = new Date(now);
  if (granularity === "DAILY") {
    d.setUTCDate(d.getUTCDate() - 14);
    return d.toISOString().slice(0, 10);
  }
  if (granularity === "WEEKLY") {
    d.setUTCDate(d.getUTCDate() - 21);
    return d.toISOString().slice(0, 10);
  }
  if (granularity === "QUARTERLY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 9, 1))
      .toISOString()
      .slice(0, 10);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
    .toISOString()
    .slice(0, 10);
}

const HISTORY_DEPTH_MAX_FIRST_YEAR: Record<string, number> = {
  DTWEXAFEGS: 2007,
  DTWEXEMEGS: 2007,
  BOPGSTB: 1993,
  BOPTEXP: 1993,
  BOPTIMP: 1993,
  // FRED 公开序列自 1999-Q1 起（非更早的历史重构）
  IEABC: 2000,
  IIPUSNETIQ: 2007,
  IQ: 1984,
  IR: 1984,
  W369RG3Q066SBEA: 1951,
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");

  console.log(
    `[verify-external-dollar] 目录 ${EXTERNAL_DOLLAR_FRED_SERIES.length} 条新 seed + ${EXTERNAL_DOLLAR_FRED_REUSED.length} 条复用`,
  );

  if (!useDb) {
    console.log("[verify-external-dollar] 通过（加 --db 检查数据库与近期观测）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log(
      "[verify-external-dollar] 订阅启用与 releaseRule（日历型=economic_calendar，probe 型=probe_interval）",
    );
    let subsOk = 0;
    for (const row of EXTERNAL_DOLLAR_FRED_SERIES) {
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
    console.log(`  ✓ ${subsOk}/${EXTERNAL_DOLLAR_FRED_SERIES.length} 条订阅启用且 releaseRule 正确`);

    console.log("[verify-external-dollar] 复用序列存在（phase2 seed）+ unit 完整性");
    for (const reused of EXTERNAL_DOLLAR_FRED_REUSED) {
      const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
      if (!inst) {
        console.error(`  ✗ 缺复用序列 ${reused.code}（data:seed-${reused.seededBy}）`);
        errors++;
        continue;
      }
      if (!inst.unit?.trim()) {
        console.error(`  ✗ ${reused.code} unit 为空（运行 data:seed-external-dollar 回填）`);
        errors++;
        continue;
      }
      console.log(`  ✓ ${reused.code}（unit=${inst.unit}${reused.inTemplate ? " · 进模板" : " · 仅归包"}）`);
    }

    console.log("[verify-external-dollar] 发布包归属（按 FRED 官方 Release 分组）");
    let pkgOk = 0;
    const pkgExpectations = [
      ...EXTERNAL_DOLLAR_FRED_SERIES.map((r) => ({ code: r.code, expected: r.releasePackageId })),
      ...EXTERNAL_DOLLAR_FRED_REUSED.map((r) => ({
        code: r.code,
        expected: r.expectedReleasePackageId,
      })),
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

    console.log("[verify-external-dollar] Instrument metadata（仅本维度 seed 的 10 条）");
    let metaOk = 0;
    for (const row of EXTERNAL_DOLLAR_FRED_SERIES) {
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
      if (typeof meta.catalogCategory !== "string" || !meta.catalogCategory.trim()) {
        missing.push("catalogCategory");
      }
      if (!inst.unit?.trim()) missing.push("unit");
      if (!inst.freqLabel?.trim()) missing.push("freqLabel");
      if (missing.length > 0) {
        console.error(`  ✗ ${row.code} 缺 metadata: ${missing.join(", ")}`);
        errors++;
      } else {
        metaOk++;
      }
    }
    console.log(`  ✓ ${metaOk}/${EXTERNAL_DOLLAR_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-external-dollar] 近期观测");
    let obsOk = 0;
    const allRows = [
      ...EXTERNAL_DOLLAR_FRED_SERIES.map((r) => ({
        code: r.code,
        fredId: r.fredId,
        granularity: r.granularity,
      })),
      ...EXTERNAL_DOLLAR_FRED_REUSED.filter((r) => r.inTemplate).map((r) => ({
        code: r.code,
        fredId: r.fredId,
        granularity: r.granularity,
      })),
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
        console.error(
          `  ✗ ${row.fredId} 无观测（运行 data:backfill-empty 或 data:sync-one -- ${row.code}）`,
        );
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

    console.log("[verify-external-dollar] 历史深度（Spec §3）");
    let depthOk = 0;
    for (const row of EXTERNAL_DOLLAR_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const first = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "asc" },
      });
      if (!first) continue;
      const firstYear = first.obsDate.getUTCFullYear();
      const maxFirstYear = HISTORY_DEPTH_MAX_FIRST_YEAR[row.fredId];
      if (maxFirstYear && firstYear > maxFirstYear) {
        console.error(
          `  ✗ ${row.fredId} 首观测 ${firstYear} 晚于预期 ≤${maxFirstYear}（历史回填不完整？）`,
        );
        errors++;
        continue;
      }
      depthOk++;
    }
    console.log(`  ✓ ${depthOk}/${EXTERNAL_DOLLAR_FRED_SERIES.length} 条历史深度符合预期`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-external-dollar] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-external-dollar] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

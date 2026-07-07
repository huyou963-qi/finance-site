/**
 * 美国货币政策与金融条件自检
 *
 * npm run data:verify-monetary
 * npm run data:verify-monetary -- --db
 * Spec: docs/specs/us-monetary-financial.spec.md §6
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import {
  MONETARY_FRED_REUSED,
  MONETARY_FRED_SERIES,
} from "../../src/lib/data/scheduler/monetaryFredSeedCatalog";

loadEnvConfig(process.cwd());

/** 近期观测阈值：日 7 天 / 周 21 天 / 月 3 个自然月 / 季 9 个月（含发布滞后） */
function obsCutoffIso(granularity: DataGranularity, now = new Date()): string {
  const d = new Date(now);
  if (granularity === "DAILY") {
    d.setUTCDate(d.getUTCDate() - 7);
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

/**
 * 历史深度断言：Spec §3「核实」列的首观测年份 + 1 年容差。
 * 管线全量回填下限为 1950-01-01（upsertObservations.observationWindowForFetch），
 * 故 FRED 起点早于 1950 的序列（BUSLOANS 1947）以 1951 为界。
 */
const HISTORY_DEPTH_MAX_FIRST_YEAR: Record<string, number> = {
  WRESBAL: 2002,
  TREAST: 2002,
  WLRRAL: 2002,
  WTREGEN: 2002,
  SOFR: 2018,
  IORB: 2021,
  RRPONTSYAWARD: 2013,
  EFFR: 2001,
  DGS2: 1977,
  DFII10: 2004,
  RRPONTSYD: 2004,
  DGS10: 1963,
  T10Y3M: 1983,
  NFCI: 1972,
  DRTSCILM: 1991,
  BUSLOANS: 1951,
  DRCCLACBS: 1992,
  DRBLACBS: 1988,
  // BAMLC0A0CM：ICE 许可限制，历史深度以实际回填为准（见 §3 注意 2），不设上限断言
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");

  console.log(
    `[verify-monetary] 目录 ${MONETARY_FRED_SERIES.length} 条新 seed + ${MONETARY_FRED_REUSED.length} 条复用`,
  );

  if (!useDb) {
    console.log("[verify-monetary] 通过（加 --db 检查数据库与近期观测）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-monetary] 订阅启用与 releaseRule");
    let subsOk = 0;
    for (const row of MONETARY_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) {
        console.error(`  ✗ 缺 Instrument ${row.code}`);
        errors++;
        continue;
      }
      const sub = await prisma.dataSubscription.findUnique({
        where: { instrumentId: inst.id },
      });
      if (!sub?.enabled) {
        console.error(`  ✗ 未启用订阅 ${row.code}`);
        errors++;
        continue;
      }
      const rule = sub.releaseRule as { type?: string } | null;
      if (rule?.type !== "probe_interval") {
        console.error(`  ✗ ${row.code} releaseRule 应为 probe_interval，实际 ${rule?.type}`);
        errors++;
        continue;
      }
      subsOk++;
    }
    console.log(`  ✓ ${subsOk}/${MONETARY_FRED_SERIES.length} 条订阅启用且为 probe_interval`);

    console.log("[verify-monetary] 复用序列存在（cpi/phase2 seed）+ unit 完整性");
    for (const reused of MONETARY_FRED_REUSED) {
      const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
      if (!inst) {
        console.error(`  ✗ 缺复用序列 ${reused.code}（data:seed-${reused.seededBy}）`);
        errors++;
        continue;
      }
      if (!inst.unit?.trim()) {
        console.error(`  ✗ ${reused.code} unit 为空（运行 data:seed-monetary 回填）`);
        errors++;
        continue;
      }
      console.log(`  ✓ ${reused.code}（unit=${inst.unit}）`);
    }

    console.log("[verify-monetary] 发布包归属（同源同频分组，见 releasePackageCatalog.ts probePkg）");
    let pkgOk = 0;
    const pkgExpectations = [
      ...MONETARY_FRED_SERIES.map((r) => ({ code: r.code, expected: r.releasePackageId })),
      ...MONETARY_FRED_REUSED.map((r) => ({ code: r.code, expected: r.expectedReleasePackageId })),
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

    console.log(`[verify-monetary] Instrument metadata（本维度 seed 的 ${MONETARY_FRED_SERIES.length} 条）`);
    let metaOk = 0;
    for (const row of MONETARY_FRED_SERIES) {
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
    console.log(`  ✓ ${metaOk}/${MONETARY_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-monetary] 近期观测");
    let obsOk = 0;
    const allRows = [
      ...MONETARY_FRED_SERIES.map((r) => ({ code: r.code, fredId: r.fredId, granularity: r.granularity })),
      ...MONETARY_FRED_REUSED.map((r) => ({ code: r.code, fredId: r.fredId, granularity: r.granularity })),
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
        console.error(`  ✗ ${row.fredId} 无观测（运行 data:sync-one -- ${row.code}）`);
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

    console.log("[verify-monetary] 历史深度（Spec §3 核实列）");
    let depthOk = 0;
    for (const row of MONETARY_FRED_SERIES) {
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
      if (row.fredId === "BAMLC0A0CM") {
        console.log(`  · BAMLC0A0CM 实际历史深度：首观测 ${first.obsDate.toISOString().slice(0, 10)}`);
      }
    }
    console.log(`  ✓ ${depthOk}/${MONETARY_FRED_SERIES.length} 条历史深度符合预期`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-monetary] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-monetary] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 美国零售销售分项（Census Advance Monthly Retail Trade Survey）自检
 *
 * npm run data:verify-us-retail-sales
 * npm run data:verify-us-retail-sales -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import { US_RETAIL_SALES_FRED_SERIES } from "../../src/lib/data/scheduler/usRetailSalesFredSeedCatalog";

loadEnvConfig(process.cwd());

function obsCutoffIso(granularity: DataGranularity, now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
    .toISOString()
    .slice(0, 10);
}

/** 历史深度断言：首观测年份不晚于此（全部序列 FRED 实测均自 1992-01 起） */
const HISTORY_DEPTH_MAX_FIRST_YEAR = 1993;

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");

  console.log(
    `[verify-us-retail-sales] 目录 ${US_RETAIL_SALES_FRED_SERIES.length} 条新 seed`,
  );

  if (!useDb) {
    console.log("[verify-us-retail-sales] 通过（加 --db 检查数据库与近期观测）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-us-retail-sales] 订阅启用与 releaseRule（应为 economic_calendar）");
    let subsOk = 0;
    for (const row of US_RETAIL_SALES_FRED_SERIES) {
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
      if (rule?.type !== "economic_calendar") {
        console.error(`  ✗ ${row.code} releaseRule 应为 economic_calendar，实际 ${rule?.type}`);
        errors++;
        continue;
      }
      subsOk++;
    }
    console.log(`  ✓ ${subsOk}/${US_RETAIL_SALES_FRED_SERIES.length} 条订阅启用且 releaseRule 正确`);

    console.log("[verify-us-retail-sales] 发布包归属（应全部归入 us.bls.retail_sales）");
    let pkgOk = 0;
    for (const row of US_RETAIL_SALES_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (sub?.releasePackageId !== row.releasePackageId) {
        console.error(
          `  ✗ ${row.code} 所属发布包应为 ${row.releasePackageId}，实际 ${sub?.releasePackageId ?? "无"}（跑 data:seed-release-packages）`,
        );
        errors++;
        continue;
      }
      pkgOk++;
    }
    console.log(`  ✓ ${pkgOk}/${US_RETAIL_SALES_FRED_SERIES.length} 条发布包归属正确`);

    console.log("[verify-us-retail-sales] Instrument metadata");
    let metaOk = 0;
    for (const row of US_RETAIL_SALES_FRED_SERIES) {
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
    console.log(`  ✓ ${metaOk}/${US_RETAIL_SALES_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-us-retail-sales] 近期观测（§0.1）");
    let obsOk = 0;
    for (const row of US_RETAIL_SALES_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const latest = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const cutoff = obsCutoffIso(row.granularity);
      if (!latest) {
        console.error(
          `  ✗ ${row.fredId} 无观测（运行 npm run data:sync-one -- ${row.code}）`,
        );
        errors++;
        continue;
      }
      const latestIso = latest.obsDate.toISOString().slice(0, 10);
      if (latestIso < cutoff) {
        console.error(
          `  ✗ ${row.fredId} 最新 ${latestIso} 早于阈值 ${cutoff}（${row.granularity}）`,
        );
        errors++;
        continue;
      }
      obsOk++;
    }
    console.log(`  ✓ ${obsOk}/${US_RETAIL_SALES_FRED_SERIES.length} 条近期观测在窗口内`);

    console.log("[verify-us-retail-sales] 历史深度（FRED 实测均自 1992-01 起）");
    let depthOk = 0;
    for (const row of US_RETAIL_SALES_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const first = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "asc" },
      });
      if (!first) continue;
      const firstYear = first.obsDate.getUTCFullYear();
      if (firstYear > HISTORY_DEPTH_MAX_FIRST_YEAR) {
        console.error(
          `  ✗ ${row.fredId} 首观测 ${firstYear} 晚于预期 ≤${HISTORY_DEPTH_MAX_FIRST_YEAR}（历史回填不完整？）`,
        );
        errors++;
        continue;
      }
      depthOk++;
    }
    console.log(`  ✓ ${depthOk}/${US_RETAIL_SALES_FRED_SERIES.length} 条历史深度符合预期`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-us-retail-sales] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-us-retail-sales] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 美国制造业与库存周期自检
 *
 * npm run data:verify-industry-inventory
 * npm run data:verify-industry-inventory -- --db
 * Spec: docs/specs/us-industry-inventory.spec.md §6
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  INDUSTRY_INVENTORY_FRED_SERIES,
  INDUSTRY_INVENTORY_ISM_REUSED,
} from "../../src/lib/data/scheduler/industryInventoryFredSeedCatalog";

loadEnvConfig(process.cwd());

function obsCutoffIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
    .toISOString()
    .slice(0, 10);
}

/** 历史深度：首观测年份不晚于此 */
const HISTORY_DEPTH_MAX_FIRST_YEAR: Record<string, number> = {
  DGORDER: 1993,
  ADXTNO: 1993,
  NEWORDER: 1993,
  AMDMUO: 1993,
  AMTMTI: 1993,
  IPMAN: 1973,
  BUSINV: 1993,
  ISRATIO: 1993,
  MNFCTRIRSA: 1993,
  MCUMFN: 1973,
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");

  console.log(
    `[verify-industry-inventory] 目录 ${INDUSTRY_INVENTORY_FRED_SERIES.length} 条新 seed + ${INDUSTRY_INVENTORY_ISM_REUSED.length} 条 ISM 复用`,
  );

  if (!useDb) {
    console.log("[verify-industry-inventory] 通过（加 --db 检查数据库与近期观测）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-industry-inventory] 订阅启用与 releaseRule");
    let subsOk = 0;
    for (const row of INDUSTRY_INVENTORY_FRED_SERIES) {
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
    console.log(`  ✓ ${subsOk}/${INDUSTRY_INVENTORY_FRED_SERIES.length} 条订阅启用且 releaseRule 正确`);

    console.log("[verify-industry-inventory] ISM 复用序列存在");
    for (const reused of INDUSTRY_INVENTORY_ISM_REUSED) {
      const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
      if (!inst) {
        console.error(`  ✗ 缺 ISM ${reused.code}（data:seed-ism-te）`);
        errors++;
        continue;
      }
      const obsCount = await prisma.macroObservation.count({ where: { instrumentId: inst.id } });
      if (obsCount < 12) {
        console.error(`  ✗ ${reused.code} 观测过少（${obsCount}）`);
        errors++;
        continue;
      }
      console.log(`  ✓ ${reused.code}（obs=${obsCount}）`);
    }

    console.log("[verify-industry-inventory] 发布包归属");
    let pkgOk = 0;
    const pkgExpectations = [
      ...INDUSTRY_INVENTORY_FRED_SERIES.map((r) => ({
        code: r.code,
        expected: r.releasePackageId,
      })),
      ...INDUSTRY_INVENTORY_ISM_REUSED.map((r) => ({
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

    console.log("[verify-industry-inventory] Instrument metadata");
    let metaOk = 0;
    for (const row of INDUSTRY_INVENTORY_FRED_SERIES) {
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
    console.log(`  ✓ ${metaOk}/${INDUSTRY_INVENTORY_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-industry-inventory] 近期观测");
    let obsOk = 0;
    const cutoff = obsCutoffIso();
    for (const row of INDUSTRY_INVENTORY_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const latest = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      if (!latest) {
        console.error(`  ✗ ${row.fredId} 无观测（data:backfill-empty 或 data:sync-one -- ${row.code}）`);
        errors++;
        continue;
      }
      const latestIso = latest.obsDate.toISOString().slice(0, 10);
      if (latestIso < cutoff) {
        console.error(`  ✗ ${row.fredId} 最新 ${latestIso} 早于阈值 ${cutoff}`);
        errors++;
        continue;
      }
      obsOk++;
    }
    console.log(`  ✓ ${obsOk}/${INDUSTRY_INVENTORY_FRED_SERIES.length} 条近期观测在窗口内`);

    console.log("[verify-industry-inventory] 历史深度");
    let depthOk = 0;
    for (const row of INDUSTRY_INVENTORY_FRED_SERIES) {
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
    console.log(`  ✓ ${depthOk}/${INDUSTRY_INVENTORY_FRED_SERIES.length} 条历史深度符合预期`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-industry-inventory] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-industry-inventory] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

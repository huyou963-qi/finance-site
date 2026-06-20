/**
 * CPI 分析框架自检
 *
 * npm run data:verify-cpi
 * npm run data:verify-cpi -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { CPI_FRED_SERIES } from "../../src/lib/data/scheduler/cpiFredSeedCatalog";
import { mergedInvestingCalendarByFred } from "../../src/lib/data/scheduler/investingEventMap";

loadEnvConfig(process.cwd());

const CPI_CATEGORIES = new Set([
  "CPI 综合",
  "CPI 住房",
  "CPI 核心商品",
  "CPI 核心服务",
  "CPI 分项",
  "通胀驱动因子",
]);

/** §0.1：月频最新 obs 不早于当前月 − 3 个自然月（取该月 1 日） */
function monthlyObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  return d.toISOString().slice(0, 10);
}

/** §0.1：日频最新 obs 不早于当前日 − 7 个自然日 */
function dailyObsCutoffIso(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function obsCutoffIso(granularity: string, now = new Date()): string {
  return granularity === "DAILY" ? dailyObsCutoffIso(now) : monthlyObsCutoffIso(now);
}

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const monthlyCutoff = monthlyObsCutoffIso();
  const dailyCutoff = dailyObsCutoffIso();
  console.log(`[verify-cpi] 近期观测阈值 月频≥${monthlyCutoff} 日频≥${dailyCutoff}`);

  console.log("[verify-cpi] 日历映射");
  const cal = mergedInvestingCalendarByFred();
  const needCalendar = CPI_FRED_SERIES.filter((r) => r.granularity === "MONTHLY");
  for (const row of needCalendar) {
    if (row.fredId === "UNRATE" || cal[row.fredId]) continue;
    if (
      row.fredId.startsWith("CUSR0000") ||
      row.fredId.startsWith("CPI") ||
      row.fredId === "PPIFIS" ||
      row.fredId === "CES0500000003" ||
      row.fredId === "PCEPILFE"
    ) {
      if (!cal[row.fredId]) {
        console.error(`  ✗ 缺日历映射 ${row.fredId}`);
        errors++;
      }
    }
  }
  if (errors === 0) console.log(`  ✓ ${needCalendar.length} 条月频序列日历映射检查通过`);

  if (!useDb) {
    console.log("[verify-cpi] 通过（加 --db 检查数据库与近期观测）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-cpi] 订阅与观测");
    let subsOk = 0;
    for (const row of CPI_FRED_SERIES) {
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
      subsOk++;
    }
    console.log(`  ✓ ${subsOk}/${CPI_FRED_SERIES.length} 条 CPI 订阅已启用`);

    console.log("[verify-cpi] Instrument metadata");
    let metaOk = 0;
    for (const row of CPI_FRED_SERIES) {
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
    console.log(`  ✓ ${metaOk}/${CPI_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-cpi] 近期观测（§0.1）");
    let obsOk = 0;
    for (const row of CPI_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const obs = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const cutoff = obsCutoffIso(row.granularity);
      if (!obs) {
        console.error(`  ✗ ${row.fredId} 无观测（运行 npm run data:worker）`);
        errors++;
        continue;
      }
      const latest = obs.obsDate.toISOString().slice(0, 10);
      if (latest < cutoff) {
        console.error(
          `  ✗ ${row.fredId} 最新 ${latest} 早于阈值 ${cutoff}（${row.granularity}）`,
        );
        errors++;
        continue;
      }
      obsOk++;
      if (row.fredId === "CPIAUCSL") {
        console.log(`  ✓ CPIAUCSL 最新观测 ${latest} = ${obs.value}`);
      }
    }
    console.log(`  ✓ ${obsOk}/${CPI_FRED_SERIES.length} 条近期观测在窗口内`);

    for (const cat of CPI_CATEGORIES) {
      console.log(`  · 目录分类「${cat}」`);
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) process.exit(1);
  console.log("[verify-cpi] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

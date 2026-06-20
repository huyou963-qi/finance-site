/**
 * 美国就业市场分析框架自检
 *
 * npm run data:verify-labor
 * npm run data:verify-labor -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  LABOR_FRED_SERIES,
  LABOR_JOLTS_FRED_IDS,
} from "../../src/lib/data/scheduler/laborFredSeedCatalog";
import { mergedInvestingCalendarByFred } from "../../src/lib/data/scheduler/investingEventMap";

loadEnvConfig(process.cwd());

const LABOR_CATEGORIES = new Set([
  "就业与工资",
  "劳动力流动",
  "领先与深度",
  "就业结构",
]);

function monthlyObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  return d.toISOString().slice(0, 10);
}

/** JOLTS 相对 CES 滞后约 1 月 */
function joltsObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1));
  return d.toISOString().slice(0, 10);
}

function weeklyObsCutoffIso(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 14);
  return d.toISOString().slice(0, 10);
}

function obsCutoffIso(fredId: string, granularity: string, now = new Date()): string {
  if (granularity === "WEEKLY") return weeklyObsCutoffIso(now);
  if (LABOR_JOLTS_FRED_IDS.has(fredId)) return joltsObsCutoffIso(now);
  return monthlyObsCutoffIso(now);
}

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const monthlyCutoff = monthlyObsCutoffIso();
  const joltsCutoff = joltsObsCutoffIso();
  const weeklyCutoff = weeklyObsCutoffIso();
  console.log(
    `[verify-labor] 近期观测阈值 月频≥${monthlyCutoff} JOLTS≥${joltsCutoff} 周频≥${weeklyCutoff}`,
  );

  console.log("[verify-labor] 日历映射");
  const cal = mergedInvestingCalendarByFred();
  const needCalendar = LABOR_FRED_SERIES.filter(
    (r) => r.granularity === "MONTHLY" && r.fredId !== "ICSA" && r.fredId !== "CCSA",
  );
  for (const row of needCalendar) {
    if (cal[row.fredId]) continue;
    const mustHave = new Set([
      "UNRATE",
      "PAYEMS",
      "U6RATE",
      "JTSJOR",
      "ICSA",
    ]);
    if (mustHave.has(row.fredId)) {
      console.error(`  ✗ 缺日历映射 ${row.fredId}`);
      errors++;
    }
  }
  if (errors === 0) console.log(`  ✓ 就业月频日历映射检查通过`);

  if (!useDb) {
    console.log("[verify-labor] 通过（加 --db 检查数据库与近期观测）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-labor] 订阅与观测");
    let subsOk = 0;
    for (const row of LABOR_FRED_SERIES) {
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
    console.log(`  ✓ ${subsOk}/${LABOR_FRED_SERIES.length} 条就业订阅已启用`);

    console.log("[verify-labor] Instrument metadata");
    let metaOk = 0;
    for (const row of LABOR_FRED_SERIES) {
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
    console.log(`  ✓ ${metaOk}/${LABOR_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-labor] 近期观测（§0.1）");
    let obsOk = 0;
    for (const row of LABOR_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const obs = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const cutoff = obsCutoffIso(row.fredId, row.granularity);
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
      if (row.fredId === "UNRATE") {
        console.log(`  ✓ UNRATE 最新观测 ${latest} = ${obs.value}`);
      }
    }
    console.log(`  ✓ ${obsOk}/${LABOR_FRED_SERIES.length} 条近期观测在窗口内`);

    for (const cat of LABOR_CATEGORIES) {
      console.log(`  · 目录分类「${cat}」`);
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) process.exit(1);
  console.log("[verify-labor] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

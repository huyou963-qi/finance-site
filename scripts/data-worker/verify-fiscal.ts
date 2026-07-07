/**
 * 美国财政分析框架自检
 *
 * npm run data:verify-fiscal
 * npm run data:verify-fiscal -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { FISCAL_COMPOSITE_SERIES } from "../../src/lib/data/scheduler/fiscalCompositeFred";
import {
  FISCAL_FRED_SERIES,
  FISCAL_FRED_YOY_SERIES,
} from "../../src/lib/data/scheduler/fiscalFredSeedCatalog";
import { FISCAL_TREASURY_COMPOSITE_SERIES } from "../../src/lib/data/scheduler/fiscalTreasuryComposite";
import {
  TREASURY_FISCAL_PENDING_ROLE_IDS,
  TREASURY_FISCAL_SERIES,
} from "../../src/lib/data/scheduler/treasuryFiscalSeedCatalog";

loadEnvConfig(process.cwd());

function monthlyObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1));
  return d.toISOString().slice(0, 10);
}

function quarterlyObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 9, 1));
  return d.toISOString().slice(0, 10);
}

function dailyObsCutoffIso(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function weeklyObsCutoffIso(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 21);
  return d.toISOString().slice(0, 10);
}

function annualObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 1));
  return d.toISOString().slice(0, 10);
}

function obsCutoffIso(granularity: string, now = new Date()): string {
  if (granularity === "QUARTERLY") return quarterlyObsCutoffIso(now);
  if (granularity === "DAILY") return dailyObsCutoffIso(now);
  if (granularity === "WEEKLY") return weeklyObsCutoffIso(now);
  if (granularity === "ANNUAL") return annualObsCutoffIso(now);
  return monthlyObsCutoffIso(now);
}

type VerifyRow = {
  code: string;
  roleId?: string;
  granularity: string;
  freqLabel: string;
};

async function verifyInstrumentRows(
  prisma: PrismaClient,
  label: string,
  rows: VerifyRow[],
): Promise<number> {
  let ok = 0;
  let errors = 0;
  console.log(`[verify-fiscal] ${label}`);
  for (const row of rows) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${row.code}（npm run data:seed-fiscal）`);
      errors++;
      continue;
    }
    const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
    if (!sub?.enabled) {
      console.error(`  ✗ 未启用订阅 ${row.code}`);
      errors++;
      continue;
    }
    const obs = await prisma.macroObservation.findFirst({
      where: { instrumentId: inst.id },
      orderBy: { obsDate: "desc" },
    });
    const cutoff = obsCutoffIso(row.granularity);
    if (!obs) {
      console.error(`  ✗ ${row.code} 无观测（npm run data:sync-fiscal）`);
      errors++;
      continue;
    }
    const latest = obs.obsDate.toISOString().slice(0, 10);
    if (latest < cutoff) {
      console.error(`  ✗ ${row.code} 最新 ${latest} 早于阈值 ${cutoff}`);
      errors++;
      continue;
    }
    const md =
      inst.metadata && typeof inst.metadata === "object"
        ? (inst.metadata as Record<string, unknown>)
        : {};
    const fa =
      md.fetchAcquisition && typeof md.fetchAcquisition === "object"
        ? (md.fetchAcquisition as Record<string, unknown>)
        : {};
    console.log(
      `  ✓ ${row.code} latest=${latest}@${obs.value} fa=${fa.status ?? "—"} freq=${row.freqLabel}`,
    );
    ok++;
  }
  console.log(`  ✓ ${ok}/${rows.length} 条 ${label} OK`);
  return errors;
}

async function main() {
  const useDb = process.argv.includes("--db");

  console.log("[verify-fiscal] Treasury 序列（已配置）");
  for (const row of TREASURY_FISCAL_SERIES) {
    console.log(`  · ${row.roleId} → ${row.code}`);
  }

  console.log("[verify-fiscal] FRED 财政扩展");
  for (const row of FISCAL_FRED_SERIES) {
    console.log(`  · ${row.roleId} → ${row.fredId}`);
  }
  for (const row of FISCAL_FRED_YOY_SERIES) {
    console.log(`  · ${row.roleId} → ${row.fredId} (YoY)`);
  }
  for (const row of FISCAL_COMPOSITE_SERIES) {
    console.log(`  · ${row.roleId} → ${row.code} (composite)`);
  }
  for (const row of FISCAL_TREASURY_COMPOSITE_SERIES) {
    console.log(`  · ${row.roleId} → ${row.code} (treasury-composite)`);
  }

  if (TREASURY_FISCAL_PENDING_ROLE_IDS.length > 0) {
    console.log("[verify-fiscal] 待人工/后续（未入库）");
    for (const roleId of TREASURY_FISCAL_PENDING_ROLE_IDS) {
      console.log(`  ⚠ ${roleId}`);
    }
  }

  if (!useDb) {
    console.log("[verify-fiscal] 通过（加 --db 检查观测）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    let totalErrors = 0;
    totalErrors += await verifyInstrumentRows(
      prisma,
      "Treasury 观测",
      TREASURY_FISCAL_SERIES.map((r) => ({
        code: r.code,
        granularity: r.granularity,
        freqLabel: r.freqLabel,
      })),
    );
    totalErrors += await verifyInstrumentRows(
      prisma,
      "FRED 财政观测",
      FISCAL_FRED_SERIES.map((r) => ({
        code: r.code,
        granularity: r.granularity,
        freqLabel: r.freqLabel,
      })),
    );
    totalErrors += await verifyInstrumentRows(
      prisma,
      "FRED YoY 观测",
      FISCAL_FRED_YOY_SERIES.map((r) => ({
        code: r.code,
        granularity: r.granularity,
        freqLabel: r.freqLabel,
      })),
    );
    totalErrors += await verifyInstrumentRows(
      prisma,
      "FRED 复合观测",
      FISCAL_COMPOSITE_SERIES.map((r) => ({
        code: r.code,
        granularity: r.granularity,
        freqLabel: r.freqLabel,
      })),
    );
    totalErrors += await verifyInstrumentRows(
      prisma,
      "Treasury 复合观测",
      FISCAL_TREASURY_COMPOSITE_SERIES.map((r) => ({
        code: r.code,
        granularity: r.granularity,
        freqLabel: r.freqLabel,
      })),
    );
    if (totalErrors > 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  console.log("[verify-fiscal] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

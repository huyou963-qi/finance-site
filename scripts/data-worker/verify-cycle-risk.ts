/**
 * 美国增长动能与衰退风险自检
 *
 * npm run data:verify-cycle-risk
 * npm run data:verify-cycle-risk -- --db
 * Spec: docs/specs/us-cycle-risk.spec.md §6
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import {
  CYCLE_RISK_FRED_SERIES,
  CYCLE_RISK_REUSED,
} from "../../src/lib/data/scheduler/cycleRiskFredSeedCatalog";

loadEnvConfig(process.cwd());

/** 近期观测阈值：月 3 个自然月 / 季 9 个月（含发布滞后） */
function obsCutoffIso(granularity: DataGranularity, now = new Date()): string {
  if (granularity === "QUARTERLY") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 9, 1)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);
}

const HISTORY_DEPTH_MAX_FIRST_YEAR: Record<string, number> = {
  RECPROUSM156N: 1968,
  SAHMREALTIME: 1960,
  W875RX1: 1960,
  CMRMTSPL: 1968,
  DSPIC96: 1960,
  FINSLC1: 1951,
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  console.log(`[verify-cycle-risk] ${CYCLE_RISK_FRED_SERIES.length} 条新 seed + ${CYCLE_RISK_REUSED.length} 条复用`);

  if (!useDb) {
    console.log("[verify-cycle-risk] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-cycle-risk] 订阅启用与 releaseRule（日历型=economic_calendar，probe 型=probe_interval）");
    let subsOk = 0;
    for (const row of CYCLE_RISK_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) { console.error(`  ✗ 缺 Instrument ${row.code}`); errors++; continue; }
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub?.enabled) { console.error(`  ✗ 未启用订阅 ${row.code}`); errors++; continue; }
      const expected = row.scheduleKind === "calendar" ? "economic_calendar" : "probe_interval";
      const t = (sub.releaseRule as { type?: string })?.type;
      if (t !== expected) { console.error(`  ✗ ${row.code} releaseRule 应 ${expected}，实际 ${t}`); errors++; continue; }
      subsOk++;
    }
    console.log(`  ✓ ${subsOk}/${CYCLE_RISK_FRED_SERIES.length} 条订阅启用且 releaseRule 正确`);

    console.log("[verify-cycle-risk] 复用序列存在（phase2 / Agent C）");
    for (const reused of CYCLE_RISK_REUSED) {
      const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
      if (!inst) { console.error(`  ✗ 缺复用序列 ${reused.code}（${reused.seededBy}）`); errors++; continue; }
      console.log(`  ✓ ${reused.code}（${reused.seededBy}）`);
    }

    console.log("[verify-cycle-risk] Instrument metadata（6 条新 seed）");
    let metaOk = 0;
    for (const row of CYCLE_RISK_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const meta = inst.metadata && typeof inst.metadata === "object" && !Array.isArray(inst.metadata)
        ? (inst.metadata as Record<string, unknown>) : {};
      const missing: string[] = [];
      if (meta.countryCode !== "US") missing.push("countryCode");
      if (typeof meta.source !== "string" || !meta.source.trim()) missing.push("source");
      if (typeof meta.displayName !== "string" || !meta.displayName.trim()) missing.push("displayName");
      if (typeof meta.catalogCategory !== "string" || !meta.catalogCategory.trim()) missing.push("catalogCategory");
      if (!inst.unit?.trim()) missing.push("unit");
      if (!inst.freqLabel?.trim()) missing.push("freqLabel");
      if (missing.length) { console.error(`  ✗ ${row.code} 缺 metadata: ${missing.join(", ")}`); errors++; }
      else metaOk++;
    }
    console.log(`  ✓ ${metaOk}/${CYCLE_RISK_FRED_SERIES.length} 条 metadata 完整`);

    console.log("[verify-cycle-risk] 近期观测");
    let obsOk = 0;
    const allRows = [
      ...CYCLE_RISK_FRED_SERIES.map((r) => ({ code: r.code, granularity: r.granularity })),
      ...CYCLE_RISK_REUSED.map((r) => ({ code: r.code, granularity: r.granularity })),
    ];
    for (const row of allRows) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const latest = await prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "desc" } });
      const cutoff = obsCutoffIso(row.granularity);
      if (!latest) { console.error(`  ✗ ${row.code} 无观测（data:backfill-empty 或 sync-one）`); errors++; continue; }
      const iso = latest.obsDate.toISOString().slice(0, 10);
      // USREC 仅在衰退期变 1，平时长期无「新」发布但值恒定——放宽为 12 月
      const relaxed = row.code === "sched_fred_USREC"
        ? new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth(), 1)).toISOString().slice(0, 10)
        : cutoff;
      if (iso < relaxed) { console.error(`  ✗ ${row.code} 最新 ${iso} 早于阈值 ${relaxed}`); errors++; continue; }
      obsOk++;
    }
    console.log(`  ✓ ${obsOk}/${allRows.length} 条近期观测在窗口内`);

    console.log("[verify-cycle-risk] 历史深度");
    let depthOk = 0;
    for (const row of CYCLE_RISK_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) continue;
      const first = await prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
      if (!first) continue;
      const fy = first.obsDate.getUTCFullYear();
      const max = HISTORY_DEPTH_MAX_FIRST_YEAR[row.fredId];
      if (max && fy > max) { console.error(`  ✗ ${row.fredId} 首观测 ${fy} 晚于预期 ≤${max}`); errors++; continue; }
      depthOk++;
    }
    console.log(`  ✓ ${depthOk}/${CYCLE_RISK_FRED_SERIES.length} 条历史深度符合预期`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) { console.error(`[verify-cycle-risk] 失败：${errors} 项`); process.exit(1); }
  console.log("[verify-cycle-risk] 通过");
}

main().catch((e) => { console.error(e); process.exit(1); });

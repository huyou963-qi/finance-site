/**
 * 美国经济 Overview 分析框架自检
 *
 * npm run data:verify-overview
 * npm run data:verify-overview -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  OVERVIEW_FRED_SERIES,
} from "../../src/lib/data/scheduler/overviewFredSeedCatalog";
import {
  OVERVIEW_MDS_ROLE_CODES,
  OVERVIEW_SOURCE_REGISTRY,
  OVERVIEW_TBD_ROLES,
} from "../../src/lib/data/overviewSourceRegistry";

loadEnvConfig(process.cwd());

function monthlyObsCutoffIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
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

function obsCutoffIso(granularity: string, now = new Date(), fredId?: string): string {
  if (fredId === "FYFSGDA188S") {
    const d = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1));
    return d.toISOString().slice(0, 10);
  }
  if (granularity === "QUARTERLY") return quarterlyObsCutoffIso(now);
  if (granularity === "DAILY") return dailyObsCutoffIso(now);
  return monthlyObsCutoffIso(now);
}

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");

  console.log("[verify-overview] §3.1 角色台账");
  console.log(`  · 必备角色 ${OVERVIEW_SOURCE_REGISTRY.length} 条，TBD ${OVERVIEW_TBD_ROLES.length} 条`);
  for (const row of OVERVIEW_SOURCE_REGISTRY) {
    console.log(`  · ${row.roleId} [${row.status}] ${row.displayName} → ${row.virtualKey}`);
  }

  if (OVERVIEW_TBD_ROLES.length > 0) {
    console.warn(`  ⚠ TBD 角色（不进默认模板）：${OVERVIEW_TBD_ROLES.map((r) => r.roleId).join(", ")}`);
  } else {
    console.log("  ✓ 无 TBD 必备角色");
  }

  if (!useDb) {
    console.log("[verify-overview] 通过（加 --db 检查 FRED/ISM 观测）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-overview] FRED 订阅与观测");
    let fredOk = 0;
    for (const row of OVERVIEW_FRED_SERIES) {
      const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
      if (!inst) {
        console.error(`  ✗ 缺 Instrument ${row.code}（npm run data:seed-overview）`);
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
      const cutoff = obsCutoffIso(row.granularity, new Date(), row.fredId);
      if (!obs) {
        console.error(`  ✗ ${row.fredId} 无观测（npm run data:worker）`);
        errors++;
        continue;
      }
      const latest = obs.obsDate.toISOString().slice(0, 10);
      if (latest < cutoff) {
        console.error(`  ✗ ${row.fredId} 最新 ${latest} 早于阈值 ${cutoff}`);
        errors++;
        continue;
      }
      fredOk++;
    }
    console.log(`  ✓ ${fredOk}/${OVERVIEW_FRED_SERIES.length} 条 FRED 近期观测 OK`);

    console.log("[verify-overview] ISM PMI（MDS + TE，可选 L2S）");
    let ismOk = 0;
    for (const code of OVERVIEW_MDS_ROLE_CODES) {
      const inst = await prisma.instrument.findUnique({
        where: { code },
        include: { dataSubscription: true },
      });
      if (!inst) {
        console.warn(`  ⚠ 缺 ISM 仪器 ${code}（可选；npm run data:seed-ism-te / data:seed-ism-svc-te）`);
        continue;
      }
      const obs = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      if (!obs) {
        console.warn(`  ⚠ ${code} 无观测（可选）`);
        continue;
      }
      const md =
        inst.metadata && typeof inst.metadata === "object"
          ? (inst.metadata as Record<string, unknown>)
          : {};
      const scrape = md.scrape;
      const provider =
        scrape && typeof scrape === "object"
          ? (scrape as Record<string, unknown>).provider
          : null;
      const latest = obs.obsDate.toISOString().slice(0, 10);
      console.log(
        `  ✓ ${code} latest=${latest}@${obs.value} sub=${inst.dataSubscription?.enabled ? "on" : "off"} provider=${provider ?? "—"}`,
      );
      ismOk++;
    }
    console.log(`  ✓ ${ismOk}/${OVERVIEW_MDS_ROLE_CODES.length} 条 ISM MDS OK`);
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) process.exit(1);
  console.log("[verify-overview] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

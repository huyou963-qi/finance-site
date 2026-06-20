/**
 * Phase 5 自检
 *
 * npm run data:verify-phase5
 * npm run data:verify-phase5 -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { parseEStatObservations } from "../../src/lib/data/scheduler/adapters/eStatAdapter";
import { fetchFredCompositeIncremental } from "../../src/lib/data/scheduler/fredComposite";
import { filterAlertsForNotify } from "../../src/lib/data/scheduler/lagAlertDedup";
import type { LagAlertRow } from "../../src/lib/data/scheduler/lagAlerts";
import { buildSlackLagPayload } from "../../src/lib/data/scheduler/slackNotify";
import {
  mergedUsovFredMap,
  USOV_FRED_PHASE5_EXTRA,
} from "../../src/lib/data/scheduler/usovFredMap";
import { USOV_COMPOSITE_FRED, usovCompositeSpec } from "../../src/lib/data/scheduler/usovCompositeFred";

loadEnvConfig(process.cwd());

async function main() {
  let errors = 0;
  console.log("[verify-phase5] usov 映射");
  if (USOV_FRED_PHASE5_EXTRA.usov_c13_gdp_qoq_saar === "A191RL1Q225SBEA") {
    console.log("  ✓ Phase5 直拉 GDP SAAR");
  } else {
    errors++;
  }
  if (usovCompositeSpec("usov_c12_2y_effr")?.kind === "spread") {
    console.log("  ✓ 复合 spread 识别");
  } else {
    errors++;
  }
  const autoCount =
    Object.keys(mergedUsovFredMap()).length + Object.keys(USOV_COMPOSITE_FRED).length;
  console.log(`  usov 自动覆盖 ${autoCount} 条`);

  console.log("[verify-phase5] e-Stat 解析");
  const sample = {
    GET_STATS_DATA: {
      STATISTICAL_DATA: {
        DATA_INF: {
          VALUE: [
            { "@time": "202401", $: "102.5" },
            { "@time": "202402", $: "103.1" },
          ],
        },
      },
    },
  };
  const parsed = parseEStatObservations(sample);
  if (parsed.length === 2) {
    console.log("  ✓ parseEStatObservations");
  } else {
    errors++;
  }

  console.log("[verify-phase5] 告警去重 + Slack");
  const row: LagAlertRow = {
    instrumentCode: "sched_fred_CPIAUCSL",
    instrumentName: "CPI",
    sourceId: "fred",
    sourceLagDays: 20,
    lastObsDate: "2025-01-01",
    lastSuccessAt: null,
    lastError: null,
    reason: "源端滞后 20 天",
  };
  const { toNotify, suppressed } = await filterAlertsForNotify([row], { force: true });
  if (toNotify.length === 1) {
    console.log("  ✓ filterAlertsForNotify(force)");
  } else {
    errors++;
  }
  const slack = buildSlackLagPayload([row], 14);
  if (slack.blocks.length >= 2) {
    console.log("  ✓ buildSlackLagPayload");
  } else {
    errors++;
  }

  if (process.env.FRED_API_KEY?.trim()) {
    console.log("[verify-phase5] FRED 复合（需网络）");
    try {
      const r = await fetchFredCompositeIncremental(
        { kind: "spread", a: "GS2", b: "EFFR" },
        process.env.FRED_API_KEY.trim(),
        "2024-01-01",
      );
      if (r.points.length > 0) console.log(`  ✓ fetchFredComposite ${r.points.length} 点`);
      else {
        console.error("  ✗ 复合拉取 0 点");
        errors++;
      }
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  } else {
    console.log("[verify-phase5] 跳过 FRED 复合 live（无 FRED_API_KEY）");
  }

  if (process.argv.includes("--db")) {
    const prisma = new PrismaClient();
    try {
      const usovFred = await prisma.dataSubscription.count({
        where: { sourceId: "fred", instrument: { code: { startsWith: "usov_" } } },
      });
      const estat = await prisma.dataSubscription.count({ where: { sourceId: "estat-jp" } });
      console.log(`[verify-phase5] DB usov/fred ${usovFred} · estat-jp ${estat}`);
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      errors++;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (errors > 0) {
    console.error("[verify-phase5] 失败");
    process.exit(1);
  }
  console.log("[verify-phase5] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

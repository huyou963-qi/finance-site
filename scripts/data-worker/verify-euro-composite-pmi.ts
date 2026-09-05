/**
 * 欧元区综合 PMI（TE 抓取）——自检
 *
 * npm run data:verify-euro-composite-pmi
 * npm run data:verify-euro-composite-pmi -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  EURO_COMPOSITE_PMI_INSTRUMENT_CODE,
  EURO_COMPOSITE_PMI_SCRAPE_PROVIDER,
} from "../../src/lib/data/scheduler/tradingEconomicsIndicator/euroCompositePmiCatalog";

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  console.log(`[verify-euro-composite-pmi] 目标仪器 ${EURO_COMPOSITE_PMI_INSTRUMENT_CODE}`);

  if (!useDb) {
    console.log("[verify-euro-composite-pmi] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const code = EURO_COMPOSITE_PMI_INSTRUMENT_CODE;
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-euro-composite-pmi-te）`);
      errors++;
    } else {
      const acq = readFetchAcquisition(inst.metadata);
      if (acq?.status !== "known") {
        console.error(`  ✗ fetchAcquisition.status=${acq?.status ?? "无"}（应 known）`);
        errors++;
      } else {
        console.log(`  ✓ 获取方式 known（${acq.methodLabel}）`);
      }

      const md = (inst.metadata ?? {}) as Record<string, unknown>;
      const scrape = md.scrape as Record<string, unknown> | undefined;
      if (scrape?.provider !== EURO_COMPOSITE_PMI_SCRAPE_PROVIDER) {
        console.error(
          `  ✗ scrape.provider=${scrape?.provider ?? "无"}（应 ${EURO_COMPOSITE_PMI_SCRAPE_PROVIDER}）`,
        );
        errors++;
      } else {
        console.log(`  ✓ scrape.provider=${EURO_COMPOSITE_PMI_SCRAPE_PROVIDER} · url=${scrape.url}`);
      }
      if (md.bootstrapOnly === true) {
        console.error("  ✗ bootstrapOnly=true（应 false，否则不参与 worker）");
        errors++;
      }
      if (md.catalogCategory !== "对外与汇率") {
        console.error(`  ✗ catalogCategory=${md.catalogCategory ?? "无"}（应 对外与汇率）`);
        errors++;
      } else {
        console.log("  ✓ catalogCategory=对外与汇率");
      }

      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub?.enabled) {
        console.error("  ✗ 订阅未启用");
        errors++;
      } else {
        console.log(
          `  ✓ 订阅启用，releaseRule.type=${(sub.releaseRule as { type?: string })?.type} · nextRunAt=${sub.nextRunAt?.toISOString().slice(0, 10)}`,
        );
      }

      const count = await prisma.macroObservation.count({ where: { instrumentId: inst.id } });
      const last = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      if (count < 1) {
        console.error(`  ✗ 观测 0 条（先 data:sync-euro-composite-pmi-te）`);
        errors++;
      } else {
        console.log(
          `  ✓ 观测 ${count} 条 · 最新 ${last?.obsDate.toISOString().slice(0, 10)}(${last?.value})`,
        );
      }

      if (last && (last.value < 20 || last.value > 80)) {
        console.error(`  ✗ 最新值 ${last.value} 超出合理 PMI 区间 [20,80]`);
        errors++;
      }
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-euro-composite-pmi] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-euro-composite-pmi] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

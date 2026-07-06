/**
 * NY Fed 衰退概率抓取——自检
 *
 * npm run data:verify-nyfed-recession
 * npm run data:verify-nyfed-recession -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { NYFED_RECESSION_INSTRUMENT } from "../../src/lib/data/scheduler/nyFedRecession/catalog";

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const code = NYFED_RECESSION_INSTRUMENT.code;
  console.log(`[verify-nyfed-recession] 目标仪器 ${code}`);

  if (!useDb) {
    console.log("[verify-nyfed-recession] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-nyfed-recession）`);
      process.exit(1);
    }

    // 获取方式必须 known 且非 bootstrapOnly（否则不参与调度）
    const acq = readFetchAcquisition(inst.metadata);
    if (acq?.status !== "known") {
      console.error(`  ✗ fetchAcquisition.status=${acq?.status ?? "无"}（应 known）`);
      errors++;
    } else {
      console.log(`  ✓ 获取方式 known（${acq.methodLabel}）`);
    }
    const md = (inst.metadata ?? {}) as Record<string, unknown>;
    const scrape = md.scrape as Record<string, unknown> | undefined;
    if (scrape?.provider !== "nyfed_recession") {
      console.error(`  ✗ scrape.provider=${scrape?.provider ?? "无"}（应 nyfed_recession）`);
      errors++;
    } else {
      console.log(`  ✓ scrape.provider=nyfed_recession · url=${scrape.url}`);
    }
    if (md.bootstrapOnly === true) {
      console.error("  ✗ bootstrapOnly=true（应 false，否则不参与 worker）");
      errors++;
    }

    const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
    if (!sub?.enabled) {
      console.error("  ✗ 订阅未启用");
      errors++;
    } else if ((sub.releaseRule as { type?: string })?.type !== "probe_interval") {
      console.error(`  ✗ releaseRule 应 probe_interval，实际 ${(sub.releaseRule as { type?: string })?.type}`);
      errors++;
    } else {
      console.log(`  ✓ 订阅启用，probe_interval，nextRunAt=${sub.nextRunAt?.toISOString().slice(0, 10)}`);
    }

    const count = await prisma.macroObservation.count({ where: { instrumentId: inst.id } });
    const first = await prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
    const last = await prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "desc" } });
    if (count < 700) {
      console.error(`  ✗ 观测仅 ${count} 条（预期 ≥700，全历史约 809）`);
      errors++;
    } else {
      console.log(
        `  ✓ 观测 ${count} 条 · ${first?.obsDate.toISOString().slice(0, 10)}(${first?.value}%) → ${last?.obsDate.toISOString().slice(0, 10)}(${last?.value}%)`,
      );
    }
    // 值域检查：概率百分比应在 [0,100]
    const bad = await prisma.macroObservation.count({
      where: { instrumentId: inst.id, OR: [{ value: { lt: 0 } }, { value: { gt: 100 } }] },
    });
    if (bad > 0) {
      console.error(`  ✗ ${bad} 条观测值超出 [0,100]（单位应为百分比）`);
      errors++;
    } else {
      console.log("  ✓ 全部观测值在 [0,100]%");
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-nyfed-recession] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-nyfed-recession] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

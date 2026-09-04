/**
 * Shiller CAPE——自检
 *
 * npm run data:verify-shiller-cape
 * npm run data:verify-shiller-cape -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { SHILLER_CAPE_INSTRUMENT } from "../../src/lib/data/scheduler/shillerCape/catalog";

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const code = SHILLER_CAPE_INSTRUMENT.code;
  console.log(`[verify-shiller-cape] 目标仪器 ${code}`);

  if (!useDb) {
    console.log("[verify-shiller-cape] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-shiller-cape）`);
      process.exit(1);
    }

    const acq = readFetchAcquisition(inst.metadata);
    if (acq?.status !== "known") {
      console.error(`  ✗ fetchAcquisition.status=${acq?.status ?? "无"}（应 known）`);
      errors++;
    } else {
      console.log(`  ✓ 获取方式 known（${acq.methodLabel}）`);
    }
    const md = (inst.metadata ?? {}) as Record<string, unknown>;
    const scrape = md.scrape as Record<string, unknown> | undefined;
    if (scrape?.provider !== "shiller_cape") {
      console.error(`  ✗ scrape.provider=${scrape?.provider ?? "无"}（应 shiller_cape）`);
      errors++;
    } else {
      console.log(`  ✓ scrape.provider=shiller_cape · url=${scrape.url}`);
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
    if (count < 1500) {
      console.error(`  ✗ 观测仅 ${count} 条（预期 ≥1500，全历史约 1867，1871-02 起）`);
      errors++;
    } else {
      console.log(
        `  ✓ 观测 ${count} 条 · ${first?.obsDate.toISOString().slice(0, 10)}(${first?.value}x) → ${last?.obsDate.toISOString().slice(0, 10)}(${last?.value}x)`,
      );
    }
    // 值域检查：CAPE 合理区间 [1,200]
    const bad = await prisma.macroObservation.count({
      where: { instrumentId: inst.id, OR: [{ value: { lt: 1 } }, { value: { gt: 200 } }] },
    });
    if (bad > 0) {
      console.error(`  ✗ ${bad} 条观测值超出 [1,200]`);
      errors++;
    } else {
      console.log("  ✓ 全部观测值在 [1,200]");
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-shiller-cape] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-shiller-cape] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

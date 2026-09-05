/**
 * TSA 安检口旅客通过人数——自检
 *
 * npm run data:verify-tsa-passenger-volumes
 * npm run data:verify-tsa-passenger-volumes -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { TSA_PASSENGER_VOLUMES_INSTRUMENT } from "../../src/lib/data/scheduler/tsaPassengerVolumes/catalog";

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const code = TSA_PASSENGER_VOLUMES_INSTRUMENT.code;
  console.log(`[verify-tsa-passenger-volumes] 目标仪器 ${code}`);

  if (!useDb) {
    console.log("[verify-tsa-passenger-volumes] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-tsa-passenger-volumes）`);
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
    if (scrape?.provider !== "tsa_passenger_volumes") {
      console.error(`  ✗ scrape.provider=${scrape?.provider ?? "无"}（应 tsa_passenger_volumes）`);
      errors++;
    } else {
      console.log(`  ✓ scrape.provider=tsa_passenger_volumes · url=${scrape.url}`);
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
    // 2019-01-01 起，日频（不含缺发布日），预期 ≥ 2400 条（约 7 年 × 365，留缓冲）
    if (count < 2400) {
      console.error(`  ✗ 观测仅 ${count} 条（预期 ≥2400，2019 起全历史约 2800+）`);
      errors++;
    } else {
      console.log(
        `  ✓ 观测 ${count} 条 · ${first?.obsDate.toISOString().slice(0, 10)}(${first?.value}) → ${last?.obsDate.toISOString().slice(0, 10)}(${last?.value})`,
      );
    }
    const bad = await prisma.macroObservation.count({
      where: { instrumentId: inst.id, OR: [{ value: { lt: 10_000 } }, { value: { gt: 10_000_000 } }] },
    });
    if (bad > 0) {
      console.error(`  ✗ ${bad} 条观测值超出合理值域 [10000,10000000]`);
      errors++;
    } else {
      console.log("  ✓ 全部观测值在合理值域内");
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-tsa-passenger-volumes] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-tsa-passenger-volumes] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * AAR 美国铁路周度装车量/多式联运量——自检
 *
 * npm run data:verify-aar-rail-traffic
 * npm run data:verify-aar-rail-traffic -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { AAR_RAIL_TRAFFIC_SERIES } from "../../src/lib/data/scheduler/aarRailTraffic/catalog";

// 2019-01 起，周频，约 52/年，7 年约 364 周；门槛留 30% 余量应对回填未完全跑满的情况
const MIN_COUNT = 250;

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  console.log(
    `[verify-aar-rail-traffic] 目标仪器 ${AAR_RAIL_TRAFFIC_SERIES.map((s) => s.instrumentCode).join(", ")}`,
  );

  if (!useDb) {
    console.log("[verify-aar-rail-traffic] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const config of AAR_RAIL_TRAFFIC_SERIES) {
      const code = config.instrumentCode;
      console.log(`  -- ${code} --`);
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) {
        console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-aar-rail-traffic）`);
        errors++;
        continue;
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
      if (scrape?.provider !== config.provider) {
        console.error(`  ✗ scrape.provider=${scrape?.provider ?? "无"}（应 ${config.provider}）`);
        errors++;
      } else {
        console.log(`  ✓ scrape.provider=${config.provider} · url=${scrape.url}`);
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
        console.error(
          `  ✗ releaseRule 应 probe_interval，实际 ${(sub.releaseRule as { type?: string })?.type}`,
        );
        errors++;
      } else {
        console.log(`  ✓ 订阅启用，probe_interval，nextRunAt=${sub.nextRunAt?.toISOString().slice(0, 10)}`);
      }

      const count = await prisma.macroObservation.count({ where: { instrumentId: inst.id } });
      const first = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "asc" },
      });
      const last = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      if (count < MIN_COUNT) {
        console.error(`  ✗ 观测仅 ${count} 条（预期 ≥${MIN_COUNT}，2019 起全历史约 350+）`);
        errors++;
      } else {
        console.log(
          `  ✓ 观测 ${count} 条 · ${first?.obsDate.toISOString().slice(0, 10)}(${first?.value}) → ${last?.obsDate.toISOString().slice(0, 10)}(${last?.value})`,
        );
      }

      const [lo, hi] = config.valueRange;
      const bad = await prisma.macroObservation.count({
        where: { instrumentId: inst.id, OR: [{ value: { lt: lo } }, { value: { gt: hi } }] },
      });
      if (bad > 0) {
        console.error(`  ✗ ${bad} 条观测值超出 [${lo},${hi}]`);
        errors++;
      } else {
        console.log(`  ✓ 全部观测值在 [${lo},${hi}]`);
      }
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-aar-rail-traffic] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-aar-rail-traffic] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

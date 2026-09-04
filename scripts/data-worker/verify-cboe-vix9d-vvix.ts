/**
 * CBOE VIX9D / VVIX ——自检
 *
 * npm run data:verify-cboe-vix9d-vvix
 * npm run data:verify-cboe-vix9d-vvix -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { CBOE_INDEX_SERIES } from "../../src/lib/data/scheduler/cboeIndices/catalog";

// 交易日数量估算（约 252/年），门槛留 20% 余量
const MIN_COUNT: Record<string, number> = {
  cboe_vix9d: 3600, // 2011-01-04 起，约 15 年
  cboe_vvix: 4700, // 2006-03-06 起，约 20 年
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  console.log(`[verify-cboe-vix9d-vvix] 目标仪器 ${CBOE_INDEX_SERIES.map((s) => s.instrumentCode).join(", ")}`);

  if (!useDb) {
    console.log("[verify-cboe-vix9d-vvix] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const config of CBOE_INDEX_SERIES) {
      const code = config.instrumentCode;
      console.log(`  -- ${code} --`);
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) {
        console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-cboe-vix9d-vvix）`);
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
      const minCount = MIN_COUNT[code] ?? 100;
      if (count < minCount) {
        console.error(`  ✗ 观测仅 ${count} 条（预期 ≥${minCount}）`);
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
    console.error(`[verify-cboe-vix9d-vvix] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-cboe-vix9d-vvix] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

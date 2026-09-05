/**
 * FINRA 客户融资余额统计（Margin Statistics）——自检
 *
 * npm run data:verify-finra-margin-debt
 * npm run data:verify-finra-margin-debt -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { FINRA_MARGIN_STATISTICS_SERIES } from "../../src/lib/data/scheduler/finraMarginDebt/catalog";

/** free_credit_margin 2010-02 起才有分项数据，其余两条 1997-01 起，全历史约 355/198 条 */
const MIN_COUNT: Record<string, number> = {
  debit_balances: 300,
  free_credit_cash: 300,
  free_credit_margin: 150,
};

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  console.log(
    `[verify-finra-margin-debt] 目标仪器 ${FINRA_MARGIN_STATISTICS_SERIES.map((s) => s.instrumentCode).join(", ")}`,
  );

  if (!useDb) {
    console.log("[verify-finra-margin-debt] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const row of FINRA_MARGIN_STATISTICS_SERIES) {
      const code = row.instrumentCode;
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) {
        console.error(`  ✗ ${code}：缺 Instrument（先 data:seed-finra-margin-debt）`);
        errors++;
        continue;
      }

      const acq = readFetchAcquisition(inst.metadata);
      if (acq?.status !== "known") {
        console.error(`  ✗ ${code}：fetchAcquisition.status=${acq?.status ?? "无"}（应 known）`);
        errors++;
      } else {
        console.log(`  ✓ ${code}：获取方式 known（${acq.methodLabel}）`);
      }
      const md = (inst.metadata ?? {}) as Record<string, unknown>;
      const scrape = md.scrape as Record<string, unknown> | undefined;
      if (scrape?.provider !== row.provider) {
        console.error(`  ✗ ${code}：scrape.provider=${scrape?.provider ?? "无"}（应 ${row.provider}）`);
        errors++;
      }
      if (md.bootstrapOnly === true) {
        console.error(`  ✗ ${code}：bootstrapOnly=true（应 false，否则不参与 worker）`);
        errors++;
      }

      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub?.enabled) {
        console.error(`  ✗ ${code}：订阅未启用`);
        errors++;
      } else if ((sub.releaseRule as { type?: string })?.type !== "probe_interval") {
        console.error(
          `  ✗ ${code}：releaseRule 应 probe_interval，实际 ${(sub.releaseRule as { type?: string })?.type}`,
        );
        errors++;
      } else {
        console.log(`  ✓ ${code}：订阅启用，probe_interval，nextRunAt=${sub.nextRunAt?.toISOString().slice(0, 10)}`);
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
      const minCount = MIN_COUNT[row.seriesKey] ?? 100;
      if (count < minCount) {
        console.error(`  ✗ ${code}：观测仅 ${count} 条（预期 ≥${minCount}）`);
        errors++;
      } else {
        console.log(
          `  ✓ ${code}：观测 ${count} 条 · ${first?.obsDate.toISOString().slice(0, 10)}(${first?.value}) → ${last?.obsDate.toISOString().slice(0, 10)}(${last?.value})`,
        );
      }

      const [lo, hi] = row.valueRange;
      const bad = await prisma.macroObservation.count({
        where: { instrumentId: inst.id, OR: [{ value: { lt: lo } }, { value: { gt: hi } }] },
      });
      if (bad > 0) {
        console.error(`  ✗ ${code}：${bad} 条观测值超出 [${lo},${hi}]`);
        errors++;
      } else {
        console.log(`  ✓ ${code}：全部观测值在 [${lo},${hi}]`);
      }
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-finra-margin-debt] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-finra-margin-debt] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

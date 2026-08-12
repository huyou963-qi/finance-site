/**
 * 美国国际收支数据自检
 *
 * npm run data:verify-us-balance-of-payments
 * npm run data:verify-us-balance-of-payments -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { US_BALANCE_OF_PAYMENTS_FRED_SERIES } from "../../src/lib/data/scheduler/usBalanceOfPaymentsFredSeedCatalog";

loadEnvConfig(process.cwd());

async function main() {
  const useDb = process.argv.includes("--db");
  const ids = US_BALANCE_OF_PAYMENTS_FRED_SERIES.map((row) => row.fredId);
  if (new Set(ids).size !== ids.length || ids.length !== 12) {
    throw new Error(`目录数量或 FRED id 唯一性异常：${ids.length}`);
  }
  console.log(`[verify-us-balance-of-payments] catalog 通过：${ids.length} 条 BEA/FRED 序列`);
  if (!useDb) {
    console.log("[verify-us-balance-of-payments] 加 --db 检查订阅、发布包和历史观测");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const row of US_BALANCE_OF_PAYMENTS_FRED_SERIES) {
      const instrument = await prisma.instrument.findUnique({
        where: { code: row.code },
        include: { dataSubscription: { include: { source: true } } },
      });
      if (!instrument) {
        console.error(`  ✗ 缺 Instrument ${row.code}`);
        errors++;
        continue;
      }

      const subscription = instrument.dataSubscription;
      const releaseRule = subscription?.releaseRule as
        | { type?: string; intervalHours?: number }
        | undefined;
      const acquisition = readFetchAcquisition(instrument.metadata);
      const [first, latest, count] = await Promise.all([
        prisma.macroObservation.findFirst({
          where: { instrumentId: instrument.id },
          orderBy: { obsDate: "asc" },
          select: { obsDate: true },
        }),
        prisma.macroObservation.findFirst({
          where: { instrumentId: instrument.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        }),
        prisma.macroObservation.count({ where: { instrumentId: instrument.id } }),
      ]);

      const firstIso = first?.obsDate.toISOString().slice(0, 10) ?? "-";
      const latestIso = latest?.obsDate.toISOString().slice(0, 10) ?? "-";
      const expectedMinCount = row.historyStartYear === 1999 ? 100 : 70;
      const missing: string[] = [];
      if (instrument.fredSeriesId !== row.fredId) missing.push("fredSeriesId");
      if (instrument.freqLabel !== row.freqLabel) missing.push("freqLabel");
      if (instrument.unit !== row.unit) missing.push("unit");
      if (!subscription?.enabled) missing.push("subscription.enabled");
      if (subscription?.source.adapterKind !== "FRED_API") missing.push("source.adapterKind");
      if (subscription?.sourceSeriesKey !== row.fredId) missing.push("sourceSeriesKey");
      if (subscription?.granularity !== "QUARTERLY") missing.push("granularity");
      if (releaseRule?.type !== "probe_interval") missing.push("releaseRule");
      if (releaseRule?.intervalHours !== 168) missing.push("probeInterval");
      if (subscription?.releasePackageId !== row.releasePackageId) missing.push("releasePackageId");
      if (!subscription?.nextRunAt) missing.push("nextRunAt");
      if (acquisition?.status !== "known") missing.push("fetchAcquisition");
      if (count < expectedMinCount) missing.push(`observations<${expectedMinCount}`);
      if (!first || first.obsDate.getUTCFullYear() > row.historyStartYear) missing.push("historyStart");
      if (!latest || latest.obsDate < new Date("2025-07-01T00:00:00.000Z")) missing.push("latestObs");

      if (missing.length > 0) {
        console.error(
          `  ✗ ${row.code}: ${missing.join(", ")} · ${firstIso}→${latestIso} · n=${count}`,
        );
        errors++;
      } else {
        console.log(
          `  ✓ ${row.code} · ${firstIso}→${latestIso} · n=${count} · ${row.releasePackageId} · next=${subscription?.nextRunAt?.toISOString()}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) throw new Error(`[verify-us-balance-of-payments] 失败：${errors} 条异常`);
  console.log("[verify-us-balance-of-payments] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

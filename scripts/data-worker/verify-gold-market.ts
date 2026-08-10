/** Verify the three independently confirmed legacy gold-market source contracts. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const EXPECTED = [
  { code: "goldov_c06_mm_net", sourceId: "cftc-cot", seriesKey: "kh3c-gbw2:gold:net", minPoints: 800 },
  { code: "goldov_c15_ppi_yoy", sourceId: "bls-ppi", seriesKey: "WPU00000000:yoy", minPoints: 1_000 },
  { code: "goldov_c28_real_rate", sourceId: "worldbank", seriesKey: "US:FR.INR.RINR", minPoints: 60 },
] as const;

async function main() {
  let errors = 0;
  for (const expected of EXPECTED) {
    const instrument = await prisma.instrument.findUnique({
      where: { code: expected.code },
      select: {
        metadata: true,
        dataSubscription: {
          select: { sourceId: true, sourceSeriesKey: true, enabled: true },
        },
        _count: { select: { macroPoints: true } },
      },
    });
    const acquisition = readFetchAcquisition(instrument?.metadata);
    const ok =
      instrument &&
      acquisition?.status === "known" &&
      instrument.dataSubscription?.enabled === true &&
      instrument.dataSubscription.sourceId === expected.sourceId &&
      instrument.dataSubscription.sourceSeriesKey === expected.seriesKey &&
      instrument._count.macroPoints >= expected.minPoints;
    if (!ok) {
      errors++;
      console.error(`异常 ${expected.code}`);
      continue;
    }
    console.log(`✓ ${expected.code} observations=${instrument._count.macroPoints}`);
  }
  if (errors) throw new Error(`[verify-gold-market] 失败：${errors}`);
  console.log("[verify-gold-market] 已确认原始口径=3");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

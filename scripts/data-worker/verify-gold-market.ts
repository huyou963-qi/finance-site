/** Verify independently confirmed legacy gold-market source contracts. */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const EXPECTED = [
  {
    code: "goldov_c06_mm_net",
    sourceId: "cftc-cot",
    seriesKey: "kh3c-gbw2:gold:net",
    minPoints: 800,
    packageId: "intl.cftc.disaggregated_combined",
    maxLagDays: 14,
    freqLabel: "周",
    unit: "张",
  },
  { code: "goldov_c15_ppi_yoy", sourceId: "bls-ppi", seriesKey: "WPU00000000:yoy", minPoints: 1_000 },
  { code: "goldov_c28_real_rate", sourceId: "worldbank", seriesKey: "US:FR.INR.RINR", minPoints: 60 },
  {
    code: "goldov_c24_global_reserve_tons",
    sourceId: "imf-il",
    seriesKey: "G001.RGV_REVS.FTO.M:metric_tons",
    minPoints: 800,
    packageId: "intl.imf.international_liquidity_gold",
    maxLagDays: 100,
    freqLabel: "月",
    unit: "吨",
  },
  {
    code: "goldov_c11_global_reserve",
    sourceId: "imf-il",
    seriesKey: "G001.RGV_REVS.FTO.M:legacy_avoirdupois_million_ounces",
    minPoints: 800,
    packageId: "intl.imf.international_liquidity_gold",
    maxLagDays: 100,
    freqLabel: "月",
    unit: "百万盎司",
  },
  {
    code: "goldov_c17_spdr_etf",
    sourceId: "spdr-gold-shares",
    seriesKey: "GLD:tonnes-of-gold",
    minPoints: 5_400,
    maxLagDays: 5,
    freqLabel: "日",
    unit: "吨",
  },
  {
    code: "goldov_c18_ishares_etf",
    sourceId: "ishares-gold-trust",
    seriesKey: "IAU:tonnes-in-trust",
    minPoints: 5_300,
    maxLagDays: 5,
    freqLabel: "日",
    unit: "吨",
  },
  {
    code: "goldov_c19_gbs_etf",
    sourceId: "wisdomtree-dataspan",
    seriesKey: "GB00B00FHZ82:allocated-fine-ounces",
    minPoints: 4_705,
    maxLagDays: 7,
    freqLabel: "日",
    unit: "吨",
  },
  {
    code: "goldov_c21_sgbs_etf",
    sourceId: "wisdomtree-dataspan",
    seriesKey: "JE00B588CD74:allocated-fine-ounces",
    minPoints: 4_190,
    maxLagDays: 7,
    freqLabel: "日",
    unit: "吨",
  },
  {
    code: "goldov_c20_phau_etf",
    sourceId: "wgc-goldhub",
    seriesKey: "JE00B1VS3770:WGC-monthly-holdings-tonnes",
    minPoints: 4_886,
    maxLagDays: 40,
    freqLabel: "月",
    unit: "吨",
  },
  {
    code: "goldov_c22_gold_etf",
    sourceId: "globalx-australia",
    seriesKey: "AU00000GOLD7:UOI*metal-entitlement",
    minPoints: 4_800,
    maxLagDays: 5,
    freqLabel: "日",
    unit: "吨",
  },
] as const;

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

async function main() {
  let errors = 0;
  for (const expected of EXPECTED) {
    const instrument = await prisma.instrument.findUnique({
      where: { code: expected.code },
      select: {
        freqLabel: true,
        unit: true,
        metadata: true,
        dataSubscription: {
          select: {
            sourceId: true,
            sourceSeriesKey: true,
            enabled: true,
            releasePackageId: true,
            nextRunAt: true,
          },
        },
        _count: { select: { macroPoints: true } },
        macroPoints: {
          orderBy: { obsDate: "asc" },
          select: { obsDate: true },
        },
      },
    });
    const acquisition = readFetchAcquisition(instrument?.metadata);
    const firstObs = instrument?.macroPoints[0]?.obsDate;
    const lastObs = instrument?.macroPoints.at(-1)?.obsDate;
    const lagDays = lastObs ? diffDays(new Date(), lastObs) : null;
    const ok =
      instrument &&
      acquisition?.status === "known" &&
      instrument.dataSubscription?.enabled === true &&
      instrument.dataSubscription.sourceId === expected.sourceId &&
      instrument.dataSubscription.sourceSeriesKey === expected.seriesKey &&
      instrument._count.macroPoints >= expected.minPoints &&
      (!("packageId" in expected) ||
        instrument.dataSubscription.releasePackageId === expected.packageId) &&
      (!("maxLagDays" in expected) || (lagDays != null && lagDays <= expected.maxLagDays)) &&
      (!("freqLabel" in expected) || instrument.freqLabel === expected.freqLabel) &&
      (!("unit" in expected) || instrument.unit === expected.unit);
    if (!ok) {
      errors++;
      console.error(`异常 ${expected.code}`);
      continue;
    }
    console.log(
      `✓ ${expected.code} observations=${instrument._count.macroPoints}` +
        ` first=${firstObs?.toISOString().slice(0, 10) ?? "—"}` +
        ` last=${lastObs?.toISOString().slice(0, 10) ?? "—"}` +
        ` next=${instrument.dataSubscription.nextRunAt?.toISOString() ?? "—"}`,
    );
  }
  const [tons, ounces] = await Promise.all([
    prisma.instrument.findUnique({
      where: { code: "goldov_c24_global_reserve_tons" },
      select: { macroPoints: { select: { obsDate: true, value: true } } },
    }),
    prisma.instrument.findUnique({
      where: { code: "goldov_c11_global_reserve" },
      select: { macroPoints: { select: { obsDate: true, value: true } } },
    }),
  ]);
  const tonsByDate = new Map(
    (tons?.macroPoints ?? []).map((point) => [point.obsDate.getTime(), point.value]),
  );
  let formulaErrors = 0;
  for (const point of ounces?.macroPoints ?? []) {
    const upstream = tonsByDate.get(point.obsDate.getTime());
    if (upstream == null) continue;
    const expected = (upstream * 35.2739619495804) / 1_000;
    if (Math.abs(point.value - expected) > 1e-9) formulaErrors++;
  }
  if (formulaErrors) {
    errors += formulaErrors;
    console.error(`异常 c11/c24 派生公式 dates=${formulaErrors}`);
  } else {
    console.log("✓ c11 = c24 × 35.2739619495804 / 1,000（全部重叠日期）");
  }
  if (errors) throw new Error(`[verify-gold-market] 失败：${errors}`);
  console.log("[verify-gold-market] 已确认自动来源=11");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

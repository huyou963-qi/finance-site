/**
 * Read-only evidence for the legacy gold workbook relationships discovered on
 * 2026-08-22. This does not fetch issuer data or write to PostgreSQL.
 *
 * Run: npx tsx scripts/research/verify-gold-etf-reserve-legacy.ts
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const AVOIRDUPOIS_MILLION_OZ_PER_TONNE = 35.2739619495804 / 1_000;
const ETF_COMPONENTS = [
  "goldov_c17_spdr_etf",
  "goldov_c18_ishares_etf",
  "goldov_c19_gbs_etf",
  "goldov_c20_phau_etf",
  "goldov_c21_sgbs_etf",
  "goldov_c22_gold_etf",
] as const;

type PointMap = Map<string, number>;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function loadPoints(code: string): Promise<PointMap> {
  const instrument = await prisma.instrument.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!instrument) throw new Error(`missing instrument: ${code}`);
  const rows = await prisma.macroObservation.findMany({
    where: { instrumentId: instrument.id },
    orderBy: { obsDate: "asc" },
    select: { obsDate: true, value: true },
  });
  return new Map(rows.map((row) => [dateKey(row.obsDate), row.value]));
}

function compareTransform(
  target: PointMap,
  source: PointMap,
  transform: (value: number) => number,
) {
  let overlap = 0;
  let maxAbsDiff = 0;
  for (const [date, targetValue] of target) {
    const sourceValue = source.get(date);
    if (sourceValue === undefined) continue;
    overlap += 1;
    maxAbsDiff = Math.max(maxAbsDiff, Math.abs(targetValue - transform(sourceValue)));
  }
  return { overlap, maxAbsDiff };
}

async function main() {
  const codes = [
    "goldov_c09_etf_holding",
    "goldov_c11_global_reserve",
    ...ETF_COMPONENTS,
    "goldov_c24_global_reserve_tons",
    "goldov_c25_etf_holding_tons",
  ];
  const entries = await Promise.all(codes.map(async (code) => [code, await loadPoints(code)] as const));
  const points = new Map(entries);

  const c25 = points.get("goldov_c25_etf_holding_tons")!;
  let sumOverlap = 0;
  let sumMaxAbsDiff = 0;
  for (const [date, targetValue] of c25) {
    const components = ETF_COMPONENTS.map((code) => points.get(code)!.get(date));
    if (components.some((value) => value === undefined)) continue;
    const sum = (components as number[]).reduce((total, value) => total + value, 0);
    sumOverlap += 1;
    sumMaxAbsDiff = Math.max(sumMaxAbsDiff, Math.abs(targetValue - sum));
  }

  const c09 = compareTransform(
    points.get("goldov_c09_etf_holding")!,
    c25,
    (value) => value * AVOIRDUPOIS_MILLION_OZ_PER_TONNE,
  );
  const c11 = compareTransform(
    points.get("goldov_c11_global_reserve")!,
    points.get("goldov_c24_global_reserve_tons")!,
    (value) => value * AVOIRDUPOIS_MILLION_OZ_PER_TONNE,
  );

  console.log(JSON.stringify({
    c25EqualsSixFundSum: { overlap: sumOverlap, maxAbsDiff: sumMaxAbsDiff },
    c09EqualsC25Avoirdupois: c09,
    c11EqualsC24Avoirdupois: c11,
  }, null, 2));

  if (sumOverlap !== 4_039 || sumMaxAbsDiff > 0.021) {
    throw new Error("c25 six-fund relationship changed");
  }
  if (c09.overlap !== 4_039 || c09.maxAbsDiff > 0.006) {
    throw new Error("c09 avoirdupois relationship changed");
  }
  if (c11.overlap !== 100 || c11.maxAbsDiff > 0.007) {
    throw new Error("c11 avoirdupois relationship changed");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

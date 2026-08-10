import { PrismaClient } from "@prisma/client";
import {
  PBC_MONETARY_COMPONENTS,
  pbcMonetaryCode,
} from "../../src/lib/data/scheduler/pbcMonetary/catalog";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

type CoverageRule = {
  minObservations: number;
  maxLagMonths: number;
};

/**
 * The financial-conditions templates depend on these series. The generic PBC
 * verifier used to accept a series with a single historical observation, which
 * allowed the repo-rate parser regression to pass unnoticed. Thresholds remain
 * below the official archive's available count, but assert usable history and
 * a recent endpoint.
 */
const FINANCIAL_LIQUIDITY_RULES: Readonly<Record<string, CoverageRule>> = {
  lpr_1y: { minObservations: 75, maxLagMonths: 3 },
  lpr_5y: { minObservations: 75, maxLagMonths: 3 },
  interbank_lending_rate: { minObservations: 100, maxLagMonths: 3 },
  repo_rate: { minObservations: 100, maxLagMonths: 3 },
  m1_yoy: { minObservations: 130, maxLagMonths: 3 },
  m2_yoy: { minObservations: 130, maxLagMonths: 3 },
  social_financing_stock_yoy: { minObservations: 110, maxLagMonths: 3 },
  rmb_loan_yoy: { minObservations: 130, maxLagMonths: 3 },
  rmb_deposit_yoy: { minObservations: 130, maxLagMonths: 3 },
  social_financing_cumulative: { minObservations: 95, maxLagMonths: 3 },
  social_financing_rmb_loan_cumulative: { minObservations: 95, maxLagMonths: 3 },
  government_bond_financing_cumulative: { minObservations: 45, maxLagMonths: 3 },
  corporate_bond_financing_cumulative: { minObservations: 90, maxLagMonths: 3 },
  domestic_equity_financing_cumulative: { minObservations: 95, maxLagMonths: 3 },
};

function monthLag(last: Date, now = new Date()): number {
  return (now.getUTCFullYear() - last.getUTCFullYear()) * 12
    + now.getUTCMonth()
    - last.getUTCMonth();
}

function day(value: Date | null): string {
  return value?.toISOString().slice(0, 10) ?? "—";
}

async function main() {
  if (!process.argv.includes("--db")) {
    console.log(
      `[verify-pbc-monetary] catalog 通过：${PBC_MONETARY_COMPONENTS.length} 条候选官方序列；金融条件重点序列=${Object.keys(FINANCIAL_LIQUIDITY_RULES).length}`,
    );
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const component of PBC_MONETARY_COMPONENTS) {
      const code = pbcMonetaryCode(component.key);
      const item = await prisma.instrument.findUnique({
        where: { code },
        include: { dataSubscription: true },
      });
      const aggregate = item
        ? await prisma.macroObservation.aggregate({
            where: { instrumentId: item.id },
            _count: { _all: true },
            _min: { obsDate: true },
            _max: { obsDate: true },
          })
        : null;
      const count = aggregate?._count._all ?? 0;
      const first = aggregate?._min.obsDate ?? null;
      const last = aggregate?._max.obsDate ?? null;
      const metadata = item?.metadata as Record<string, unknown> | undefined;
      const acquisition = readFetchAcquisition(metadata);
      const scrape = metadata?.scrape as Record<string, unknown> | undefined;
      const rule = FINANCIAL_LIQUIDITY_RULES[component.key];
      const coverageOk = !rule
        || (count >= rule.minObservations && last !== null && monthLag(last) <= rule.maxLagMonths);
      const baseOk = Boolean(
        item
        && count > 0
        && item.dataSubscription?.sourceId === "pbc-monetary"
        && item.dataSubscription.enabled
        && item.dataSubscription.nextRunAt !== null
        && item.dataSubscription.releasePackageId === "cn.pbc.monetary-credit"
        && acquisition?.status === "known"
        && scrape?.provider === "pbc_monetary",
      );
      const status = baseOk && coverageOk ? "✓" : "✗";
      console.log(
        `${status} ${code} observations=${count} first=${day(first)} last=${day(last)} next=${item?.dataSubscription?.nextRunAt?.toISOString() ?? "—"} package=${item?.dataSubscription?.releasePackageId ?? "—"}`,
      );
      if (!baseOk || !coverageOk) {
        if (rule && !coverageOk) {
          console.error(
            `  coverage 要求：observations>=${rule.minObservations} 且 lag<=${rule.maxLagMonths} months`,
          );
        }
        errors++;
      }
    }
    console.log(`[verify-pbc-monetary] 有效序列=${PBC_MONETARY_COMPONENTS.length - errors}`);
  } finally {
    await prisma.$disconnect();
  }
  if (errors) throw new Error(`[verify-pbc-monetary] 失败：${errors}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

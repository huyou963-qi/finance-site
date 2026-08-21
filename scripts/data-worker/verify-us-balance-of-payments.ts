/**
 * 美国国际收支数据自检
 *
 * npm run data:verify-us-balance-of-payments
 * npm run data:verify-us-balance-of-payments -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { resolveAcquisitionStatus } from "../../src/lib/data/scheduler/catalogAcquisition";
import {
  US_BALANCE_OF_PAYMENTS_FRED_SERIES,
  US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_IDS,
  US_BOP_REUSED_FRED_SERIES,
  US_BOP_SUPPLEMENTAL_FRED_SERIES,
} from "../../src/lib/data/scheduler/usBalanceOfPaymentsFredSeedCatalog";

loadEnvConfig(process.cwd());

const BOP_PACKAGE_ID = "us.bea.international_transactions";
const IIP_PACKAGE_ID = "us.bea.iip";
const HISTORICAL_ONLY_SERIES = new Set(["IEASAD"]);

async function main() {
  const useDb = process.argv.includes("--db");
  const seedIds = US_BALANCE_OF_PAYMENTS_FRED_SERIES.map((row) => row.fredId);
  const canonicalBopIds = [...US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_IDS];
  const catalogErrors: string[] = [];

  if (new Set(seedIds).size !== seedIds.length || seedIds.length !== 110) {
    catalogErrors.push(`seed 目录应为 110 条，实际 ${seedIds.length}`);
  }
  if (US_BOP_SUPPLEMENTAL_FRED_SERIES.length !== 98) {
    catalogErrors.push(`本轮新增应为 98 条，实际 ${US_BOP_SUPPLEMENTAL_FRED_SERIES.length}`);
  }
  if (new Set(canonicalBopIds).size !== 108) {
    catalogErrors.push(`现行 BOP 标准口径应为 108 条，实际 ${new Set(canonicalBopIds).size}`);
  }
  if (catalogErrors.length > 0) throw new Error(catalogErrors.join("；"));

  console.log(
    `[verify-us-balance-of-payments] catalog 通过：BOP 108 条（本轮新增 98、复用 1），IIP 3 条`,
  );
  if (!useDb) {
    console.log("[verify-us-balance-of-payments] 加 --db 检查订阅、发布包和历史观测");
    return;
  }

  const prisma = new PrismaClient();
  const errors: string[] = [];
  const summary = new Map<string, { ok: number; total: number; min: string; max: string }>();
  try {
    const expected = [
      ...US_BALANCE_OF_PAYMENTS_FRED_SERIES.map((row) => ({
        ...row,
        expectedMinCount: row.historyStartYear === 1999 ? 80 : 70,
      })),
      ...US_BOP_REUSED_FRED_SERIES.map((row) => ({
        ...row,
        accountGroup: "国际收支总表",
        freqLabel: "季",
        unit: "百万美元",
        releasePackageId: BOP_PACKAGE_ID,
        historyStartYear: 1999,
        expectedMinCount: 80,
      })),
    ];

    for (const row of expected) {
      const instrument = await prisma.instrument.findUnique({
        where: { code: row.code },
        include: { dataSubscription: { include: { source: true } } },
      });
      const group = row.accountGroup;
      const state = summary.get(group) ?? { ok: 0, total: 0, min: "9999-99-99", max: "-" };
      state.total++;
      summary.set(group, state);

      if (!instrument) {
        errors.push(`${row.code}: 缺 Instrument`);
        continue;
      }

      const subscription = instrument.dataSubscription;
      const releaseRule = subscription?.releaseRule as
        | { type?: string; intervalHours?: number; fallback?: { intervalHours?: number } }
        | undefined;
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
      const missing: string[] = [];
      const acquisitionStatus = resolveAcquisitionStatus({
        subscriptionEnabled: subscription?.enabled ?? null,
        adapterKind: subscription?.source.adapterKind ?? null,
        sourceSeriesKey: subscription?.sourceSeriesKey ?? null,
        metadata: instrument.metadata,
      });

      if (instrument.fredSeriesId !== row.fredId) missing.push("fredSeriesId");
      if (instrument.freqLabel !== row.freqLabel) missing.push("freqLabel");
      if (instrument.unit !== row.unit) missing.push("unit");
      if (!subscription?.enabled) missing.push("subscription.enabled");
      if (subscription?.source.adapterKind !== "FRED_API") missing.push("source.adapterKind");
      if (subscription?.sourceSeriesKey !== row.fredId) missing.push("sourceSeriesKey");
      if (subscription?.granularity !== "QUARTERLY") missing.push("granularity");
      if (subscription?.releasePackageId !== row.releasePackageId) missing.push("releasePackageId");
      if (!subscription?.nextRunAt) missing.push("nextRunAt");
      const historicalOnly = HISTORICAL_ONLY_SERIES.has(row.fredId);
      if (acquisitionStatus !== "ready" && !(historicalOnly && acquisitionStatus === "probe_failed")) {
        missing.push(`acquisition=${acquisitionStatus}`);
      }
      if (row.releasePackageId === BOP_PACKAGE_ID && releaseRule?.type !== "economic_calendar") {
        missing.push("releaseRule≠economic_calendar");
      }
      if (
        row.releasePackageId === IIP_PACKAGE_ID &&
        (releaseRule?.type !== "probe_interval" || releaseRule.intervalHours !== 168)
      ) {
        missing.push("IIP probeInterval≠168h");
      }
      if (count < row.expectedMinCount) missing.push(`observations<${row.expectedMinCount}`);
      if (!first || first.obsDate.getUTCFullYear() > row.historyStartYear) missing.push("historyStart");
      const latestCutoff = historicalOnly
        ? new Date("2019-10-01T00:00:00.000Z")
        : new Date("2025-07-01T00:00:00.000Z");
      if (!latest || latest.obsDate < latestCutoff) {
        missing.push("latestObs");
      }

      if (missing.length > 0) {
        errors.push(`${row.code}: ${missing.join(", ")} · ${firstIso}→${latestIso} · n=${count}`);
      } else {
        state.ok++;
        if (firstIso < state.min) state.min = firstIso;
        if (latestIso > state.max) state.max = latestIso;
      }
    }

    const [bopPackage, iipPackage, bopMembers, iipMembers] = await Promise.all([
      prisma.releasePackage.findUnique({ where: { id: BOP_PACKAGE_ID } }),
      prisma.releasePackage.findUnique({ where: { id: IIP_PACKAGE_ID } }),
      prisma.releasePackageMember.count({ where: { packageId: BOP_PACKAGE_ID } }),
      prisma.releasePackageMember.count({ where: { packageId: IIP_PACKAGE_ID } }),
    ]);
    const bopTemplate = bopPackage?.releaseTemplate as { type?: string } | null;
    const iipTemplate = iipPackage?.releaseTemplate as { type?: string; intervalHours?: number } | null;
    if (!bopPackage?.enabled || bopTemplate?.type !== "economic_calendar" || bopMembers !== 108) {
      errors.push(
        `${BOP_PACKAGE_ID}: enabled=${bopPackage?.enabled} type=${bopTemplate?.type} members=${bopMembers}（期望 108）`,
      );
    }
    if (
      !iipPackage?.enabled ||
      iipTemplate?.type !== "probe_interval" ||
      iipTemplate.intervalHours !== 168 ||
      iipMembers !== 4
    ) {
      errors.push(
        `${IIP_PACKAGE_ID}: enabled=${iipPackage?.enabled} type=${iipTemplate?.type} interval=${iipTemplate?.intervalHours} members=${iipMembers}（期望 4）`,
      );
    }

    for (const [group, state] of summary) {
      console.log(
        `  ${state.ok === state.total ? "✓" : "✗"} ${group}: ${state.ok}/${state.total} · ${state.min}→${state.max}`,
      );
    }
    console.log(`  ${bopMembers === 108 ? "✓" : "✗"} ${BOP_PACKAGE_ID}: ${bopMembers}/108`);
    console.log(`  ${iipMembers === 4 ? "✓" : "✗"} ${IIP_PACKAGE_ID}: ${iipMembers}/4`);
  } finally {
    await prisma.$disconnect();
  }

  if (errors.length > 0) {
    for (const error of errors.slice(0, 30)) console.error(`  ✗ ${error}`);
    if (errors.length > 30) console.error(`  …另有 ${errors.length - 30} 条`);
    throw new Error(`[verify-us-balance-of-payments] 失败：${errors.length} 条异常`);
  }
  console.log("[verify-us-balance-of-payments] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

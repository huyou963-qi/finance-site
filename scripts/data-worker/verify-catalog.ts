/**
 * 数据目录自检：
 * - Excel bootstrap 指标须配置网络自动源（非 BULK）且 fetchAcquisition=known
 * - 禁止仅 BULK_FILE / MANUAL 作为唯一订阅
 *
 * npm run data:verify-catalog -- --db
 */
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, Prisma, PrismaClient, SourceAdapterKind } from "@prisma/client";
import {
  isExcelBootstrap,
  needsNetworkSource,
  resolveAcquisitionStatus,
  resolveUpdateStatus,
} from "../../src/lib/data/scheduler/catalogAcquisition";
import { parseReleaseRule } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const checkDb = argFlag("db");
  if (!checkDb) {
    console.log("用法: npm run data:verify-catalog -- --db");
    process.exit(0);
  }

  const instruments = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES },
    include: {
      dataSubscription: { include: { source: true } },
    },
  });

  const subInstrumentIds = instruments
    .map((i) => i.id)
    .filter(Boolean);

  const fetchRows =
    subInstrumentIds.length > 0
      ? await prisma.$queryRaw<
          {
            instrument_id: string;
            status: string;
            started_at: Date;
            rows_upserted: number;
            source_lag_days: number | null;
          }[]
        >`
          SELECT DISTINCT ON (ds.instrument_id)
            ds.instrument_id::text AS instrument_id,
            fr.status::text AS status,
            fr.started_at,
            fr.rows_upserted,
            fr.source_lag_days
          FROM mds.fetch_run fr
          INNER JOIN mds.data_subscription ds ON ds.id = fr.subscription_id
          WHERE ds.instrument_id IN (${Prisma.join(subInstrumentIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY ds.instrument_id, fr.started_at DESC
        `
      : [];

  const latestFetchByInstrument = new Map(
    fetchRows.map((r) => [
      r.instrument_id,
      {
        status: r.status,
        startedAt: r.started_at,
        rowsUpserted: r.rows_upserted,
        sourceLagDays: r.source_lag_days,
      },
    ]),
  );

  let excelBootstrap = 0;
  let excelNeedsNetwork = 0;
  let bulkOnly = 0;
  let stale = 0;
  let sourceCurrent = 0;
  let ready = 0;
  const failures: string[] = [];

  for (const inst of instruments) {
    const sub = inst.dataSubscription;
    const acquisitionStatus = resolveAcquisitionStatus({
      subscriptionEnabled: sub?.enabled ?? false,
      adapterKind: sub?.source.adapterKind ?? null,
      sourceSeriesKey: sub?.sourceSeriesKey ?? null,
      metadata: inst.metadata,
    });

    if (isExcelBootstrap(inst.metadata)) {
      excelBootstrap += 1;
      if (needsNetworkSource({ metadata: inst.metadata, acquisitionStatus })) {
        excelNeedsNetwork += 1;
        failures.push(
          `${inst.code}: Excel 历史导入未配齐网络源（须非 BULK 订阅 + data:probe-sources 确认获取）`,
        );
      }
    }

    if (
      sub?.enabled &&
      (sub.source.adapterKind === SourceAdapterKind.BULK_FILE ||
        sub.source.adapterKind === SourceAdapterKind.MANUAL)
    ) {
      bulkOnly += 1;
      failures.push(
        `${inst.code}: 订阅为 ${sub.source.adapterKind}，不可作为定期自动更新源`,
      );
    }

    if (acquisitionStatus === "ready") {
      ready += 1;
      const rule = sub ? parseReleaseRule(sub.releaseRule) : null;
      const calendarMatch = rule?.type === "economic_calendar" ? rule.calendarMatch : undefined;
      const sourceSync = rule?.type === "economic_calendar" ? rule.sourceSync : undefined;
      const lastFetch = latestFetchByInstrument.get(inst.id);
      const updateStatus = sub
        ? resolveUpdateStatus({
            acquisitionStatus,
            subscriptionEnabled: sub.enabled,
            nextRunAt: sub.nextRunAt,
            lastSuccessAt: sub.lastSuccessAt,
            lastFetchStatus: lastFetch?.status ?? null,
            lastFetchAt: lastFetch?.startedAt ?? null,
            lastFetchUpserted: lastFetch?.rowsUpserted ?? null,
            sourceLagDays: lastFetch?.sourceLagDays ?? null,
            sourceSync: sourceSync ?? null,
            calendarReleaseAt: calendarMatch?.releaseAt ?? null,
          })
        : null;
      if (updateStatus === "stale") stale += 1;
      if (updateStatus === "source_current") sourceCurrent += 1;
    }
  }

  console.log(`[verify-catalog] 指标 ${instruments.length} 条`);
  console.log(`[verify-catalog] Excel bootstrap ${excelBootstrap}，待配网络源 ${excelNeedsNetwork}`);
  console.log(`[verify-catalog] BULK/MANUAL 订阅 ${bulkOnly} 条（应为 0）`);
  console.log(`[verify-catalog] ready ${ready}，stale ${stale}，source_current ${sourceCurrent}`);

  if (failures.length) {
    console.log("\n失败项:");
    for (const f of failures.slice(0, 40)) console.log(`  ✗ ${f}`);
    if (failures.length > 40) console.log(`  … 另有 ${failures.length - 40} 条`);
    process.exit(1);
  }

  console.log("[verify-catalog] PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

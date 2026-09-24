/**
 * 数据目录自检：
 * - Excel bootstrap 指标须配置网络自动源（非 BULK）且 fetchAcquisition=known
 * - 禁止仅 MANUAL / 无抓取器的 BULK_FILE 作为唯一订阅（官方文件源配了抓取器 = 自动更新，合格）
 * - **订阅必须真的会被调度器选中**（见下）
 * - 已写目录 tombstone（退役 / 源端停更 / 被取代）的是**有意冻结的历史存量**，
 *   不参与以上检查，只单独计数（2026-09-22）
 *
 * 关于第三条：`resolveAcquisitionStatus()` 只看适配器/序列键，FRED 订阅即便
 * 从没探测过也返回 "ready"；而调度器 `listDueSubscriptions()` 用的是
 * `isNetworkAcquisitionConfirmed()`，额外要求 `fetchAcquisition.status === "known"`。
 * 两者结论相反时，订阅会被**静默跳过**：不报错、不计失败、包级也看不出来
 * （受影响的发布包往往还有别的已探测成员，照常调度成功）。
 * 2026-07-20 ~ 09-11 用 seed 脚本种下的 140 条 sched_fred_* 就是这样漏了两个月，
 * 其中 116 条一条数据都没有，而本自检当时报 ready 5477、PASS。
 * 所以这里必须按调度器的口径判定，不能只看 acquisitionStatus。
 *
 * npm run data:verify-catalog -- --db
 */
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, Prisma, PrismaClient, SourceAdapterKind } from "@prisma/client";
import {
  isExcelBootstrap,
  isNetworkAcquisitionConfirmed,
  needsNetworkSource,
  resolveAcquisitionStatus,
  resolveUpdateStatus,
} from "../../src/lib/data/scheduler/catalogAcquisition";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { parseReleaseRule } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/**
 * 仍在系统模板里展示、但**确认没有可合规自动抓取的源**的历史序列：只警告不判失败。
 * 加条目必须写明查证过的理由；找到合规源后就接入并从这里删掉。
 */
const ACCEPTED_NO_AUTOMATION: Record<string, string> = {
  // 2026-09-22 核对：CME Gold_Stocks.xls 对服务器返回 403，CME 条款禁止抓取，库存数据属 CME 授权
  goldov_c23_comex_stock_oz: "COMEX 黄金库存（CME 授权数据，无可合规抓取的源），保留历史存量",
};

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

  // tombstone = 有意从目录隐藏并停止抓取的历史存量，不再要求它有自动源
  const hiddenKeys = new Set(
    (await prisma.macroCatalogExcludedKey.findMany({ select: { catalogKey: true } })).map((r) => r.catalogKey),
  );

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
  let unscheduled = 0;
  let hiddenFrozen = 0;
  const failures: string[] = [];
  const acceptedWarnings: string[] = [];
  const unscheduledByTag = new Map<string, number>();

  for (const inst of instruments) {
    if (hiddenKeys.has(`mds:${inst.code}`)) {
      hiddenFrozen += 1;
      continue;
    }
    const accepted = ACCEPTED_NO_AUTOMATION[inst.code];
    if (accepted) {
      acceptedWarnings.push(`${inst.code}: ${accepted}`);
      continue;
    }
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

    // BULK_FILE 本身不是问题：官方 CSV/Excel 源配了抓取器（metadata.scrape.provider）且获取已确认，
    // 就是在自动更新（如日本海关、财务省储备）。只有 MANUAL 或无抓取器的文件订阅才真的不会更新。
    const scrapeProvider = (inst.metadata as { scrape?: { provider?: unknown } } | null)?.scrape?.provider;
    const automatedFile =
      sub?.source.adapterKind === SourceAdapterKind.BULK_FILE &&
      typeof scrapeProvider === "string" &&
      readFetchAcquisition(inst.metadata)?.status === "known";
    if (
      sub?.enabled &&
      (sub.source.adapterKind === SourceAdapterKind.MANUAL ||
        (sub.source.adapterKind === SourceAdapterKind.BULK_FILE && !automatedFile))
    ) {
      bulkOnly += 1;
      failures.push(
        `${inst.code}: 订阅为 ${sub.source.adapterKind}（无自动抓取器），不可作为定期自动更新源`,
      );
    }

    if (acquisitionStatus === "ready") {
      ready += 1;

      // 调度器口径：ready 还不够，还要 fetchAcquisition=known 才会被选中。
      const fa = readFetchAcquisition(inst.metadata);
      const scheduled = isNetworkAcquisitionConfirmed({
        inDatabase: true,
        acquisitionStatus,
        fetchAcquisitionStatus: fa?.status ?? null,
      });
      if (!scheduled) {
        unscheduled += 1;
        // sched_wb_* 这类 metadata 整个是 NULL，按 sourceTag 分组只会得到一堆
        // "(无 sourceTag)"，看不出该找谁；回落到 sourceId 才指得出源头。
        const tag =
          (inst.metadata as Record<string, unknown> | null)?.sourceTag?.toString() ??
          (sub ? `source:${sub.sourceId}` : "(无订阅)");
        unscheduledByTag.set(tag, (unscheduledByTag.get(tag) ?? 0) + 1);
        failures.push(
          `${inst.code}: acquisition=ready 但 fetchAcquisition=${fa?.status ?? "缺失"}，` +
            `调度器不会选中它（sourceTag=${tag}）。修：npm run data:probe-sources -- --prefix=${inst.code} --skip-known`,
        );
      }

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

  console.log(`[verify-catalog] 指标 ${instruments.length} 条（其中目录隐藏的历史存量 ${hiddenFrozen} 条，不参与检查）`);
  console.log(`[verify-catalog] Excel bootstrap ${excelBootstrap}，待配网络源 ${excelNeedsNetwork}`);
  console.log(`[verify-catalog] 无抓取器的 BULK/MANUAL 订阅 ${bulkOnly} 条（应为 0）`);
  console.log(`[verify-catalog] ready ${ready}，stale ${stale}，source_current ${sourceCurrent}`);
  console.log(
    `[verify-catalog] ready 但不会被调度 ${unscheduled} 条（应为 0）` +
      (unscheduled > 0
        ? `：${[...unscheduledByTag]
            .sort((a, b) => b[1] - a[1])
            .map(([tag, n]) => `${tag}×${n}`)
            .join("，")}`
        : ""),
  );

  if (acceptedWarnings.length) {
    console.log("\n已登记、接受现状的无自动源序列（仅警告）:");
    for (const w of acceptedWarnings) console.log(`  ! ${w}`);
  }

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

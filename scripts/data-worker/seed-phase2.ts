/**
 * Phase 2 种子：扩展 FRED 目录、usov_*、debtcap BIS、World Bank 试点订阅
 *
 * npm run data:seed-phase2
 * npm run data:seed-phase2 -- --skip-wb
 * npm run data:seed-phase2 -- --debtcap-only
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  bisSourceSeriesKeyForDebtcapCode,
  granularityFromFreqLabel,
  PHASE2_AGENCIES,
  PHASE2_DATA_SOURCES,
  PHASE2_DEBTCAP_BIS_CODES,
  PHASE2_FRED_EXTRA,
  PHASE2_USOV_FRED,
  PHASE2_WB_PILOT_COUNTRIES,
  PHASE2_WB_PILOT_INDICATORS,
  releaseRuleForPhase2,
} from "../../src/lib/data/scheduler/phase2SeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function upsertAgenciesAndSources() {
  for (const a of PHASE2_AGENCIES) {
    await prisma.statisticalAgency.upsert({
      where: { id: a.id },
      create: a,
      update: {
        countryCode: a.countryCode,
        nameZh: a.nameZh,
        nameEn: a.nameEn ?? null,
        websiteUrl: a.websiteUrl ?? null,
      },
    });
  }

  await prisma.dataSource.upsert({
    where: { id: P0_DATA_SOURCE_FRED.id },
    create: {
      id: P0_DATA_SOURCE_FRED.id,
      agencyId: P0_DATA_SOURCE_FRED.agencyId,
      name: P0_DATA_SOURCE_FRED.name,
      adapterKind: SourceAdapterKind.FRED_API,
      baseUrl: P0_DATA_SOURCE_FRED.baseUrl,
      termsUrl: P0_DATA_SOURCE_FRED.termsUrl,
      rateLimit: P0_DATA_SOURCE_FRED.rateLimit,
    },
    update: {},
  });

  for (const ds of Object.values(PHASE2_DATA_SOURCES)) {
    await prisma.dataSource.upsert({
      where: { id: ds.id },
      create: {
        id: ds.id,
        agencyId: ds.agencyId,
        name: ds.name,
        adapterKind: ds.adapterKind as SourceAdapterKind,
        baseUrl: ds.baseUrl,
        termsUrl: ds.termsUrl,
        rateLimit: ds.rateLimit,
      },
      update: {
        agencyId: ds.agencyId,
        name: ds.name,
        adapterKind: ds.adapterKind as SourceAdapterKind,
        baseUrl: ds.baseUrl,
        termsUrl: ds.termsUrl,
        rateLimit: ds.rateLimit,
      },
    });
  }
}

async function upsertSubscription(
  instrumentId: string,
  data: {
    sourceId: string;
    sourceSeriesKey: string;
    granularity: ReturnType<typeof granularityFromFreqLabel>;
    releaseRule: object;
    priority?: number;
  },
) {
  const nextRunAt = computeNextRunAt(data.releaseRule as never, new Date());
  await prisma.dataSubscription.upsert({
    where: { instrumentId },
    create: {
      instrumentId,
      sourceId: data.sourceId,
      sourceSeriesKey: data.sourceSeriesKey,
      fetchMethod: DataFetchMethod.API,
      granularity: data.granularity,
      releaseRule: data.releaseRule,
      nextRunAt,
      enabled: true,
      priority: data.priority ?? 5,
    },
    update: {
      sourceId: data.sourceId,
      sourceSeriesKey: data.sourceSeriesKey,
      granularity: data.granularity,
      releaseRule: data.releaseRule,
      enabled: true,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });
}

async function seedFredExtra() {
  console.log("[seed-phase2] FRED 目录扩展…");
  let n = 0;
  for (const row of PHASE2_FRED_EXTRA) {
    const granularity = granularityFromFreqLabel(row.freqLabel);
    const rule = releaseRuleForPhase2("fred", row.fredId, granularity);
    const code = `sched_fred_${row.fredId}`;

    const instrument = await prisma.instrument.upsert({
      where: { code },
      create: {
        code,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        fredSeriesId: row.fredId,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        fredSeriesId: row.fredId,
      },
    });

    await upsertSubscription(instrument.id, {
      sourceId: "fred",
      sourceSeriesKey: row.fredId,
      granularity,
      releaseRule: rule,
      priority: 8,
    });
    n++;
    console.log(`  ✓ ${code}`);
  }
  return n;
}

async function seedUsovFred() {
  console.log("[seed-phase2] usov_* FRED 订阅…");
  let n = 0;
  let skip = 0;
  for (const row of PHASE2_USOV_FRED) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    if (!inst) {
      skip++;
      continue;
    }
    const granularity = granularityFromFreqLabel(inst.freqLabel ?? "月");
    const rule = releaseRuleForPhase2("fred", row.fredId, granularity);
    await upsertSubscription(inst.id, {
      sourceId: "fred",
      sourceSeriesKey: row.fredId,
      granularity,
      releaseRule: rule,
      priority: 7,
    });
    n++;
    console.log(`  ✓ ${row.instrumentCode} → ${row.fredId}`);
  }
  if (skip) console.log(`  · 跳过 ${skip} 条（Instrument 未入库，需先导入 US Overview xlsx）`);
  return n;
}

async function seedDebtcapBis() {
  console.log("[seed-phase2] debtcap BIS 订阅…");
  let n = 0;
  let skip = 0;
  for (const code of PHASE2_DEBTCAP_BIS_CODES) {
    const seriesKey = bisSourceSeriesKeyForDebtcapCode(code);
    if (!seriesKey) {
      skip++;
      continue;
    }
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      skip++;
      continue;
    }
    const rule = releaseRuleForPhase2("bis", seriesKey, "QUARTERLY");
    await upsertSubscription(inst.id, {
      sourceId: "bis",
      sourceSeriesKey: seriesKey,
      granularity: "QUARTERLY",
      releaseRule: rule,
      priority: 6,
    });
    n++;
    console.log(`  ✓ ${code} → ${seriesKey}`);
  }
  if (skip) console.log(`  · 跳过 ${skip} 条（Instrument 未入库或无 BIS 映射）`);
  return n;
}

async function seedWorldBankPilot() {
  console.log("[seed-phase2] World Bank 试点…");
  let n = 0;
  for (const cc of PHASE2_WB_PILOT_COUNTRIES) {
    for (const ind of PHASE2_WB_PILOT_INDICATORS) {
      const code = `sched_wb_${cc}_${ind.id.replace(/\./g, "_")}`;
      const wbKey = `${cc}:${ind.id}`;
      const rule = releaseRuleForPhase2("worldbank", wbKey, "ANNUAL");

      const instrument = await prisma.instrument.upsert({
        where: { code },
        create: {
          code,
          kind: InstrumentKind.MACRO_SERIES,
          name: `${cc} ${ind.label}`,
          freqLabel: "年",
          externalRefs: {
            catalogKey: `wb:${cc}:${ind.id}`,
            agencyId: "intl-wb",
            sourceId: "worldbank",
          },
        },
        update: {
          name: `${cc} ${ind.label}`,
          freqLabel: "年",
        },
      });

      await upsertSubscription(instrument.id, {
        sourceId: "worldbank",
        sourceSeriesKey: wbKey,
        granularity: "ANNUAL",
        releaseRule: rule,
        priority: 4,
      });
      n++;
    }
  }
  console.log(`  ✓ ${n} 条 wb 订阅 (${PHASE2_WB_PILOT_COUNTRIES.length} 国 × ${PHASE2_WB_PILOT_INDICATORS.length} 指标)`);
  return n;
}

async function main() {
  const skipWb = argFlag("skip-wb");
  const debtcapOnly = argFlag("debtcap-only");

  if (debtcapOnly) {
    console.log("[seed-phase2] 仅 debtcap BIS…");
    await upsertAgenciesAndSources();
    const bisN = await seedDebtcapBis();
    const total = await prisma.dataSubscription.count({
      where: { enabled: true, sourceId: "bis" },
    });
    console.log(`[seed-phase2] debtcap 完成 +${bisN}，bis 订阅合计 ${total}`);
    return;
  }

  const skipWb2 = skipWb;
  console.log("[seed-phase2] 机构与数据源…");
  await upsertAgenciesAndSources();

  const fredN = await seedFredExtra();
  const usovN = await seedUsovFred();
  const bisN = await seedDebtcapBis();
  const wbN = skipWb2 ? 0 : await seedWorldBankPilot();

  const total = await prisma.dataSubscription.count({ where: { enabled: true } });
  console.log(
    `[seed-phase2] 完成：新增/更新 FRED+${fredN} usov+${usovN} BIS+${bisN} WB+${wbN}；enabled 订阅合计 ${total}`,
  );
  console.log("  下一步：npm run data:sync-calendar && npm run data:worker");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

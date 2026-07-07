/**
 * 美国经济 Overview 分析框架 FRED 种子
 *
 * npm run data:seed-overview
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
  OVERVIEW_FRED_IDS_ALREADY_SEEDED,
  OVERVIEW_FRED_SERIES,
  buildOverviewInstrumentMetadata,
  releaseRuleForOverviewFred,
} from "../../src/lib/data/scheduler/overviewFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-overview] 确保 FRED 数据源…");
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

  let created = 0;
  let updated = 0;
  let skippedExisting = 0;

  console.log("[data:seed-overview] 写入 Overview FRED 序列与订阅…");
  for (const row of OVERVIEW_FRED_SERIES) {
    const rule = releaseRuleForOverviewFred(row.fredId, row.granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    const wasSeeded = OVERVIEW_FRED_IDS_ALREADY_SEEDED.has(row.fredId);

    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (existing) {
      if (wasSeeded) skippedExisting++;
      else updated++;
    } else {
      created++;
    }

    const latestObs = await prisma.macroObservation.findFirst({
      where: { instrument: { code: row.code } },
      orderBy: { obsDate: "desc" },
    });

    const metadata = buildOverviewInstrumentMetadata(row, {
      dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? null,
      existing:
        existing?.metadata && typeof existing.metadata === "object"
          ? (existing.metadata as Record<string, unknown>)
          : null,
    });

    const inst = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        name: row.name,
        kind: InstrumentKind.MACRO_SERIES,
        freqLabel: row.freqLabel,
        unit: row.unit,
        // Overview 序列均为 sched_fred_<id> 原始 FRED 序列（非变换），持有 fredSeriesId
        // 供 fredDbFirst 读库优先命中；YoY/3mma 等变换仪器（usov_c*）保持 null。
        fredSeriesId: row.fredId,
        metadata: metadata as object,
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        metadata: metadata as object,
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 45,
        releaseRule: rule as object,
        nextRunAt,
      },
      update: {
        sourceId: P0_DATA_SOURCE_FRED.id,
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: rule as object,
        nextRunAt,
      },
    });

    const tag = wasSeeded ? "reuse" : existing ? "update" : "new";
    console.info(`  [${tag}] ${row.code} ← ${row.fredId}`);
  }

  console.info(
    `[done] created=${created} updated=${updated} reused=${skippedExisting} total=${OVERVIEW_FRED_SERIES.length}`,
  );
  console.info("ISM PMI 使用 MDS（ism_* / ism_svc_*），请确保已运行 data:seed-ism-te / data:seed-ism-svc-te");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

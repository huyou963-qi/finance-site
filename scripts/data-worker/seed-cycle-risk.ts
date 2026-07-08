/**
 * 美国增长动能与衰退风险 FRED 种子
 *
 * npm run data:seed-cycle-risk
 * Spec: docs/specs/us-cycle-risk.spec.md
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
  CYCLE_RISK_FRED_SERIES,
  CYCLE_RISK_REUSED,
  buildCycleRiskInstrumentMetadata,
  releaseRuleForCycleRiskFred,
} from "../../src/lib/data/scheduler/cycleRiskFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-cycle-risk] 确保 FRED 数据源…");
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

  console.log("[data:seed-cycle-risk] 写入衰退风险/增长动能 FRED 序列与订阅…");
  for (const row of CYCLE_RISK_FRED_SERIES) {
    const rule = releaseRuleForCycleRiskFred(row);
    const nextRunAt = computeNextRunAt(rule, new Date());

    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (existing) updated++;
    else created++;

    const latestObs = await prisma.macroObservation.findFirst({
      where: { instrument: { code: row.code } },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true },
    });
    const dataLastObsDateIso = latestObs?.obsDate.toISOString().slice(0, 10) ?? null;
    const existingMeta =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : null;
    const metadata = buildCycleRiskInstrumentMetadata(row, { dataLastObsDateIso, existing: existingMeta });

    const instrument = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        metadata,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
          cycleRiskCategory: row.legacyCategory,
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        fredSeriesId: row.fredId,
        metadata,
        externalRefs: {
          catalogKey: `fred:${row.fredId}`,
          agencyId: "us-fred",
          sourceId: "fred",
          cycleRiskCategory: row.legacyCategory,
        },
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: "fred",
        sourceSeriesKey: row.fredId,
        fetchMethod: DataFetchMethod.API,
        granularity: row.granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceSeriesKey: row.fredId,
        granularity: row.granularity,
        releaseRule: rule,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(`  ✓ ${row.code} (${row.fredId}) · ${row.scheduleKind}`);
  }

  console.log("[data:seed-cycle-risk] 复用序列存在性检查（不覆盖既有 seed，仅补空 unit）…");
  let reusedMissing = 0;
  for (const reused of CYCLE_RISK_REUSED) {
    const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
    if (!inst) {
      console.error(`  ✗ 缺复用序列 ${reused.code}（应由 ${reused.seededBy} 创建，请先执行）`);
      reusedMissing++;
      continue;
    }
    if (reused.unitIfMissing && !inst.unit?.trim()) {
      await prisma.instrument.update({ where: { code: reused.code }, data: { unit: reused.unitIfMissing } });
      console.log(`  ✓ 复用 ${reused.code}（${reused.seededBy}）· 已补 unit=${reused.unitIfMissing}`);
    } else {
      console.log(`  ✓ 复用 ${reused.code}（${reused.seededBy}）`);
    }
  }

  console.log(`[data:seed-cycle-risk] 完成 created=${created} updated=${updated} reused-missing=${reusedMissing}`);
  console.log(
    "  下一步：data:seed-release-packages && data:sync-catalog-layout -- --prefix=fred: && data:backfill-empty",
  );
  if (reusedMissing > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

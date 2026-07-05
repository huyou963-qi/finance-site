/**
 * 美国货币政策与金融条件 FRED 种子
 *
 * npm run data:seed-monetary
 * Spec: docs/specs/us-monetary-financial.spec.md
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
  MONETARY_FRED_REUSED,
  MONETARY_FRED_SERIES,
  buildMonetaryInstrumentMetadata,
  releaseRuleForMonetaryFred,
} from "../../src/lib/data/scheduler/monetaryFredSeedCatalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  console.log("[data:seed-monetary] 确保 FRED 数据源…");
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

  console.log("[data:seed-monetary] 写入货币/金融条件 FRED 序列与订阅…");
  for (const row of MONETARY_FRED_SERIES) {
    const rule = releaseRuleForMonetaryFred(row.granularity);
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
    const metadata = buildMonetaryInstrumentMetadata(row, {
      dataLastObsDateIso,
      existing: existingMeta,
    });

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
          monetaryCategory: row.category,
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
          monetaryCategory: row.category,
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

    console.log(`  ✓ ${row.code} (${row.fredId})`);
  }

  console.log("[data:seed-monetary] 复用序列存在性检查（不覆盖既有 seed，仅补空 unit）…");
  let reusedMissing = 0;
  for (const reused of MONETARY_FRED_REUSED) {
    const inst = await prisma.instrument.findUnique({ where: { code: reused.code } });
    if (!inst) {
      console.error(
        `  ✗ 缺复用序列 ${reused.code}（应由 data:seed-${reused.seededBy} 创建，请先执行）`,
      );
      reusedMissing++;
      continue;
    }
    if (!inst.unit?.trim()) {
      await prisma.instrument.update({
        where: { code: reused.code },
        data: { unit: reused.unitIfMissing },
      });
      console.log(`  ✓ 复用 ${reused.code}（seed: ${reused.seededBy}）· 已补 unit=${reused.unitIfMissing}`);
    } else {
      console.log(`  ✓ 复用 ${reused.code}（seed: ${reused.seededBy}）`);
    }
  }

  console.log(
    `[data:seed-monetary] 完成 created=${created} updated=${updated} reused-missing=${reusedMissing}`,
  );
  console.log(
    "  下一步：npm run data:probe-sources -- --skip-known --prefix=sched_fred_ && npm run data:worker",
  );
  if (reusedMissing > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Phase 5：补全 usov FRED/复合订阅 + 可选 e-Stat 试点
 *
 * npm run data:seed-phase5
 * npm run data:seed-phase5 -- --dry-run
 * npm run data:seed-phase5 -- --usov-only
 * npm run data:seed-phase5 -- --estat --replace-xlsx
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
  granularityFromFreqLabel,
  releaseRuleForPhase2,
} from "../../src/lib/data/scheduler/phase2SeedCatalog";
import {
  PHASE5_DATA_SOURCES,
  PHASE5_ESTAT_JPOV,
  USOV_MANUAL_REMAINING,
} from "../../src/lib/data/scheduler/phase5SeedCatalog";
import {
  mergedUsovFredMap,
  USOV_FRED_PHASE5_EXTRA,
} from "../../src/lib/data/scheduler/usovFredMap";
import { USOV_COMPOSITE_FRED } from "../../src/lib/data/scheduler/usovCompositeFred";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function upsertFredSource(dryRun: boolean) {
  const existing = await prisma.dataSource.findUnique({ where: { id: "fred" } });
  if (!existing && !dryRun) {
    throw new Error("未找到 fred 数据源，请先 npm run data:seed-p0");
  }
}

async function upsertEstatSource(dryRun: boolean) {
  const ds = PHASE5_DATA_SOURCES["estat-jp"];
  if (dryRun) return;
  await prisma.dataSource.upsert({
    where: { id: ds.id },
    create: {
      id: ds.id,
      agencyId: ds.agencyId,
      name: ds.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ds.baseUrl,
      termsUrl: ds.termsUrl,
      rateLimit: ds.rateLimit,
      metadata: ds.metadata,
    },
    update: {
      name: ds.name,
      baseUrl: ds.baseUrl,
      rateLimit: ds.rateLimit,
      metadata: ds.metadata,
    },
  });
}

async function seedUsovDirect(dryRun: boolean) {
  let created = 0;
  let skipped = 0;
  for (const [code, fredId] of Object.entries(USOV_FRED_PHASE5_EXTRA)) {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      skipped++;
      continue;
    }
    const exists = await prisma.dataSubscription.findUnique({
      where: { instrumentId: inst.id },
    });
    if (exists) {
      skipped++;
      continue;
    }
    const granularity = granularityFromFreqLabel(inst.freqLabel ?? "月");
    const rule = releaseRuleForPhase2("fred", fredId, granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    if (dryRun) {
      console.log(`  + ${code} → ${fredId}`);
      created++;
      continue;
    }
    await prisma.dataSubscription.create({
      data: {
        instrumentId: inst.id,
        sourceId: "fred",
        sourceSeriesKey: fredId,
        fetchMethod: DataFetchMethod.API,
        granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 7,
      },
    });
    created++;
  }
  return { created, skipped };
}

async function seedUsovComposite(dryRun: boolean) {
  let created = 0;
  let skipped = 0;
  for (const code of Object.keys(USOV_COMPOSITE_FRED)) {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      skipped++;
      continue;
    }
    const exists = await prisma.dataSubscription.findUnique({
      where: { instrumentId: inst.id },
    });
    if (exists) {
      skipped++;
      continue;
    }
    const granularity = granularityFromFreqLabel(inst.freqLabel ?? "周");
    const rule = releaseRuleForPhase2("fred", code, granularity);
    const nextRunAt = computeNextRunAt(rule, new Date());
    if (dryRun) {
      console.log(`  + ${code} → composite`);
      created++;
      continue;
    }
    await prisma.dataSubscription.create({
      data: {
        instrumentId: inst.id,
        sourceId: "fred",
        sourceSeriesKey: `composite:${code}`,
        fetchMethod: DataFetchMethod.API,
        granularity,
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 7,
      },
    });
    created++;
  }
  return { created, skipped };
}

async function seedEstatPilot(dryRun: boolean, replaceXlsx: boolean) {
  let created = 0;
  let skipped = 0;
  for (const row of PHASE5_ESTAT_JPOV) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    if (!inst) {
      skipped++;
      continue;
    }
    const key = row.cdCat01 ? `${row.statsDataId}|${row.cdCat01}` : row.statsDataId;
    const rule = { type: "calendar_monthly" as const, probeFromDay: 8, intervalHours: 12, probeUntilDay: 20 };
    const nextRunAt = computeNextRunAt(rule, new Date());

    if (dryRun) {
      console.log(`  + ${row.instrumentCode} → e-Stat ${key}`);
      created++;
      continue;
    }

    if (replaceXlsx) {
      await prisma.dataSubscription.deleteMany({
        where: {
          instrumentId: inst.id,
          sourceId: "overview-japan",
        },
      });
    }

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: "estat-jp",
        sourceSeriesKey: key,
        fetchMethod: DataFetchMethod.API,
        granularity: "MONTHLY",
        releaseRule: rule,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceId: "estat-jp",
        sourceSeriesKey: key,
        enabled: true,
        releaseRule: rule,
        nextRunAt,
      },
    });
    created++;
  }
  return { created, skipped };
}

async function main() {
  const dryRun = argFlag("dry-run");
  const usovOnly = argFlag("usov-only");
  const enableEstat = argFlag("estat");
  const replaceXlsx = argFlag("replace-xlsx");

  console.log(`[seed-phase5] Phase 5${dryRun ? "（dry-run）" : ""}…`);

  if (!enableEstat || usovOnly) {
    await upsertFredSource(dryRun);
    const direct = await seedUsovDirect(dryRun);
    const composite = await seedUsovComposite(dryRun);
    console.log(
      `[seed-phase5] usov 直拉 新增 ${direct.created} 跳过 ${direct.skipped}；复合 新增 ${composite.created} 跳过 ${composite.skipped}`,
    );
    console.log(`[seed-phase5] 仍待手工/xlsx：${USOV_MANUAL_REMAINING.join(", ")}`);
    const mapped = {
      ...mergedUsovFredMap(),
      ...Object.fromEntries(Object.keys(USOV_COMPOSITE_FRED).map((k) => [k, "composite"])),
    };
    console.log(`[seed-phase5] usov 可自动映射 ${Object.keys(mapped).length} / 28`);
  }

  if (enableEstat && !usovOnly) {
    await upsertEstatSource(dryRun);
    const estat = await seedEstatPilot(dryRun, replaceXlsx);
    console.log(`[seed-phase5] e-Stat 试点 新增/更新 ${estat.created} 跳过 ${estat.skipped}`);
    if (!process.env.ESTAT_APP_ID?.trim()) {
      console.warn("[seed-phase5] 未配置 ESTAT_APP_ID，worker 拉取将失败直至配置密钥");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

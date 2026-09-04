/**
 * CBOE VIX9D / VVIX ——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-cboe-vix9d-vvix
 * npm run data:sync-cboe-vix9d-vvix -- --fixture=.data/cboe-vix9d-sample.csv --series=vix9d
 * npm run data:sync-cboe-vix9d-vvix -- --series=vvix   （只同步单个 series）
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { CBOE_INDEX_SERIES } from "../../src/lib/data/scheduler/cboeIndices/catalog";
import { fetchCboeIndexCsv } from "../../src/lib/data/scheduler/cboeIndices/client";
import { parseCboeIndexCsv } from "../../src/lib/data/scheduler/cboeIndices/parseCboeIndexCsv";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const seriesFilter = argValue("series");
  const targets = seriesFilter
    ? CBOE_INDEX_SERIES.filter((s) => s.seriesKey === seriesFilter)
    : CBOE_INDEX_SERIES;
  if (targets.length === 0) {
    throw new Error(`未识别 --series=${seriesFilter}`);
  }

  for (const config of targets) {
    const text = await fetchCboeIndexCsv(config.seriesKey, {
      url: config.csvUrl,
      fixturePath,
    });
    const { points, latestObsDate, skippedInvalid } = parseCboeIndexCsv(text, config);
    console.log(
      `[sync-cboe-vix9d-vvix] ${config.seriesKey} ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
        `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
    );

    const inst = await prisma.instrument.findUnique({ where: { code: config.instrumentCode } });
    if (!inst) {
      throw new Error(`未找到仪器 ${config.instrumentCode}，请先 npm run data:seed-cboe-vix9d-vvix`);
    }

    const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
    console.log(`[sync-cboe-vix9d-vvix] ${config.seriesKey} 完成：upserted=${upserted} skipped=${skipped}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

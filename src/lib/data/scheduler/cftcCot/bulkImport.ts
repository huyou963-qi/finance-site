import type { PrismaClient } from "@prisma/client";
import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
  type CotMetric,
} from "@/lib/data/cot/cotProductCatalog";
import { clearCftcCotCache, fetchCftcDisaggregatedRows } from "@/lib/data/scheduler/cftcCot/client";
import { extractMmSeries } from "@/lib/data/scheduler/cftcCot/match";
import { upsertMacroObservations } from "@/lib/data/scheduler/upsertObservations";

/** 历史回填：单次拉取后写入全部品种 long/short */
export async function bulkImportCotHistory(
  prisma: PrismaClient,
  options?: { weeksBack?: number },
): Promise<{ upserted: number; products: number }> {
  const weeksBack = options?.weeksBack ?? 60;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - weeksBack * 7);
  const sinceIso = since.toISOString().slice(0, 10);

  clearCftcCotCache();
  const rows = await fetchCftcDisaggregatedRows(sinceIso);
  let totalUpserted = 0;
  let products = 0;

  for (const product of COT_MM_PRODUCTS) {
    const series = extractMmSeries(rows, product.match);
    if (!series.length) {
      console.warn(`[cot-bulk] 无数据: ${product.label}`);
      continue;
    }
    products++;

    for (const metric of ["long", "short"] as const) {
      const code = cotInstrumentCode(product.slug, metric);
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) {
        console.warn(`[cot-bulk] 未找到仪器 ${code}，请先 npm run data:seed-cot`);
        continue;
      }
      const points = series.map((row) => ({
        obsDate: row.obsDate,
        value: metric === "long" ? row.long : row.short,
      }));
      const { upserted } = await upsertMacroObservations(prisma, inst.id, points);
      totalUpserted += upserted;

      const lastObs = points[points.length - 1]?.obsDate;
      if (lastObs) {
        await prisma.dataSubscription.updateMany({
          where: { instrumentId: inst.id },
          data: { lastObsDate: lastObs, lastSuccessAt: new Date(), lastError: null },
        });
      }
    }
  }

  return { upserted: totalUpserted, products };
}

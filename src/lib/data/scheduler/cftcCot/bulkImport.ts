import type { PrismaClient } from "@prisma/client";
import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
} from "@/lib/data/cot/cotProductCatalog";
import { clearCftcCotCache, fetchCftcDisaggregatedRows } from "@/lib/data/scheduler/cftcCot/client";
import { extractMmSeries } from "@/lib/data/scheduler/cftcCot/match";
import { CFTC_COT_HISTORY_START } from "./types";
import { readStoredLastObservationDate, upsertMacroObservations } from "@/lib/data/scheduler/upsertObservations";

/** 历史回填：单次拉取后写入全部品种 long/short */
export async function bulkImportCotHistory(
  prisma: PrismaClient,
  options?: { weeksBack?: number; productSlugs?: string[] },
): Promise<{ upserted: number; products: number }> {
  const since = new Date();
  if (options?.weeksBack != null) {
    if (!Number.isFinite(options.weeksBack) || options.weeksBack <= 0) throw new Error("weeksBack must be positive");
    since.setUTCDate(since.getUTCDate() - options.weeksBack * 7);
  }
  const sinceIso = options?.weeksBack == null ? CFTC_COT_HISTORY_START : since.toISOString().slice(0, 10);
  const selectedProducts = options?.productSlugs;
  if (selectedProducts?.some((slug) => !COT_MM_PRODUCTS.some((p) => p.slug === slug))) {
    throw new Error("Unknown COT product slug");
  }

  clearCftcCotCache();
  const rows = await fetchCftcDisaggregatedRows(sinceIso, { requireCompleteHistory: true });
  let totalUpserted = 0;
  let products = 0;

  for (const product of COT_MM_PRODUCTS) {
    if (selectedProducts && !selectedProducts.includes(product.slug)) continue;
    const series = extractMmSeries(rows, product.match);
    if (!series.length) {
      console.warn(`[cot-bulk] 无数据: ${product.label}`);
      continue;
    }
    products++;
    console.log(`[cot-bulk] ${product.slug}: ${series.length} 周，${series[0]!.obsDate.toISOString().slice(0, 10)} 至 ${series[series.length - 1]!.obsDate.toISOString().slice(0, 10)}`);

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

      const lastObs = await readStoredLastObservationDate(prisma, inst.id);
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

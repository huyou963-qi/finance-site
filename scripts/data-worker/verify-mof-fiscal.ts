import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

const BROAD_FISCAL_INPUTS = [
  "mof_cn_fiscal_general_expenditure_amount",
  "mof_cn_fiscal_fund_expenditure_amount",
] as const;

async function main() {
  if (!process.argv.includes("--db")) return console.log("[verify-mof-fiscal] catalog 通过");
  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const items = await prisma.instrument.findMany({ where: { code: { startsWith: "mof_cn_fiscal_" } }, include: { dataSubscription: true } });
    if (!items.length) throw new Error("财政部序列未入库");
    for (const item of items) {
      const count = await prisma.macroObservation.count({ where: { instrumentId: item.id } });
      const metadata = item.metadata as Record<string, unknown> | undefined;
      if (!count || item.dataSubscription?.sourceId !== "mof-fiscal" || !item.dataSubscription.enabled || readFetchAcquisition(metadata)?.status !== "known" || (metadata?.scrape as Record<string, unknown> | undefined)?.provider !== "mof_fiscal") {
        console.error(`异常 ${item.code} observations=${count}`);
        errors++;
      }
    }

    const inputSeries = await Promise.all(BROAD_FISCAL_INPUTS.map(async (code) => {
      const item = items.find((candidate) => candidate.code === code);
      if (!item) return { code, points: [] as Array<{ obsDate: Date; value: number }> };
      const points = await prisma.macroObservation.findMany({ where: { instrumentId: item.id }, orderBy: { obsDate: "asc" }, select: { obsDate: true, value: true } });
      return { code, points: points.map((point) => ({ obsDate: point.obsDate, value: Number(point.value) })) };
    }));
    for (const series of inputSeries) {
      const byYear = new Map<number, typeof series.points>();
      for (const point of series.points) byYear.set(point.obsDate.getUTCFullYear(), [...(byYear.get(point.obsDate.getUTCFullYear()) ?? []), point]);
      for (const [year, points] of byYear) {
        for (let index = 1; index < points.length; index++) {
          if (points[index]!.value < points[index - 1]!.value) {
            console.error(`异常 ${series.code} ${year} 累计额倒退：${points[index - 1]!.value} -> ${points[index]!.value}`);
            errors++;
          }
        }
      }
    }
    const generalMonths = new Set(inputSeries[0]!.points.map((point) => point.obsDate.toISOString().slice(0, 7)));
    const commonMonths = inputSeries[1]!.points.filter((point) => generalMonths.has(point.obsDate.toISOString().slice(0, 7))).length;
    if (commonMonths < 90) {
      console.error(`异常 广义财政两本账同月交集不足：${commonMonths}`);
      errors++;
    }
    console.log(`[verify-mof-fiscal] 有效序列=${items.length}，广义财政同月交集=${commonMonths}`);
  } finally {
    await prisma.$disconnect();
  }
  if (errors) throw new Error(`[verify-mof-fiscal] 失败：${errors}`);
}

main().catch((error) => { console.error(error); process.exit(1); });

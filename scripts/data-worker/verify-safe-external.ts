import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

const DATASET_MINIMUMS: Readonly<Record<string, number>> = {
  reserve: 10,
  settlement: 100,
  payments: 100,
  bop: 1_000,
  iip: 700,
  debt: 50,
};

const REQUIRED_BOP = [
  "safe_cn_bop_current_account",
  "safe_cn_bop_goods_balance",
  "safe_cn_bop_services_balance",
  "safe_cn_bop_direct_investment_net",
  "safe_cn_bop_portfolio_investment_net",
  "safe_cn_bop_other_investment_net",
] as const;

const REQUIRED_BOP_SHEETS = [
  "年度BOP（人民币）",
  "季度BOP（人民币）",
  "年度BOP（美元）",
  "季度BOP（美元）",
  "年度BOP（SDR）",
  "季度BOP（SDR）",
] as const;

function normalizeSheetName(value: string): string {
  return value.replace(/\s+/g, "").replace(/\)/g, "）");
}

async function main() {
  if (!process.argv.includes("--db")) {
    console.log("[verify-safe-external] catalog 通过");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const items = await prisma.instrument.findMany({
      where: { code: { startsWith: "safe_cn_" } },
      include: { dataSubscription: true },
    });
    if (!items.length) throw new Error("外管局序列未入库");

    const grouped = await prisma.macroObservation.groupBy({
      by: ["instrumentId"],
      where: { instrumentId: { in: items.map((item) => item.id) } },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((row) => [row.instrumentId, row._count._all]));
    const datasetCounts = new Map<string, number>();
    const bopSheetSeriesCounts = new Map<string, number>();
    const bopSheetObservationCounts = new Map<string, number>();

    for (const item of items) {
      const metadata = item.metadata as Record<string, unknown> | undefined;
      const scrape = metadata?.scrape as Record<string, unknown> | undefined;
      const dataset = String(scrape?.dataset ?? "");
      if (dataset) datasetCounts.set(dataset, (datasetCounts.get(dataset) ?? 0) + 1);
      const count = counts.get(item.id) ?? 0;
      if (dataset === "bop") {
        const sheetName = normalizeSheetName(item.dataSubscription?.sourceSeriesKey.split("|")[1] ?? "");
        bopSheetSeriesCounts.set(sheetName, (bopSheetSeriesCounts.get(sheetName) ?? 0) + 1);
        bopSheetObservationCounts.set(sheetName, (bopSheetObservationCounts.get(sheetName) ?? 0) + count);
        const externalRefs = (item.externalRefs as Record<string, unknown> | null) ?? {};
        if (
          item.dataSubscription?.releasePackageId !== "cn.safe.bop-quarterly" ||
          externalRefs.catalogKey !== `mds:${item.code}`
        ) {
          console.error(
            `异常 BOP 注册 ${item.code} package=${item.dataSubscription?.releasePackageId ?? "none"} ` +
              `catalogKey=${String(externalRefs.catalogKey ?? "none")}`,
          );
          errors += 1;
        }
      }
      if (
        !count ||
        item.dataSubscription?.sourceId !== "safe-external" ||
        !item.dataSubscription.enabled ||
        readFetchAcquisition(metadata)?.status !== "known" ||
        scrape?.provider !== "safe_external" ||
        !dataset
      ) {
        console.error(`异常 ${item.code} dataset=${dataset || "none"} observations=${count}`);
        errors += 1;
      }
    }

    for (const [dataset, minimum] of Object.entries(DATASET_MINIMUMS)) {
      const count = datasetCounts.get(dataset) ?? 0;
      const valid = count >= minimum;
      console.log(`${valid ? "✓" : "✗"} dataset=${dataset} series=${count} minimum=${minimum}`);
      if (!valid) errors += 1;
    }

    for (const sheet of REQUIRED_BOP_SHEETS) {
      const series = bopSheetSeriesCounts.get(sheet) ?? 0;
      const observations = bopSheetObservationCounts.get(sheet) ?? 0;
      const valid = series >= 281 && observations > 0;
      console.log(`${valid ? "✓" : "✗"} BOP sheet=${sheet} series=${series} observations=${observations}`);
      if (!valid) errors += 1;
    }
    const unknownBopSheets = [...bopSheetSeriesCounts.keys()].filter(
      (sheet) => !REQUIRED_BOP_SHEETS.includes(sheet as typeof REQUIRED_BOP_SHEETS[number]),
    );
    if (unknownBopSheets.length) {
      console.error(`✗ BOP 出现未识别工作表：${unknownBopSheets.join(", ")}`);
      errors += 1;
    }

    const bopItems = new Map(items.filter((item) => REQUIRED_BOP.includes(item.code as typeof REQUIRED_BOP[number])).map((item) => [item.code, item]));
    for (const code of REQUIRED_BOP) {
      const item = bopItems.get(code);
      const count = item ? counts.get(item.id) ?? 0 : 0;
      const latest = item
        ? await prisma.macroObservation.findFirst({
            where: { instrumentId: item.id },
            orderBy: { obsDate: "desc" },
            select: { obsDate: true },
          })
        : null;
      if (count < 100 || !latest || latest.obsDate < new Date("2025-12-01T00:00:00Z")) {
        console.error(`✗ BOP 核心序列 ${code} observations=${count} latest=${latest?.obsDate.toISOString().slice(0, 10) ?? "none"}`);
        errors += 1;
      }
    }

    const reserveIds = items
      .filter((item) => (item.metadata as Record<string, unknown> | null)?.scrape && ((item.metadata as Record<string, unknown>).scrape as Record<string, unknown>).dataset === "reserve")
      .map((item) => item.id);
    const now = new Date();
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const futureZeroCount = reserveIds.length
      ? await prisma.macroObservation.count({
          where: { instrumentId: { in: reserveIds }, obsDate: { gte: currentMonth }, value: 0 },
        })
      : 0;
    if (futureZeroCount) {
      console.error(`✗ reserve 当前/未来月份的 0 占位观测=${futureZeroCount}`);
      errors += 1;
    }

    console.log(
      `[verify-safe-external] 有效序列=${items.length} datasets=${datasetCounts.size} ` +
        `bopSheets=${bopSheetSeriesCounts.size} bopSeries=${datasetCounts.get("bop") ?? 0}`,
    );
    if (errors) throw new Error(`[verify-safe-external] 失败：${errors}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

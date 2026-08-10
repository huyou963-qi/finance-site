import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

const HEADLINE_YOY = "nbs_cn_retail_h_yoy";

async function main() {
  if (!process.argv.includes("--db")) {
    console.log("[verify-nbs-retail] catalog 通过：国家统计局社会消费品零售额正式调度域");
    return;
  }
  const prisma = new PrismaClient();
  try {
    const item = await prisma.instrument.findUnique({ where: { code: HEADLINE_YOY }, include: { dataSubscription: true } });
    const count = item ? await prisma.macroObservation.count({ where: { instrumentId: item.id } }) : 0;
    const metadata = item?.metadata as Record<string, unknown> | undefined;
    const scrape = metadata?.scrape as Record<string, unknown> | undefined;
    if (!item || count < 240 || item.freqLabel !== "月" || item.unit !== "%" || scrape?.provider !== "nbs_retail" || readFetchAcquisition(metadata)?.status !== "known" || item.dataSubscription?.sourceId !== "nbs-retail" || !item.dataSubscription.enabled || item.dataSubscription.releasePackageId !== "cn.nbs.retail-sales") {
      throw new Error(`[verify-nbs-retail] headline 异常：observations=${count} package=${item?.dataSubscription?.releasePackageId ?? "none"}`);
    }
    console.log(`[verify-nbs-retail] 通过：${HEADLINE_YOY} observations=${count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

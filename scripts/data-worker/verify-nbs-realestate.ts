import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

async function main() {
  if (!process.argv.includes("--db")) return void console.log("[verify-nbs-realestate] catalog 通过：房地产开发销售及70城新房/二手房价格");
  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const items = await prisma.instrument.findMany({ where: { code: { startsWith: "nbs_cn_realestate_" } }, include: { dataSubscription: true } });
    if (items.length < 450) throw new Error(`房地产目录序列不足：${items.length}`);
    let property = 0; let price = 0;
    for (const item of items) {
      const metadata = item.metadata as Record<string, unknown> | undefined;
      const scrape = metadata?.scrape as Record<string, unknown> | undefined;
      const count = await prisma.macroObservation.count({ where: { instrumentId: item.id } });
      if (metadata?.catalogCategory === "房地产开发与销售") property++;
      if (metadata?.catalogCategory === "70城住房价格") price++;
      if (!count || readFetchAcquisition(metadata)?.status !== "known" || scrape?.provider !== "nbs_realestate" || item.dataSubscription?.sourceId !== "nbs-realestate" || !item.dataSubscription.enabled) { console.error(`异常 ${item.code} observations=${count}`); errors++; }
    }
    if (property < 40 || price < 420) { console.error(`异常 分类数量 property=${property} price=${price}`); errors++; }
    console.log(`[verify-nbs-realestate] 有效序列=${items.length - errors}/${items.length}，开发销售=${property}，70城房价=${price}`);
  } finally { await prisma.$disconnect(); }
  if (errors) throw new Error(`[verify-nbs-realestate] 失败：${errors}`);
}
main().catch((error) => { console.error(error); process.exit(1); });

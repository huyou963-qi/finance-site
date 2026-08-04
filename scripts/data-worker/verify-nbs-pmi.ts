/**
 * 国家统计局中国 PMI 接入自检。
 *
 * npm run data:verify-nbs-pmi
 * npm run data:verify-nbs-pmi -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  NBS_PMI_INSTRUMENTS,
  NBS_PMI_INSTRUMENT_CODES,
} from "../../src/lib/data/scheduler/nbsPmi/catalog";

loadEnvConfig(process.cwd());

async function main() {
  const uniqueCodes = new Set(NBS_PMI_INSTRUMENT_CODES);
  if (uniqueCodes.size !== NBS_PMI_INSTRUMENTS.length) {
    throw new Error("NBS PMI catalog 存在重复 instrument code");
  }
  const manufacturing = NBS_PMI_INSTRUMENTS.filter(
    (row) => row.sheetName === "制造业",
  ).length;
  const nonManufacturing = NBS_PMI_INSTRUMENTS.filter(
    (row) => row.sheetName === "非制造业",
  ).length;
  if (manufacturing !== 14 || nonManufacturing !== 10) {
    throw new Error(`NBS PMI catalog 数量异常：制造业=${manufacturing} 非制造业=${nonManufacturing}`);
  }
  if (!process.argv.includes("--db")) {
    console.log("[verify-nbs-pmi] catalog 通过：制造业 14 + 非制造业 10（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const definition of NBS_PMI_INSTRUMENTS) {
      const instrument = await prisma.instrument.findUnique({
        where: { code: definition.code },
        include: { dataSubscription: true },
      });
      if (!instrument) {
        console.error(`  ✗ 缺 Instrument ${definition.code}`);
        errors++;
        continue;
      }
      const acquisition = readFetchAcquisition(instrument.metadata);
      const metadata = (instrument.metadata ?? {}) as Record<string, unknown>;
      const scrape = metadata.scrape as Record<string, unknown> | undefined;
      if (
        acquisition?.status !== "known" ||
        metadata.bootstrapOnly === true ||
        scrape?.provider !== "nbs_pmi"
      ) {
        console.error(`  ✗ ${definition.code} 获取方式或 provider 未就绪`);
        errors++;
      }
      if (
        !instrument.dataSubscription?.enabled ||
        instrument.dataSubscription.sourceId !== "nbs-pmi"
      ) {
        console.error(`  ✗ ${definition.code} 订阅未启用或 sourceId 错误`);
        errors++;
      }
      const count = await prisma.macroObservation.count({
        where: { instrumentId: instrument.id },
      });
      const bad = await prisma.macroObservation.count({
        where: {
          instrumentId: instrument.id,
          OR: [{ value: { lt: 0 } }, { value: { gt: 100 } }],
        },
      });
      const dates = await prisma.macroObservation.findMany({
        where: { instrumentId: instrument.id },
        select: { obsDate: true },
      });
      const nonMonthStart = dates.filter((row) => row.obsDate.getUTCDate() !== 1).length;
      if (count < 100 || bad > 0 || nonMonthStart > 0) {
        console.error(
          `  ✗ ${definition.code} observations=${count} outOfRange=${bad} nonMonthStart=${nonMonthStart}`,
        );
        errors++;
      } else {
        console.log(`  ✓ ${definition.code} observations=${count}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  if (errors > 0) throw new Error(`[verify-nbs-pmi] 失败：${errors} 项`);
  console.log("[verify-nbs-pmi] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/** 金融监管总局银行业统计——静态与数据库自检。 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { NFRA_BANKING_SERIES } from "../../src/lib/data/scheduler/nfraBanking/catalog";

async function main() {
  const codes = new Set<string>();
  const providers = new Set<string>();
  for (const row of NFRA_BANKING_SERIES) {
    if (codes.has(row.instrumentCode)) throw new Error(`重复 instrumentCode: ${row.instrumentCode}`);
    if (providers.has(row.provider)) throw new Error(`重复 provider: ${row.provider}`);
    codes.add(row.instrumentCode);
    providers.add(row.provider);
  }
  console.log(`[verify-nfra-banking] 静态目录通过：${codes.size} 条序列`);
  if (!process.argv.includes("--db")) return;

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const row of NFRA_BANKING_SERIES) {
      const instrument = await prisma.instrument.findUnique({
        where: { code: row.instrumentCode },
        include: { dataSubscription: true },
      });
      if (!instrument) {
        console.error(`  ✗ ${row.instrumentCode}: 缺 Instrument`);
        errors++;
        continue;
      }
      const acquisition = readFetchAcquisition(instrument.metadata);
      const metadata = (instrument.metadata ?? {}) as Record<string, unknown>;
      const scrape = metadata.scrape as Record<string, unknown> | undefined;
      const subscription = instrument.dataSubscription;
      const expectedPackage =
        row.dataset === "bank_assets_monthly"
          ? "cn.nfra.bank-assets-monthly"
          : "cn.nfra.bank-supervision-quarterly";
      if (acquisition?.status !== "known" || acquisition.method !== "nfra_official_excel") {
        console.error(`  ✗ ${row.instrumentCode}: fetchAcquisition 不完整`);
        errors++;
      }
      if (scrape?.provider !== row.provider || scrape?.dataset !== row.dataset) {
        console.error(`  ✗ ${row.instrumentCode}: scrape 路由不匹配`);
        errors++;
      }
      if (
        !subscription?.enabled ||
        (subscription.releaseRule as { type?: string }).type !== "probe_interval" ||
        subscription.releasePackageId !== expectedPackage
      ) {
        console.error(`  ✗ ${row.instrumentCode}: 订阅/发布包不匹配`);
        errors++;
      }
      const count = await prisma.macroObservation.count({ where: { instrumentId: instrument.id } });
      const latest = await prisma.macroObservation.findFirst({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "desc" },
      });
      const minimum = row.dataset === "bank_assets_monthly" ? 20 : row.availableFromYear ? 8 : 16;
      if (count < minimum || !latest) {
        console.error(`  ✗ ${row.instrumentCode}: 观测仅 ${count} 条`);
        errors++;
      } else {
        console.log(`  ✓ ${row.instrumentCode}: ${count} 条，最新 ${latest.obsDate.toISOString().slice(0, 10)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  if (errors) throw new Error(`[verify-nfra-banking] 失败：${errors} 项`);
  console.log("[verify-nfra-banking] DB 自检通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

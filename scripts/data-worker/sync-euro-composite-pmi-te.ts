/**
 * 从 TE 欧元区综合 PMI 页抓取最新值并写入 mds
 *
 * @deprecated 生产环境请用 data:worker / 管理端「立即同步发布包」/ sync_package。
 * 本脚本仅用于本地 fixture 调试 HTML 解析：
 *
 * npm run data:sync-euro-composite-pmi-te -- --fixture=.data/te-euro-composite-pmi-sample.html
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  clearTradingEconomicsEuroCompositePmiHtmlCache,
  fetchAllTradingEconomicsEuroCompositePmiPoints,
} from "../../src/lib/data/scheduler/adapters/tradingEconomicsEuroCompositePmiAdapter";
import { EURO_COMPOSITE_PMI_INSTRUMENT_CODE } from "../../src/lib/data/scheduler/tradingEconomicsIndicator/euroCompositePmiCatalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  clearTradingEconomicsEuroCompositePmiHtmlCache();
  const parsed = await fetchAllTradingEconomicsEuroCompositePmiPoints({ fixturePath });

  console.info(
    `[fetch] headline=${parsed.headline.value} ref=${parsed.headline.referenceText}`,
  );

  const inst = await prisma.instrument.findUnique({
    where: { code: EURO_COMPOSITE_PMI_INSTRUMENT_CODE },
    select: { id: true, dataSubscription: { select: { id: true } } },
  });
  if (!inst) {
    console.warn(`[skip] 未找到 ${EURO_COMPOSITE_PMI_INSTRUMENT_CODE}（先 data:seed-euro-composite-pmi-te）`);
    return;
  }

  const { upserted } = await upsertMacroObservations(prisma, inst.id, [
    { obsDate: parsed.headline.obsDate, value: parsed.headline.value },
  ]);

  if (inst.dataSubscription) {
    await prisma.dataSubscription.update({
      where: { id: inst.dataSubscription.id },
      data: {
        lastObsDate: parsed.headline.obsDate,
        lastSuccessAt: new Date(),
        lastError: null,
      },
    });
  }

  console.info(
    `[ok] ${EURO_COMPOSITE_PMI_INSTRUMENT_CODE} | ${parsed.headline.value} | obs=${parsed.headline.obsDate.toISOString().slice(0, 10)} | +${upserted}`,
  );
  console.info(`[done] upserted=${upserted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

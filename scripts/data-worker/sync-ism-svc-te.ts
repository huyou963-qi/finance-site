/**
 * 从 TradingEconomics ISM 服务业页抓取 5 条序列并写入 mds
 *
 * npm run data:sync-ism-svc-te
 * npm run data:sync-ism-svc-te -- --fixture=.data/te-ism-svc-sample.html
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  fetchAllTradingEconomicsIsmSvcPoints,
  clearTradingEconomicsIsmSvcHtmlCache,
} from "../../src/lib/data/scheduler/adapters/tradingEconomicsIsmSvcAdapter";
import {
  ISM_SVC_INSTRUMENT_CODES,
  ISM_SVC_SECTOR_TO_TE_LABEL,
  ismSvcSectorFromInstrumentCode,
} from "../../src/lib/data/scheduler/tradingEconomicsIndicator/ismSvcCatalog";
import { seriesPointForSector } from "../../src/lib/data/scheduler/tradingEconomicsIndicator/parseIsmSvcPage";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  clearTradingEconomicsIsmSvcHtmlCache();
  const parsed = await fetchAllTradingEconomicsIsmSvcPoints({ fixturePath });

  console.info(
    `[fetch] headline=${parsed.headline?.value ?? "—"} ref=${parsed.headline?.referenceText ?? "—"}`,
  );
  console.info(
    `[fetch] components=${parsed.components.length} calendar=${parsed.latestCalendarRelease?.calendarDate.toISOString().slice(0, 10) ?? "—"}`,
  );

  let upsertedTotal = 0;
  for (const code of ISM_SVC_INSTRUMENT_CODES) {
    const sector = ismSvcSectorFromInstrumentCode(code);
    if (!sector) continue;
    const point = seriesPointForSector(parsed, sector);
    const inst = await prisma.instrument.findUnique({
      where: { code },
      select: { id: true, dataSubscription: { select: { id: true } } },
    });
    if (!inst) {
      console.warn(`[skip] 未找到 ${code}`);
      continue;
    }
    if (!point) {
      console.warn(`[skip] TE 页未解析到 ${ISM_SVC_SECTOR_TO_TE_LABEL[sector]}`);
      continue;
    }

    const { upserted } = await upsertMacroObservations(prisma, inst.id, [
      { obsDate: point.obsDate, value: point.value },
    ]);
    upsertedTotal += upserted;

    if (inst.dataSubscription) {
      await prisma.dataSubscription.update({
        where: { id: inst.dataSubscription.id },
        data: {
          lastObsDate: point.obsDate,
          lastSuccessAt: new Date(),
          lastError: null,
        },
      });
    }

    console.info(
      `[ok] ${code} | ${point.value} | obs=${point.obsDate.toISOString().slice(0, 10)} | ref=${point.referenceText} | +${upserted}`,
    );
  }

  console.info(`[done] upserted=${upsertedTotal}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

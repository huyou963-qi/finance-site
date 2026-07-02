/**
 * 从 TradingEconomics ISM 页抓取 8 条序列并写入 mds
 *
 * @deprecated 生产环境请用 data:worker / 管理端「立即同步发布包」/ sync_package。
 * 本脚本仅用于本地 fixture 调试 HTML 解析：
 *
 * npm run data:sync-ism-te -- --fixture=.data/te-ism-sample.html
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  fetchAllTradingEconomicsIsmPoints,
  clearTradingEconomicsIsmHtmlCache,
} from "../../src/lib/data/scheduler/adapters/tradingEconomicsIsmAdapter";
import {
  ISM_INSTRUMENT_CODES,
  ISM_SECTOR_TO_TE_LABEL,
  ismSectorFromInstrumentCode,
} from "../../src/lib/data/scheduler/tradingEconomicsIndicator/ismCatalog";
import { seriesPointForSector } from "../../src/lib/data/scheduler/tradingEconomicsIndicator/parseIsmPage";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  clearTradingEconomicsIsmHtmlCache();
  const parsed = await fetchAllTradingEconomicsIsmPoints({ fixturePath });

  console.info(
    `[fetch] headline=${parsed.headline?.value ?? "—"} ref=${parsed.headline?.referenceText ?? "—"}`,
  );
  console.info(
    `[fetch] components=${parsed.components.length} calendar=${parsed.latestCalendarRelease?.calendarDate.toISOString().slice(0, 10) ?? "—"}`,
  );

  let upsertedTotal = 0;
  for (const code of ISM_INSTRUMENT_CODES) {
    const sector = ismSectorFromInstrumentCode(code);
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
      console.warn(`[skip] TE 页未解析到 ${ISM_SECTOR_TO_TE_LABEL[sector]}`);
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

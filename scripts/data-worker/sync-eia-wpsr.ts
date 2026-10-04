/**
 * EIA WPSR complete-history XLS sync.
 *
 * npm run data:sync-eia-wpsr
 * npm run data:sync-eia-wpsr -- --fixture-dir=.data/eia-wpsr
 * npm run data:sync-eia-wpsr -- --series=WDISTUS1,WCSSTUS1
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { fetchEiaWpsrWorkbook } from "../../src/lib/data/scheduler/eiaWpsr/client";
import {
  EIA_WPSR_SERIES,
  eiaWpsrWorkbookUrl,
} from "../../src/lib/data/scheduler/eiaWpsr/catalog";
import { parseEiaWpsrWorkbook } from "../../src/lib/data/scheduler/eiaWpsr/parseWorkbook";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const fixtureDir = argValue("fixture-dir");
  const requested = new Set(
    (argValue("series") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const selected = requested.size
    ? EIA_WPSR_SERIES.filter((row) => requested.has(row.sourceSeriesKey))
    : [...EIA_WPSR_SERIES];
  if (selected.length === 0 || selected.length !== (requested.size || selected.length)) {
    throw new Error(`未知 EIA WPSR series：${[...requested].join(",")}`);
  }

  for (let index = 0; index < selected.length; index++) {
    const row = selected[index]!;
    const fixturePath = fixtureDir
      ? path.join(fixtureDir, `${row.sourceSeriesKey}w.xls`)
      : undefined;
    const workbook = await fetchEiaWpsrWorkbook(row.sourceSeriesKey, {
      url: eiaWpsrWorkbookUrl(row.sourceSeriesKey),
      fixturePath,
    });
    const parsed = parseEiaWpsrWorkbook(workbook, row);
    const instrument = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!instrument) throw new Error(`缺 Instrument ${row.code}，请先 seed-eia-wpsr`);
    const result = await upsertMacroObservations(prisma, instrument.id, parsed.points, {
      vintageSource: "eia_wpsr_full_history",
    });
    console.log(
      `${row.sourceSeriesKey}: parsed=${parsed.points.length} latest=${parsed.latestObsDate.toISOString().slice(0, 10)} ` +
        `upserted=${result.upserted} inserted=${result.inserted} changed=${result.changed} unchanged=${result.unchanged}`,
    );
    if (!fixtureDir && index < selected.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

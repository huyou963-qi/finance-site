/**
 * 指标预测：非农 / ADP 的 ALFRED 历次版本回填（幂等，随 data:apply 执行）。
 *
 * npm run data:seed-forecast-vintages
 * npm run data:seed-forecast-vintages -- --start=2002-01-01
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { prisma } from "../../src/lib/prisma";
import { syncForecastMacroVintages } from "../../src/lib/data/macroObservationVintages";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const result = await syncForecastMacroVintages({ realtimeStart: arg("start"), realtimeEnd: arg("end") });
  console.log(`[seed-forecast-vintages] ALFRED ${result.realtimeStart} → ${result.realtimeEnd}`);
  for (const row of result.series) {
    console.log(
      `  ${row.seriesId.padEnd(14)} fetched=${String(row.fetchedRows).padStart(6)} parsed=${String(row.parsedVintages).padStart(6)} inserted=${String(row.insertedVintages).padStart(6)}`,
    );
  }
  if (result.series.length === 0) console.warn("  ⚠ 未找到 FRED 仪器（先跑 data:seed-labor）");
  console.log(`[seed-forecast-vintages] inserted total=${result.insertedVintages}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

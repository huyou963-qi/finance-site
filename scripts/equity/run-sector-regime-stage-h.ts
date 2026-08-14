import { prisma } from "../../src/lib/prisma";
import { runSectorRegimeStageH } from "../../src/lib/equity/sectorRegimeStageH";

function numberArg(name: string): number | undefined {
  const prefix = `--${name}=`;
  const raw = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function main() {
  const result = await runSectorRegimeStageH({
    vintageLookbackDays: numberArg("lookback-days"),
    dryRunAlerts: process.argv.includes("--dry-run-alerts"),
    forceAlerts: process.argv.includes("--force-alerts"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.monitor.alerts.some((alert) => alert.severity === "critical")) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

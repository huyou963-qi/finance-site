import { prisma } from "../../src/lib/prisma";
import { monitorSectorRegimeStageH } from "../../src/lib/equity/sectorRegimeStageH";

async function main() {
  const result = await monitorSectorRegimeStageH({
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force-alerts"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.alerts.some((alert) => alert.severity === "critical")) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

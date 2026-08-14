import { prisma } from "../../src/lib/prisma";
import {
  evaluateMaturedSectorRegimeSignals,
  freezeCurrentSectorRegimeSignal,
  getSectorRegimeLiveLedger,
} from "../../src/lib/equity/sectorRegimeLiveLedger";

async function main() {
  const frozen = await freezeCurrentSectorRegimeSignal();
  const evaluated = await evaluateMaturedSectorRegimeSignals();
  const ledger = await getSectorRegimeLiveLedger();
  console.log(JSON.stringify({ frozen, evaluated, status: ledger.status, vintageCoverage: ledger.vintageCoverage }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import assert from "node:assert/strict";
import { prisma } from "../../src/lib/prisma";
import { getSectorRegimeLiveLedger } from "../../src/lib/equity/sectorRegimeLiveLedger";

async function main() {
  const ledger = await getSectorRegimeLiveLedger();
  assert.equal(ledger.protocolVersion, "stage-g-v1");
  assert.ok(ledger.status.frozenSignals >= 1, "至少应有一个真实冻结信号");
  const latest = ledger.snapshots[0]!;
  assert.ok(latest.frozenAt.slice(0, 10) < latest.returnStartDate, "计分必须从冻结日之后开始");
  assert.equal(latest.signalHash.length, 64);
  assert.deepEqual(latest.horizons.map((row) => row.horizonMonths), [3, 6, 12]);
  assert.ok(latest.horizons.every((row) => row.total === 11), "每个期限应冻结全部 11 个行业");
  assert.ok(latest.horizons.every((row) => row.status === "pending"), "首次冻结尚未到期");
  assert.ok(ledger.vintageCoverage.trackedInputs >= 7);
  console.log(JSON.stringify({ status: ledger.status, latest, vintageCoverage: ledger.vintageCoverage }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

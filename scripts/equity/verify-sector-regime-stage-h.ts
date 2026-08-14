import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { prisma } from "../../src/lib/prisma";
import {
  monitorSectorRegimeStageH,
  runSectorRegimeStageH,
  SECTOR_REGIME_STAGE_H_VERSION,
} from "../../src/lib/equity/sectorRegimeStageH";
import { REGIME_VINTAGE_INPUT_CODES } from "../../src/lib/data/macroObservationVintages";

async function main() {
  const shouldRun = process.argv.includes("--run");
  const run = shouldRun
    ? await runSectorRegimeStageH({ dryRunAlerts: true })
    : null;
  const monitor = await monitorSectorRegimeStageH({ dryRun: true });
  assert.equal(monitor.state.protocolVersion, SECTOR_REGIME_STAGE_H_VERSION);
  assert.equal(monitor.coverage.trackedInputs, REGIME_VINTAGE_INPUT_CODES.length);
  assert.equal(monitor.coverage.currentCoveredInputs, REGIME_VINTAGE_INPUT_CODES.length);
  assert.equal(monitor.coverage.currentMatchingInputs, REGIME_VINTAGE_INPUT_CODES.length);

  const snapshots = await prisma.sectorRegimeSignalSnapshot.findMany({
    include: { _count: { select: { forecasts: true } } },
  });
  assert.ok(snapshots.length > 0, "至少应有一个冻结信号");
  for (const snapshot of snapshots) {
    assert.equal(snapshot.signalHash.length, 64);
    assert.equal(snapshot._count.forecasts, 33);
  }

  const cron = await fs.readFile("scripts/ops/finance-site-sector-regime.cron", "utf8");
  assert.match(cron, /equity:run-sector-regime-stage-h/);
  assert.match(cron, /equity:monitor-sector-regime-stage-h/);
  assert.match(cron, /flock/);
  const deploy = await fs.readFile(".github/workflows/deploy.yml", "utf8");
  assert.match(deploy, /finance-site-sector-regime\.cron/);

  if (run) {
    assert.equal(run.frozen.driftDetected, false);
    assert.equal(run.evaluated.missingPrices, 0);
    assert.equal(run.monitor.alerts.some((row) => row.severity === "critical"), false);
  }
  console.log(JSON.stringify({
    status: "ok",
    ranDailyTask: shouldRun,
    snapshots: snapshots.length,
    coverage: monitor.coverage,
    alerts: monitor.alerts,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REGIME_VINTAGE_INPUT_CODES,
  type RegimeMacroVintageCoverage,
} from "@/lib/data/macroObservationVintages";
import {
  buildSectorRegimeStageHAlerts,
  SECTOR_REGIME_STAGE_H_VERSION,
  type SectorRegimeStageHState,
} from "./sectorRegimeStageH";

const NOW = new Date("2026-08-14T12:00:00.000Z");

function state(overrides: Partial<SectorRegimeStageHState> = {}): SectorRegimeStageHState {
  return {
    protocolVersion: SECTOR_REGIME_STAGE_H_VERSION,
    lastStartedAt: "2026-08-14T10:00:00.000Z",
    lastCompletedAt: "2026-08-14T10:05:00.000Z",
    lastSuccessAt: "2026-08-14T10:05:00.000Z",
    lastMonitorAt: null,
    lastStatus: "success",
    lastError: null,
    lastRun: null,
    lastAlertAt: null,
    alertFingerprints: {},
    ...overrides,
  };
}

function coverage(): RegimeMacroVintageCoverage {
  const inputs = REGIME_VINTAGE_INPUT_CODES.map((code, index) => ({
    code,
    instrumentId: `instrument-${index}`,
    alfredEligible: !code.includes("ism_"),
    hasAlfredHistory: !code.includes("ism_"),
    latestObservationDate: "2026-07-01",
    latestObservationValue: 100 + index,
    latestVintageDate: "2026-07-01",
    latestVintageAvailableAt: "2026-08-01T12:00:00.000Z",
    latestVintageValue: 100 + index,
    latestVintageSource: code.includes("ism_") ? "worker_capture" : "alfred",
    currentObservationCovered: true,
    currentValueMatches: true,
  }));
  return {
    trackedInputs: inputs.length,
    capturedInputs: inputs.length,
    alfredInputs: inputs.filter((row) => row.alfredEligible).length,
    vintageRows: 100,
    currentCoveredInputs: inputs.length,
    currentMatchingInputs: inputs.length,
    inputs,
  };
}

test("Stage H 健康状态不产生告警", () => {
  const alerts = buildSectorRegimeStageHAlerts({
    now: NOW,
    state: state(),
    coverage: coverage(),
    pendingMaturedForecasts: 0,
    driftDetected: false,
  });
  assert.deepEqual(alerts, []);
});

test("缺跑、版本缺口、哈希漂移和到期缺价分别告警", () => {
  const broken = coverage();
  broken.inputs[0] = {
    ...broken.inputs[0]!,
    currentObservationCovered: false,
    currentValueMatches: false,
  };
  const alerts = buildSectorRegimeStageHAlerts({
    now: NOW,
    state: state({
      lastSuccessAt: "2026-08-11T00:00:00.000Z",
      lastStatus: "failed",
      lastError: "network timeout",
    }),
    coverage: broken,
    pendingMaturedForecasts: 3,
    driftDetected: true,
  });
  const keys = new Set(alerts.map((row) => row.key));
  assert.equal(keys.has("task-heartbeat-stale"), true);
  assert.equal(keys.has("task-last-run-failed"), true);
  assert.equal([...keys].some((key) => key.startsWith("vintage-current-missing:")), true);
  assert.equal(keys.has("signal-hash-drift"), true);
  assert.equal(keys.has("matured-price-missing"), true);
});

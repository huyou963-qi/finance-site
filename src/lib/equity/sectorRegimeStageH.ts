import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import {
  bootstrapRegimeCurrentVintages,
  getRegimeMacroVintageCoverage,
  FRED_REALTIME_MAX,
  REGIME_VINTAGE_INPUT_CODES,
  syncRegimeMacroVintages,
  type RegimeMacroVintageCoverage,
  type BootstrapRegimeCurrentVintagesResult,
  type SyncFredMacroVintagesResult,
} from "@/lib/data/macroObservationVintages";
import {
  evaluateMaturedSectorRegimeSignals,
  freezeCurrentSectorRegimeSignal,
  type EvaluateSectorRegimeSignalsResult,
  type FreezeSectorRegimeSignalResult,
} from "@/lib/equity/sectorRegimeLiveLedger";
import {
  sendOperationalAlerts,
  type OperationalAlertItem,
  type OperationalNotifyResult,
} from "@/lib/data/scheduler/operationalNotify";

export const SECTOR_REGIME_STAGE_H_VERSION = "stage-h-v1";
const STATE_FILE = path.join(process.cwd(), ".data", "sector-regime-stage-h-state.json");
const DEFAULT_VINTAGE_LOOKBACK_DAYS = 45;
const DEFAULT_HEARTBEAT_MAX_AGE_HOURS = 36;

export type SectorRegimeStageHState = {
  protocolVersion: string;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSuccessAt: string | null;
  lastMonitorAt: string | null;
  lastStatus: "never" | "running" | "success" | "failed";
  lastError: string | null;
  lastRun: {
    vintage: SyncFredMacroVintagesResult;
    bootstrap: BootstrapRegimeCurrentVintagesResult;
    frozen: FreezeSectorRegimeSignalResult;
    evaluated: EvaluateSectorRegimeSignalsResult;
    coverage: RegimeMacroVintageCoverage;
    pendingMaturedForecasts: number;
  } | null;
  lastAlertAt: string | null;
  alertFingerprints: Record<string, string>;
};

export type SectorRegimeStageHAlert = OperationalAlertItem;

function emptyState(): SectorRegimeStageHState {
  return {
    protocolVersion: SECTOR_REGIME_STAGE_H_VERSION,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastSuccessAt: null,
    lastMonitorAt: null,
    lastStatus: "never",
    lastError: null,
    lastRun: null,
    lastAlertAt: null,
    alertFingerprints: {},
  };
}

export async function readSectorRegimeStageHState(): Promise<SectorRegimeStageHState> {
  try {
    const parsed = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as Partial<SectorRegimeStageHState>;
    return { ...emptyState(), ...parsed, alertFingerprints: parsed.alertFingerprints ?? {} };
  } catch {
    return emptyState();
  }
}

async function writeSectorRegimeStageHState(state: SectorRegimeStageHState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(temp, STATE_FILE).catch(async () => {
    await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await fs.rm(temp, { force: true });
  });
}

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function daysBefore(value: Date, days: number): Date {
  return new Date(value.getTime() - days * 86_400_000);
}

function heartbeatMaxAgeHours(): number {
  const value = Number(
    process.env.SECTOR_REGIME_HEARTBEAT_MAX_AGE_HOURS?.trim()
      || DEFAULT_HEARTBEAT_MAX_AGE_HOURS,
  );
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_HEARTBEAT_MAX_AGE_HOURS;
}

function alertCooldownHours(): number {
  const value = Number(
    process.env.SECTOR_REGIME_ALERT_COOLDOWN_HOURS?.trim()
      || process.env.DATA_LAG_ALERT_COOLDOWN_HOURS?.trim()
      || "24",
  );
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function fingerprint(alert: SectorRegimeStageHAlert): string {
  return createHash("sha256")
    .update(`${alert.key}|${alert.severity}|${alert.message}`)
    .digest("hex")
    .slice(0, 20);
}

export function buildSectorRegimeStageHAlerts(options: {
  now: Date;
  state: SectorRegimeStageHState;
  coverage: RegimeMacroVintageCoverage;
  pendingMaturedForecasts: number;
  driftDetected?: boolean;
}): SectorRegimeStageHAlert[] {
  const alerts: SectorRegimeStageHAlert[] = [];
  const maxAgeHours = heartbeatMaxAgeHours();
  const successAt = options.state.lastSuccessAt
    ? new Date(options.state.lastSuccessAt).getTime()
    : Number.NaN;
  if (!Number.isFinite(successAt)) {
    alerts.push({
      key: "task-heartbeat-missing",
      severity: "critical",
      message: "Stage H 日常任务从未成功写入 heartbeat。",
    });
  } else {
    const ageHours = (options.now.getTime() - successAt) / 3_600_000;
    if (ageHours > maxAgeHours) {
      alerts.push({
        key: "task-heartbeat-stale",
        severity: "critical",
        message: `Stage H 已 ${ageHours.toFixed(1)} 小时未成功运行，阈值 ${maxAgeHours} 小时。`,
      });
    }
  }
  if (options.state.lastStatus === "failed") {
    alerts.push({
      key: "task-last-run-failed",
      severity: "critical",
      message: `最近一次日常任务失败：${options.state.lastError ?? "未知错误"}`,
    });
  }

  if (options.coverage.trackedInputs < REGIME_VINTAGE_INPUT_CODES.length) {
    alerts.push({
      key: "vintage-instrument-missing",
      severity: "critical",
      message: `仅登记 ${options.coverage.trackedInputs}/${REGIME_VINTAGE_INPUT_CODES.length} 个 Regime 输入。`,
    });
  }
  for (const input of options.coverage.inputs) {
    if (!input.currentObservationCovered) {
      alerts.push({
        key: `vintage-current-missing:${input.code}`,
        severity: "critical",
        message: `${input.code} 最新观测 ${input.latestObservationDate ?? "未知"} 没有可见版本。`,
      });
    } else if (!input.currentValueMatches) {
      alerts.push({
        key: `vintage-current-mismatch:${input.code}`,
        severity: "critical",
        message: `${input.code} 最新值与版本账本不一致。`,
      });
    }
    if (input.alfredEligible && !input.hasAlfredHistory) {
      alerts.push({
        key: `vintage-alfred-missing:${input.code}`,
        severity: "warning",
        message: `${input.code} 尚无 ALFRED 官方版本历史。`,
      });
    }
  }
  const expectedAlfredInputs = options.coverage.inputs.filter((row) => row.alfredEligible).length;
  if (options.coverage.alfredInputs < expectedAlfredInputs) {
    alerts.push({
      key: "vintage-alfred-coverage",
      severity: "warning",
      message: `ALFRED 覆盖 ${options.coverage.alfredInputs}/${expectedAlfredInputs} 个预测输入。`,
    });
  }
  if (options.driftDetected) {
    alerts.push({
      key: "signal-hash-drift",
      severity: "critical",
      message: "相同 signalDate × modelVersion 重算哈希与冻结值不同；旧信号未被覆盖。",
    });
  }
  if (options.pendingMaturedForecasts > 0) {
    alerts.push({
      key: "matured-price-missing",
      severity: "critical",
      message: `${options.pendingMaturedForecasts} 条已到期预测仍未完成价格结算。`,
    });
  }
  return alerts;
}

async function pendingMaturedForecastCount(now: Date): Promise<number> {
  return prisma.sectorRegimeForecast.count({
    where: {
      evaluatedAt: null,
      targetDate: { lte: new Date(`${isoDay(now)}T00:00:00.000Z`) },
    },
  });
}

async function notifyStageHAlerts(options: {
  alerts: readonly SectorRegimeStageHAlert[];
  state: SectorRegimeStageHState;
  now: Date;
  dryRun?: boolean;
  force?: boolean;
}): Promise<{
  notified: SectorRegimeStageHAlert[];
  suppressed: number;
  result: OperationalNotifyResult | null;
  state: SectorRegimeStageHState;
}> {
  const lastAlertAt = options.state.lastAlertAt
    ? new Date(options.state.lastAlertAt).getTime()
    : 0;
  const withinCooldown = lastAlertAt > 0
    && options.now.getTime() - lastAlertAt < alertCooldownHours() * 3_600_000;
  const notified = options.alerts.filter((alert) =>
    options.force
    || !withinCooldown
    || options.state.alertFingerprints[alert.key] !== fingerprint(alert));
  const suppressed = options.alerts.length - notified.length;
  if (options.dryRun || notified.length === 0) {
    return { notified, suppressed, result: null, state: options.state };
  }
  const result = await sendOperationalAlerts({
    type: "sector_regime_stage_h_alert",
    title: "行业 Regime 前瞻账本运维告警",
    alerts: notified,
    at: options.now,
  });
  const state = {
    ...options.state,
    lastAlertAt: options.now.toISOString(),
    alertFingerprints: { ...options.state.alertFingerprints },
  };
  for (const alert of notified) state.alertFingerprints[alert.key] = fingerprint(alert);
  await writeSectorRegimeStageHState(state);
  return { notified, suppressed, result, state };
}

export type MonitorSectorRegimeStageHResult = {
  checkedAt: string;
  alerts: SectorRegimeStageHAlert[];
  notified: SectorRegimeStageHAlert[];
  suppressed: number;
  notifyResult: OperationalNotifyResult | null;
  coverage: RegimeMacroVintageCoverage;
  pendingMaturedForecasts: number;
  state: SectorRegimeStageHState;
};

export async function monitorSectorRegimeStageH(options: {
  now?: Date;
  dryRun?: boolean;
  force?: boolean;
  driftDetected?: boolean;
} = {}): Promise<MonitorSectorRegimeStageHResult> {
  const now = options.now ?? new Date();
  const [state, coverage, pendingMaturedForecasts] = await Promise.all([
    readSectorRegimeStageHState(),
    getRegimeMacroVintageCoverage(),
    pendingMaturedForecastCount(now),
  ]);
  const monitoredState = { ...state, lastMonitorAt: now.toISOString() };
  await writeSectorRegimeStageHState(monitoredState);
  const alerts = buildSectorRegimeStageHAlerts({
    now,
    state: monitoredState,
    coverage,
    pendingMaturedForecasts,
    driftDetected: options.driftDetected,
  });
  const notification = await notifyStageHAlerts({
    alerts,
    state: monitoredState,
    now,
    dryRun: options.dryRun,
    force: options.force,
  });
  return {
    checkedAt: now.toISOString(),
    alerts,
    notified: notification.notified,
    suppressed: notification.suppressed,
    notifyResult: notification.result,
    coverage,
    pendingMaturedForecasts,
    state: notification.state,
  };
}

export type RunSectorRegimeStageHResult = {
  startedAt: string;
  completedAt: string;
  vintage: SyncFredMacroVintagesResult;
  bootstrap: BootstrapRegimeCurrentVintagesResult;
  frozen: FreezeSectorRegimeSignalResult;
  evaluated: EvaluateSectorRegimeSignalsResult;
  monitor: MonitorSectorRegimeStageHResult;
};

export async function runSectorRegimeStageH(options: {
  now?: Date;
  vintageLookbackDays?: number;
  dryRunAlerts?: boolean;
  forceAlerts?: boolean;
} = {}): Promise<RunSectorRegimeStageHResult> {
  const now = options.now ?? new Date();
  const startedAt = now.toISOString();
  const previous = await readSectorRegimeStageHState();
  await writeSectorRegimeStageHState({
    ...previous,
    protocolVersion: SECTOR_REGIME_STAGE_H_VERSION,
    lastStartedAt: startedAt,
    lastStatus: "running",
    lastError: null,
  });
  try {
    const lookback = Math.max(1, options.vintageLookbackDays ?? DEFAULT_VINTAGE_LOOKBACK_DAYS);
    const vintage = await syncRegimeMacroVintages({
      realtimeStart: isoDay(daysBefore(now, lookback)),
      realtimeEnd: FRED_REALTIME_MAX,
    });
    const bootstrap = await bootstrapRegimeCurrentVintages({ capturedAt: now });
    const frozen = await freezeCurrentSectorRegimeSignal({ now });
    const evaluated = await evaluateMaturedSectorRegimeSignals({ now });
    const [coverage, pendingMaturedForecasts] = await Promise.all([
      getRegimeMacroVintageCoverage(),
      pendingMaturedForecastCount(now),
    ]);
    const completedAt = new Date().toISOString();
    const latestState = await readSectorRegimeStageHState();
    await writeSectorRegimeStageHState({
      ...latestState,
      lastCompletedAt: completedAt,
      lastSuccessAt: completedAt,
      lastStatus: "success",
      lastError: null,
      lastRun: { vintage, bootstrap, frozen, evaluated, coverage, pendingMaturedForecasts },
    });
    const monitor = await monitorSectorRegimeStageH({
      now: new Date(completedAt),
      dryRun: options.dryRunAlerts,
      force: options.forceAlerts,
      driftDetected: frozen.driftDetected,
    });
    return { startedAt, completedAt, vintage, bootstrap, frozen, evaluated, monitor };
  } catch (error) {
    const failedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    const latestState = await readSectorRegimeStageHState();
    const failedState: SectorRegimeStageHState = {
      ...latestState,
      lastCompletedAt: failedAt.toISOString(),
      lastStatus: "failed",
      lastError: message,
    };
    await writeSectorRegimeStageHState(failedState);
    if (!options.dryRunAlerts) {
      await notifyStageHAlerts({
        alerts: [{ key: "task-run-failed", severity: "critical", message }],
        state: failedState,
        now: failedAt,
        force: options.forceAlerts,
      });
    }
    throw error;
  }
}

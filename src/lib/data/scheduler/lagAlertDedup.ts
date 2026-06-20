import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { LagAlertRow } from "./lagAlerts";

const STATE_FILE = path.join(process.cwd(), ".data", "lag-alert-state.json");

type AlertStateFile = {
  lastSentAt: string | null;
  fingerprints: Record<string, string>;
};

function cooldownHours(): number {
  const n = Number(process.env.DATA_LAG_ALERT_COOLDOWN_HOURS?.trim() || "24");
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function fingerprint(row: LagAlertRow): string {
  return crypto
    .createHash("sha256")
    .update(`${row.instrumentCode}|${row.reason}|${row.sourceLagDays ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

async function readState(): Promise<AlertStateFile> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(raw) as AlertStateFile;
  } catch {
    return { lastSentAt: null, fingerprints: {} };
  }
}

async function writeState(state: AlertStateFile): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** 过滤已通知且仍在冷却期内的告警；force 时跳过去重 */
export async function filterAlertsForNotify(
  alerts: LagAlertRow[],
  options?: { force?: boolean },
): Promise<{ toNotify: LagAlertRow[]; suppressed: number }> {
  if (options?.force || alerts.length === 0) {
    return { toNotify: alerts, suppressed: 0 };
  }

  const state = await readState();
  const cooldownMs = cooldownHours() * 3_600_000;
  const lastSent = state.lastSentAt ? new Date(state.lastSentAt).getTime() : 0;
  const withinCooldown = lastSent > 0 && Date.now() - lastSent < cooldownMs;

  const toNotify: LagAlertRow[] = [];
  let suppressed = 0;

  for (const row of alerts) {
    const fp = fingerprint(row);
    if (withinCooldown && state.fingerprints[row.instrumentCode] === fp) {
      suppressed++;
      continue;
    }
    toNotify.push(row);
  }

  return { toNotify, suppressed };
}

export async function markAlertsNotified(alerts: LagAlertRow[]): Promise<void> {
  if (alerts.length === 0) return;
  const state = await readState();
  state.lastSentAt = new Date().toISOString();
  for (const row of alerts) {
    state.fingerprints[row.instrumentCode] = fingerprint(row);
  }
  await writeState(state);
}

export function lagAlertCooldownHours(): number {
  return cooldownHours();
}

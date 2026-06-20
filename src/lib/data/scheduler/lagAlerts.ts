import type { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { sendDataLagAlertEmail } from "@/lib/mail";
import { filterAlertsForNotify, markAlertsNotified } from "./lagAlertDedup";
import { postSlackWebhook, resolveSlackWebhookUrl } from "./slackNotify";

export type LagAlertRow = {
  instrumentCode: string;
  instrumentName: string;
  sourceId: string;
  sourceLagDays: number | null;
  lastObsDate: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  reason: string;
};

export type LagAlertResult = {
  thresholdDays: number;
  alerts: LagAlertRow[];
  toNotify: LagAlertRow[];
  suppressed: number;
  emailSent: boolean;
  webhookSent: boolean;
  slackSent: boolean;
  webhookError?: string;
  slackError?: string;
};

const OUTBOX = path.join(process.cwd(), ".data", "lag-alert-outbox.log");

function lagThresholdDays(): number {
  const n = Number(process.env.DATA_LAG_DAYS_THRESHOLD?.trim() || "14");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
}

function staleDaysSince(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const t = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export async function collectLagAlerts(
  prisma: PrismaClient,
  thresholdDays = lagThresholdDays(),
): Promise<LagAlertRow[]> {
  const subs = await prisma.dataSubscription.findMany({
    where: { enabled: true },
    include: {
      instrument: { select: { code: true, name: true } },
    },
    take: 500,
  });

  const alerts: LagAlertRow[] = [];
  for (const sub of subs) {
    if (sub.sourceId === "legacy-m") continue;

    const lastRun = await prisma.fetchRun.findFirst({
      where: { subscriptionId: sub.id },
      orderBy: { startedAt: "desc" },
      select: { sourceLagDays: true, status: true, error: true },
    });

    const lag = lastRun?.sourceLagDays ?? null;
    const successStale = staleDaysSince(sub.lastSuccessAt);
    const reasons: string[] = [];

    if (lag != null && lag >= thresholdDays) {
      reasons.push(`源端滞后 ${lag} 天`);
    }
    if (sub.lastError) {
      reasons.push(`最近错误：${sub.lastError.slice(0, 120)}`);
    }
    if (successStale != null && successStale >= thresholdDays * 2) {
      reasons.push(`${successStale} 天未成功拉取`);
    }

    if (reasons.length === 0) continue;

    alerts.push({
      instrumentCode: sub.instrument.code,
      instrumentName: sub.instrument.name,
      sourceId: sub.sourceId,
      sourceLagDays: lag,
      lastObsDate: sub.lastObsDate?.toISOString().slice(0, 10) ?? null,
      lastSuccessAt: sub.lastSuccessAt?.toISOString() ?? null,
      lastError: sub.lastError,
      reason: reasons.join("；"),
    });
  }

  return alerts.sort((a, b) => (b.sourceLagDays ?? 0) - (a.sourceLagDays ?? 0));
}

async function appendOutbox(text: string) {
  await fs.mkdir(path.dirname(OUTBOX), { recursive: true });
  await fs.appendFile(OUTBOX, `${new Date().toISOString()} ${text}\n`, "utf8");
}

async function postGenericWebhook(
  alerts: LagAlertRow[],
): Promise<{ sent: boolean; error?: string }> {
  const url = process.env.DATA_LAG_WEBHOOK_URL?.trim();
  if (!url || url.includes("hooks.slack.com")) return { sent: false };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "data_lag_alert",
        at: new Date().toISOString(),
        count: alerts.length,
        alerts: alerts.slice(0, 50),
      }),
    });
    if (!res.ok) {
      return { sent: false, error: `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runLagAlerts(
  prisma: PrismaClient,
  options?: { dryRun?: boolean; thresholdDays?: number; force?: boolean },
): Promise<LagAlertResult> {
  const thresholdDays = options?.thresholdDays ?? lagThresholdDays();
  const alerts = await collectLagAlerts(prisma, thresholdDays);
  const { toNotify, suppressed } = await filterAlertsForNotify(alerts, {
    force: options?.force,
  });

  if (options?.dryRun || toNotify.length === 0) {
    return {
      thresholdDays,
      alerts,
      toNotify,
      suppressed,
      emailSent: false,
      webhookSent: false,
      slackSent: false,
    };
  }

  const to = process.env.DATA_LAG_ALERT_EMAIL?.trim();
  let emailSent = false;
  if (to) {
    const mail = await sendDataLagAlertEmail(to, toNotify, thresholdDays);
    emailSent = mail.delivered;
    if (mail.fallback) {
      await appendOutbox(`email fallback count=${toNotify.length} to=${to}`);
    }
  } else {
    await appendOutbox(`no email configured count=${toNotify.length}`);
  }

  const webhook = await postGenericWebhook(toNotify);
  if (webhook.error) {
    await appendOutbox(`webhook error: ${webhook.error}`);
  }

  const slackUrl = resolveSlackWebhookUrl();
  let slackSent = false;
  let slackError: string | undefined;
  if (slackUrl) {
    const slack = await postSlackWebhook(slackUrl, toNotify, thresholdDays);
    slackSent = slack.sent;
    slackError = slack.error;
    if (slack.error) await appendOutbox(`slack error: ${slack.error}`);
  }

  await markAlertsNotified(toNotify);

  return {
    thresholdDays,
    alerts,
    toNotify,
    suppressed,
    emailSent,
    webhookSent: webhook.sent,
    slackSent,
    webhookError: webhook.error,
    slackError,
  };
}

import type { LagAlertRow } from "./lagAlerts";

export function buildSlackLagPayload(
  alerts: LagAlertRow[],
  thresholdDays: number,
): { text: string; blocks: object[] } {
  const lines = alerts.slice(0, 15).map(
    (a) =>
      `• \`${a.instrumentCode}\` (${a.sourceId}) lag=${a.sourceLagDays ?? "?"}d — ${a.reason}`,
  );
  const text = `[finance-site] 数据滞后告警 ${alerts.length} 条（阈值 ${thresholdDays} 天）`;
  return {
    text,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${text}*` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") || "_无详情_" },
      },
    ],
  };
}

export async function postSlackWebhook(
  url: string,
  alerts: LagAlertRow[],
  thresholdDays: number,
): Promise<{ sent: boolean; error?: string }> {
  try {
    const body = buildSlackLagPayload(alerts, thresholdDays);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { sent: false, error: `HTTP ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function resolveSlackWebhookUrl(): string | null {
  const dedicated = process.env.DATA_LAG_SLACK_WEBHOOK_URL?.trim();
  if (dedicated) return dedicated;
  const generic = process.env.DATA_LAG_WEBHOOK_URL?.trim();
  if (generic?.includes("hooks.slack.com")) return generic;
  return null;
}

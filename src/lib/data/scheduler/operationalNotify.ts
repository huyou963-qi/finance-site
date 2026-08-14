import fs from "node:fs/promises";
import path from "node:path";
import { postSlackPayload, resolveSlackWebhookUrl } from "./slackNotify";

export type OperationalAlertItem = {
  key: string;
  severity: "warning" | "critical";
  message: string;
};

export type OperationalNotifyResult = {
  slackSent: boolean;
  webhookSent: boolean;
  outboxWritten: boolean;
  errors: string[];
};

const OUTBOX = path.join(process.cwd(), ".data", "operational-alert-outbox.log");

async function appendOutbox(payload: object): Promise<void> {
  await fs.mkdir(path.dirname(OUTBOX), { recursive: true });
  await fs.appendFile(
    OUTBOX,
    `${new Date().toISOString()} ${JSON.stringify(payload)}\n`,
    "utf8",
  );
}

/** 复用数据调度器现有 webhook 配置发送非“数据滞后”类运维告警。 */
export async function sendOperationalAlerts(options: {
  type: string;
  title: string;
  alerts: readonly OperationalAlertItem[];
  at?: Date;
}): Promise<OperationalNotifyResult> {
  const at = (options.at ?? new Date()).toISOString();
  const payload = {
    type: options.type,
    at,
    count: options.alerts.length,
    alerts: options.alerts,
  };
  const errors: string[] = [];
  let slackSent = false;
  let webhookSent = false;

  const slackUrl = resolveSlackWebhookUrl();
  if (slackUrl) {
    const lines = options.alerts.slice(0, 20).map(
      (row) => `• *${row.severity.toUpperCase()}* \`${row.key}\` — ${row.message}`,
    );
    const result = await postSlackPayload(slackUrl, {
      text: `[finance-site] ${options.title}（${options.alerts.length}）`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `*[finance-site] ${options.title}*` } },
        { type: "section", text: { type: "mrkdwn", text: lines.join("\n") || "_无详情_" } },
      ],
    });
    slackSent = result.sent;
    if (result.error) errors.push(`slack: ${result.error}`);
  }

  const genericUrl = process.env.DATA_LAG_WEBHOOK_URL?.trim();
  if (genericUrl && !genericUrl.includes("hooks.slack.com")) {
    try {
      const response = await fetch(genericUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      webhookSent = response.ok;
      if (!response.ok) errors.push(`webhook: HTTP ${response.status}`);
    } catch (error) {
      errors.push(`webhook: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const outboxWritten = (!slackSent && !webhookSent) || errors.length > 0;
  if (outboxWritten) await appendOutbox({ title: options.title, ...payload, errors });
  return { slackSent, webhookSent, outboxWritten, errors };
}

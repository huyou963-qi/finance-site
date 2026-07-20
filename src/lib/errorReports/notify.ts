import { sendErrorReportEmail } from "@/lib/mail";
import { resolveSlackWebhookUrl } from "@/lib/data/scheduler/slackNotify";
import { shouldSkipAlert } from "@/lib/errorReports/rateLimit";
import type { ErrorReportSource } from "@/lib/errorReports/types";
import { ERROR_REPORT_SOURCE_LABELS } from "@/lib/errorReports/types";

function resolveAlertEmail(): string | null {
  return (
    process.env.ERROR_REPORT_ALERT_EMAIL?.trim() ||
    process.env.DATA_LAG_ALERT_EMAIL?.trim() ||
    null
  );
}

function resolveErrorSlackUrl(): string | null {
  const dedicated = process.env.ERROR_REPORT_SLACK_WEBHOOK_URL?.trim();
  if (dedicated) return dedicated;
  return resolveSlackWebhookUrl();
}

function alertCooldownMs(): number {
  const mins = Number(process.env.ERROR_REPORT_ALERT_COOLDOWN_MINUTES?.trim() || "30");
  return Math.max(1, Number.isFinite(mins) ? mins : 30) * 60_000;
}

async function postSlackErrorReport(
  url: string,
  report: {
    id: string;
    source: ErrorReportSource;
    message: string;
    pageUrl: string;
    username?: string | null;
  },
): Promise<{ sent: boolean; error?: string }> {
  const label = ERROR_REPORT_SOURCE_LABELS[report.source] ?? report.source;
  const text = `[finance-site] 错误反馈 · ${label}`;
  const body = {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*${text}*`,
            `• id: \`${report.id}\``,
            `• 页面: ${report.pageUrl}`,
            `• 用户: ${report.username || "（匿名）"}`,
            `• 消息: ${report.message.slice(0, 300)}`,
          ].join("\n"),
        },
      },
    ],
  };
  try {
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

/** 入库后通知维护人员；失败不影响主流程。同指纹有冷却。 */
export async function notifyErrorReport(report: {
  id: string;
  source: ErrorReportSource;
  message: string;
  pageUrl: string;
  username?: string | null;
  digest?: string | null;
}): Promise<void> {
  const fingerprint = [
    report.source,
    report.digest || "",
    report.message.slice(0, 200),
    report.pageUrl.slice(0, 200),
  ].join("|");
  if (shouldSkipAlert(fingerprint, alertCooldownMs())) return;

  const email = resolveAlertEmail();
  if (email) {
    try {
      await sendErrorReportEmail(email, report);
    } catch (e) {
      console.error("[error-report] email failed", e);
    }
  }

  const slackUrl = resolveErrorSlackUrl();
  if (slackUrl) {
    const result = await postSlackErrorReport(slackUrl, report);
    if (!result.sent) {
      console.error("[error-report] slack failed", result.error);
    }
  }
}

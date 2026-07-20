import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

const DATA_DIR = path.join(process.cwd(), ".data");
const OUTBOX_FILE = path.join(DATA_DIR, "mail-outbox.log");

function getBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    "http://localhost:3000"
  );
}

export function buildVerifyUrl(token: string): string {
  const base = getBaseUrl().replace(/\/+$/, "");
  return `${base}/auth/verify?token=${encodeURIComponent(token)}`;
}

async function appendOutbox(text: string) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(OUTBOX_FILE, `${new Date().toISOString()} ${text}\n`, "utf8");
}

export async function sendRegisterVerifyEmail(to: string, verifyUrl: string) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "no-reply@localhost";
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const secure = (process.env.SMTP_SECURE?.trim() || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    await appendOutbox(`[MAIL_FALLBACK] to=${to} verify=${verifyUrl}`);
    return { delivered: false as const, fallback: true as const };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  await transport.sendMail({
    from,
    to,
    subject: "请确认你的注册邮箱",
    text: `请点击以下链接完成注册（30 分钟内有效）：\n${verifyUrl}`,
    html: `<p>请点击以下链接完成注册（30 分钟内有效）：</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });
  return { delivered: true as const, fallback: false as const };
}

export async function sendDataLagAlertEmail(
  to: string,
  alerts: Array<{
    instrumentCode: string;
    instrumentName: string;
    sourceId: string;
    reason: string;
    sourceLagDays: number | null;
  }>,
  thresholdDays: number,
) {
  const lines = alerts
    .slice(0, 30)
    .map(
      (a) =>
        `- ${a.instrumentCode} (${a.sourceId}) lag=${a.sourceLagDays ?? "?"}d · ${a.reason}`,
    )
    .join("\n");
  const subject = `[finance-site] 数据滞后告警 ${alerts.length} 条（阈值 ${thresholdDays} 天）`;
  const text = `以下订阅触发滞后/失败告警（阈值 ${thresholdDays} 天）：\n\n${lines}\n`;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "no-reply@localhost";
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const secure = (process.env.SMTP_SECURE?.trim() || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    await appendOutbox(`[LAG_ALERT] to=${to} count=${alerts.length}\n${text}`);
    return { delivered: false as const, fallback: true as const };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  await transport.sendMail({ from, to, subject, text });
  return { delivered: true as const, fallback: false as const };
}

export async function sendErrorReportEmail(
  to: string,
  report: {
    id: string;
    source: string;
    message: string;
    pageUrl: string;
    username?: string | null;
    digest?: string | null;
  },
) {
  const subject = `[finance-site] 错误反馈 ${report.source} · ${report.message.slice(0, 60)}`;
  const text = [
    `新错误反馈已入库：`,
    ``,
    `id: ${report.id}`,
    `来源: ${report.source}`,
    `页面: ${report.pageUrl}`,
    `用户: ${report.username || "（匿名）"}`,
    `digest: ${report.digest || "—"}`,
    `消息: ${report.message}`,
    ``,
    `管理端：${getBaseUrl().replace(/\/+$/, "")}/admin/error-reports`,
  ].join("\n");

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || "no-reply@localhost";
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  const secure = (process.env.SMTP_SECURE?.trim() || "false").toLowerCase() === "true";

  if (!host || !user || !pass) {
    await appendOutbox(`[ERROR_REPORT] to=${to}\n${text}`);
    return { delivered: false as const, fallback: true as const };
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  await transport.sendMail({ from, to, subject, text });
  return { delivered: true as const, fallback: false as const };
}

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

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function keyHash(identifier: string): string {
  return crypto.createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
}

export async function checkLoginThrottle(identifier: string): Promise<void> {
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    await prisma.authAttempt.deleteMany({ where: { windowStart: { lt: cutoff } } });
  }
  const record = await prisma.authAttempt.findUnique({ where: { keyHash: keyHash(identifier) } });
  if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    throw new Error("登录尝试过于频繁，请稍后重试或通过邮箱重置密码");
  }
}

export async function recordLoginFailure(identifier: string): Promise<void> {
  const key = keyHash(identifier);
  const now = new Date();
  const record = await prisma.authAttempt.findUnique({ where: { keyHash: key } });
  if (!record || now.getTime() - record.windowStart.getTime() > WINDOW_MS) {
    await prisma.authAttempt.upsert({
      where: { keyHash: key },
      create: { keyHash: key, attempts: 1, windowStart: now },
      update: { attempts: 1, windowStart: now, lockedUntil: null },
    });
    return;
  }
  const attempts = record.attempts + 1;
  await prisma.authAttempt.update({
    where: { keyHash: key },
    data: { attempts: { increment: 1 }, lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + WINDOW_MS) : null },
  });
}

export async function clearLoginFailures(identifier: string): Promise<void> {
  await prisma.authAttempt.deleteMany({ where: { keyHash: keyHash(identifier) } });
}

import { TRIAL_DAYS } from "@/lib/billing/pricing";

/** 游客首次访问起算的免费体验天数（与注册 Pro 试用天数一致）。 */
export const GUEST_TRIAL_DAYS = TRIAL_DAYS;

/** 首次访问时间戳 cookie；HttpOnly，由 middleware 写入。 */
export const GUEST_TRIAL_COOKIE = "finance_guest_started";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = 400 * MS_PER_DAY / 1000;

/** 解析首次访问时刻；非法或缺失返回 null。 */
export function parseGuestStartedAt(raw: string | undefined | null, now = Date.now()): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0 || n > now + MS_PER_DAY) return null;
  return Math.floor(n);
}

/** 游客免费体验是否已结束（仅对未登录访问者有意义）。 */
export function isGuestTrialExpired(startedAt: number | null, now = Date.now()): boolean {
  if (startedAt == null) return false;
  return now - startedAt >= GUEST_TRIAL_DAYS * MS_PER_DAY;
}

export function guestTrialCookieOptions(secure: boolean): {
  path: string;
  httpOnly: boolean;
  sameSite: "lax";
  maxAge: number;
  secure: boolean;
} {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    secure,
  };
}

/** middleware 写入用的起始时间戳（毫秒 epoch 字符串）。 */
export function newGuestStartedValue(now = Date.now()): string {
  return String(now);
}

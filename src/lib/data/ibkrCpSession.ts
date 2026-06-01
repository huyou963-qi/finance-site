import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** 存 Gateway 会话 Cookie 的本地文件（默认 `.data/ibkr-cp-cookie.txt`，目录已 .gitignore） */
export function ibkrCpCookieFilePath(): string {
  const custom = process.env.IBKR_CP_COOKIE_FILE?.trim();
  if (custom) return custom;
  return join(process.cwd(), ".data", "ibkr-cp-cookie.txt");
}

/**
 * 读取用于 Client Portal 请求的 Cookie：
 * 1) 环境变量 `IBKR_CP_COOKIE`（若设置则优先）
 * 2) 否则读 `IBKR_CP_COOKIE_FILE` 或默认 `.data/ibkr-cp-cookie.txt`
 */
export function readIbkrCpCookie(): string | undefined {
  const fromEnv = process.env.IBKR_CP_COOKIE?.trim();
  if (fromEnv) return fromEnv;
  const fp = ibkrCpCookieFilePath();
  try {
    if (!existsSync(fp)) return undefined;
    const t = readFileSync(fp, "utf8").trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

export function writeIbkrCpCookie(cookie: string): void {
  const fp = ibkrCpCookieFilePath();
  const dir = dirname(fp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(fp, cookie.trim(), "utf8");
}

import fs from "node:fs";
import {
  ENGLISH_MONTH_SLUGS,
  ISM_OFFICIAL_CALENDAR_URL,
  ismOfficialReportUrl,
  type IsmOfficialReportKind,
} from "./catalog";
import { isIsmReportUnavailable } from "./parseReport";

const CACHE_MS = 60_000;
const cache = new Map<string, { html: string; at: number }>();

export type IsmOfficialFetchFailureKind = "network" | "access" | "http" | "content";

export class IsmOfficialFetchError extends Error {
  readonly failureKind: IsmOfficialFetchFailureKind;

  constructor(message: string, failureKind: IsmOfficialFetchFailureKind, cause?: unknown) {
    super(message);
    this.name = "IsmOfficialFetchError";
    this.failureKind = failureKind;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function looksLikeCaptchaInterstitial(html: string): boolean {
  return /grecaptcha|captcha_form|recaptcha\/api\.js/i.test(html);
}

function defaultHeaders(): Record<string, string> {
  return {
    "User-Agent":
      process.env.ISM_USER_AGENT?.trim() ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function formatFetchCause(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeText =
    cause instanceof Error
      ? [
          (cause as Error & { code?: string }).code,
          cause.message,
        ]
          .filter(Boolean)
          .join(" ")
      : cause == null
        ? ""
        : String(cause);
  return [err.message, causeText].filter(Boolean).join("；cause=");
}

function isSsoRedirect(location: string): boolean {
  return /ecommerce\.ismworld\.org\/SSO\/Login\.aspx|\/captcha_resp/i.test(location);
}

function redirectForLog(location: string): string {
  try {
    const parsed = new URL(location);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return location.split("?", 1)[0] ?? location;
  }
}

export async function fetchIsmOfficialHtml(url: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.at < CACHE_MS) return hit.html;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: defaultHeaders(),
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new IsmOfficialFetchError(
      `ISM 官网网络请求失败：${url}（${formatFetchCause(err)}）`,
      "network",
      err,
    );
  }
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") ?? "";
    if (isSsoRedirect(location)) {
      throw new IsmOfficialFetchError(
        `ISM 官网 HTTP ${res.status} 跳转到 SSO/reCAPTCHA 登录检查：${redirectForLog(location)}`,
        "access",
      );
    }
    throw new IsmOfficialFetchError(
      `ISM 官网 HTTP ${res.status} 重定向：${url}${location ? ` -> ${redirectForLog(location)}` : ""}`,
      "http",
    );
  }
  if (!res.ok) {
    throw new IsmOfficialFetchError(`ISM 官网 HTTP ${res.status}: ${url}`, "http");
  }
  const html = await res.text();
  if (looksLikeCaptchaInterstitial(html)) {
    throw new IsmOfficialFetchError(
      `ISM 官网对自动化请求返回 reCAPTCHA 拦截页：${url}（不绕过验证码；数值将回退 TE）`,
      "access",
    );
  }
  if (html.length < 2000 && !isIsmReportUnavailable(html)) {
    throw new IsmOfficialFetchError(
      `ISM 官网返回过短 HTML (${html.length} bytes)，可能是跳转/拦截页：${url}`,
      "content",
    );
  }
  cache.set(url, { html, at: now });
  return html;
}

export async function loadIsmOfficialHtml(options: {
  url: string;
  fixturePath?: string;
}): Promise<string> {
  const fixture = options.fixturePath?.trim();
  if (fixture && fs.existsSync(fixture)) {
    return fs.readFileSync(fixture, "utf8");
  }
  return fetchIsmOfficialHtml(options.url);
}

export async function loadIsmOfficialCalendarHtml(options?: {
  fixturePath?: string;
  url?: string;
}): Promise<string> {
  return loadIsmOfficialHtml({
    url: options?.url ?? ISM_OFFICIAL_CALENDAR_URL,
    fixturePath: options?.fixturePath,
  });
}

/** 从当前月往回数 4 个英文月份 slug（官网 URL 无年份） */
export function candidateMonthSlugs(from: Date = new Date()): string[] {
  const slugs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    slugs.push(ENGLISH_MONTH_SLUGS[d.getUTCMonth()]!);
  }
  return slugs;
}

export async function loadLatestIsmOfficialReportHtml(
  kind: IsmOfficialReportKind,
  options?: { fixturePath?: string; monthSlugs?: string[] },
): Promise<{ html: string; url: string; monthSlug: string }> {
  if (options?.fixturePath) {
    const html = await loadIsmOfficialHtml({
      url: ismOfficialReportUrl(kind, "fixture"),
      fixturePath: options.fixturePath,
    });
    return { html, url: options.fixturePath, monthSlug: "fixture" };
  }

  const slugs = options?.monthSlugs ?? candidateMonthSlugs();
  const errors: string[] = [];
  for (const slug of slugs) {
    const url = ismOfficialReportUrl(kind, slug);
    try {
      const html = await fetchIsmOfficialHtml(url);
      if (isIsmReportUnavailable(html)) {
        errors.push(`${slug}: unavailable`);
        continue;
      }
      return { html, url, monthSlug: slug };
    } catch (err) {
      errors.push(`${slug}: ${err instanceof Error ? err.message : String(err)}`);
      if (
        err instanceof IsmOfficialFetchError &&
        (err.failureKind === "network" || err.failureKind === "access")
      ) {
        break;
      }
    }
  }
  throw new Error(
    `ISM 官网 ${kind} 报告：最近月份均未取到可用页（${errors.join("; ")}）`,
  );
}

export function clearIsmOfficialHtmlCache(): void {
  cache.clear();
}

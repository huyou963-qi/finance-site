/**
 * 百度搜索资源平台「普通收录 · API 提交」：
 * POST http://data.zz.baidu.com/urls?site=<站点>&token=<准入密钥>，body 为每行一个 URL。
 * 未配置 BAIDU_PUSH_TOKEN 或站点地址为 localhost 时整体跳过（返回 null）。
 */

import { absoluteUrl, getSiteUrl, isLocalSiteUrl } from "./siteUrl";

const ENDPOINT = "http://data.zz.baidu.com/urls";
const MAX_URLS_PER_REQUEST = 2000;

export type BaiduPushResult = {
  success: number;
  /** 当天剩余配额（百度返回） */
  remain: number | null;
  notSameSite: string[];
  notValid: string[];
  errors: string[];
};

type BaiduRawResponse = {
  success?: number;
  remain?: number;
  not_same_site?: string[];
  not_valid?: string[];
  error?: number;
  message?: string;
};

export function baiduPushEndpoint(site: string, token: string): string {
  return `${ENDPOINT}?site=${encodeURIComponent(site)}&token=${encodeURIComponent(token)}`;
}

export function chunkUrls(urls: readonly string[], size = MAX_URLS_PER_REQUEST): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < urls.length; i += size) out.push(urls.slice(i, i + size));
  return out;
}

export function emptyPushResult(): BaiduPushResult {
  return { success: 0, remain: null, notSameSite: [], notValid: [], errors: [] };
}

/** 合并单批响应；返回 false 表示应停止后续批次（配额耗尽/鉴权失败）。 */
export function applyBaiduResponse(
  acc: BaiduPushResult,
  httpStatus: number,
  body: BaiduRawResponse | null,
): boolean {
  if (httpStatus < 200 || httpStatus >= 300 || !body || body.error != null) {
    const message = body?.message ?? `HTTP ${httpStatus}`;
    acc.errors.push(message);
    return !/over quota|token is not valid|site error|site init fail/i.test(message);
  }
  acc.success += body.success ?? 0;
  if (typeof body.remain === "number") acc.remain = body.remain;
  acc.notSameSite.push(...(body.not_same_site ?? []));
  acc.notValid.push(...(body.not_valid ?? []));
  return true;
}

export async function pushUrlsToBaidu(urls: readonly string[]): Promise<BaiduPushResult | null> {
  const token = process.env.BAIDU_PUSH_TOKEN?.trim();
  const site = getSiteUrl();
  if (!token || isLocalSiteUrl(site) || urls.length === 0) return null;

  const result = emptyPushResult();
  for (const batch of chunkUrls([...new Set(urls)])) {
    try {
      const res = await fetch(baiduPushEndpoint(site, token), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: batch.join("\n"),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => null)) as BaiduRawResponse | null;
      if (!applyBaiduResponse(result, res.status, body)) break;
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return result;
}

/** 文章发布/更新后推送文章页与列表页（失败只记日志，不影响发布）。 */
export async function pushPublishedArticle(slug: string): Promise<void> {
  try {
    const result = await pushUrlsToBaidu([
      absoluteUrl(`/articles/${encodeURIComponent(slug)}`),
      absoluteUrl("/articles"),
    ]);
    if (result && result.errors.length > 0) {
      console.warn("[baidu-push] article push failed", slug, result.errors);
    }
  } catch (e) {
    console.error("[baidu-push] article push error", slug, e);
  }
}

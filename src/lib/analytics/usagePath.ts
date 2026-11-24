import { featureIdForPath } from "@/lib/access/featureCatalog";
import { splitLocalePath } from "@/i18n/locales";
import { isTrackedPath } from "@/lib/analytics/baiduTongji";
import { MAX_USAGE_PATH_LEN } from "@/lib/analytics/usageTypes";

/** 非文章详情的 /articles/* 子路径（列表、编辑器、预览等） */
const ARTICLE_RESERVED_SEGMENTS = new Set([
  "editor",
  "preview",
  "charts",
  "connections",
]);

/** 去掉语言前缀与 query/hash，截断长度，供埋点与 feature 映射。 */
export function normalizeUsagePath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cut = raw.search(/[?#]/);
  const withLocale = cut === -1 ? raw.trim() : raw.slice(0, cut).trim();
  if (!withLocale.startsWith("/")) return null;
  const bare = splitLocalePath(withLocale).pathname || "/";
  if (!isTrackedPath(bare)) return null;
  return bare.length > MAX_USAGE_PATH_LEN ? bare.slice(0, MAX_USAGE_PATH_LEN) : bare;
}

export function usageFeatureIdForPath(path: string): string | null {
  return featureIdForPath(path);
}

/** 校验已解析出的 slug 段（长度 / 字符集 / 保留名）。 */
export function normalizeArticleSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  if (ARTICLE_RESERVED_SEGMENTS.has(slug)) return null;
  if (slug.length > 128) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) return null;
  return slug;
}

/**
 * 专题文章详情页 slug：仅匹配 `/articles/{slug}` 单段路径，
 * 排除 editor / preview / charts / connections。
 */
export function extractArticleSlug(path: string): string | null {
  const match = /^\/articles\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  return normalizeArticleSlug(match[1]);
}

/** 优先用库内 articleSlug，不合法则回退从 path 提取。 */
export function resolveArticleSlug(
  articleSlug: string | null | undefined,
  path: string,
): string | null {
  return normalizeArticleSlug(articleSlug) ?? extractArticleSlug(path);
}

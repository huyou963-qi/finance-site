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

/**
 * 专题文章详情页 slug：仅匹配 `/articles/{slug}` 单段路径，
 * 排除 editor / preview / charts / connections。
 */
export function extractArticleSlug(path: string): string | null {
  const match = /^\/articles\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  const slug = match[1]!;
  if (ARTICLE_RESERVED_SEGMENTS.has(slug)) return null;
  if (slug.length > 128) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) return null;
  return slug;
}

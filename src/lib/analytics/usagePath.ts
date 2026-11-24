import { featureIdForPath } from "@/lib/access/featureCatalog";
import { splitLocalePath } from "@/i18n/locales";
import { isTrackedPath } from "@/lib/analytics/baiduTongji";
import { MAX_USAGE_PATH_LEN } from "@/lib/analytics/usageTypes";

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

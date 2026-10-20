import type { FetchIncrementalResult } from "../types";
import { fetchNbsGdpSeries } from "../nbsGdp/client";
import type { GdpFrequency, GdpSeries, GdpTransform } from "../nbsGdp/catalog";
import { fetchNbsReleaseArticle } from "../nbsPriceRelease/client";
import { mergeNewReleasePoint } from "../nbsPriceRelease/monthlyTable";
import { parseGdpCumulativeRelease } from "../nbsGdp/parseRelease";
function config(metadata: unknown) { const s = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null; if (!s || typeof s !== "object") throw new Error("国家数据 GDP 缺少 scrape 配置"); const x = s as Record<string, unknown>; if (typeof x.cid !== "string" || typeof x.indicatorId !== "string" || (x.frequency !== "quarterly" && x.frequency !== "annual")) throw new Error("国家数据 GDP scrape 配置不完整"); return { cid: x.cid, indicatorId: x.indicatorId, frequency: x.frequency as GdpFrequency, transform: (x.transform === "index_minus_100" ? x.transform : "none") as GdpTransform }; }
export async function fetchNbsGdpIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const c = config(metadata), start = new Date(`${obsStart}T00:00:00.000Z`);
  const supported = /^nbs_cn_gdp_q_(primary|secondary|tertiary)_(nomcum|reaccyoy)$/.test(code) && c.frequency === "quarterly";
  let nativeError: unknown;
  const native = await fetchNbsGdpSeries(c as GdpSeries, start.getUTCFullYear()).catch(error => {
    if (!supported) throw error;
    nativeError = error; return [];
  });
  const official = supported ? await fetchNbsReleaseArticle("GDP") : undefined;
  const release = official ? parseGdpCumulativeRelease(official.html).get(code) : undefined;
  if (nativeError && (!release || release.obsDate < start)) throw nativeError;
  const points = mergeNewReleasePoint(native, release);
  return { points: points.filter(x => x.obsDate >= start), sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0,
    ...(official ? { sourceMetadata: { officialReleaseUrl: official.articleUrl, releaseSupplementUsed: points.length > native.length, nativeApiUnavailable: Boolean(nativeError) } } : {}) };
}

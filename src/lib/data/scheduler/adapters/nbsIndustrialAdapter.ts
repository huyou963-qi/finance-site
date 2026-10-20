import type { FetchIncrementalResult } from "../types";
import { fetchLatestIndustrialMom, fetchNbsIndustrialSeries } from "../nbsIndustrial/client";
import { fetchNbsPriceWorkbook } from "../nbsPriceRelease/client";
import { mergeNewReleasePoint } from "../nbsPriceRelease/monthlyTable";
import { parseIndustrialRelease } from "../nbsIndustrial/parseRelease";
function config(metadata: unknown) { const s = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null; if (!s || typeof s !== "object") throw new Error("国家数据工业增加值缺少 scrape 配置"); const x = s as Record<string, unknown>; return { cid: x.cid, indicatorId: x.indicatorId, measure: x.measure }; }
export async function fetchNbsIndustrialIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const c = config(metadata);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  if (c.measure === "mom") {
    const latest = await fetchLatestIndustrialMom();
    return { points: latest.point.obsDate >= start ? [latest.point] : [], sourceLatestObsDate: latest.point.obsDate, skippedInvalid: 0 };
  }
  if (typeof c.cid !== "string" || typeof c.indicatorId !== "string") throw new Error("国家数据工业增加值 scrape 配置不完整");
  let nativeError: unknown;
  const native = await fetchNbsIndustrialSeries({ cid: c.cid, indicatorId: c.indicatorId }, start.getUTCFullYear()).catch(error => { nativeError = error; return []; });
  const official = await fetchNbsPriceWorkbook("INDUSTRIAL");
  const release = parseIndustrialRelease(official.workbook).get(code);
  if (nativeError && (!release || release.obsDate < start)) throw nativeError;
  const points = mergeNewReleasePoint(native, release);
  return { points: points.filter(x => x.obsDate >= start), sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0,
    sourceMetadata: { officialReleaseUrl: official.articleUrl, officialWorkbookUrl: official.workbookUrl, releaseSupplementUsed: points.length > native.length, nativeApiUnavailable: Boolean(nativeError) } };
}

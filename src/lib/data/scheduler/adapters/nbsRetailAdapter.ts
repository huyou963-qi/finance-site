import type { FetchIncrementalResult } from "../types";
import { fetchNbsRetailHistory } from "../nbsRetail/client";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import { nbsRetailMonthlyRange } from "../nbsRetail/catalog";
import { fetchNbsPriceWorkbook } from "../nbsPriceRelease/client";
import { mergeNewReleasePoint } from "../nbsPriceRelease/monthlyTable";
import { parseRetailRelease } from "../nbsRetail/parseRelease";

const API = "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData";
const ROOT = "fc982599aa684be7969d7b90b1bd0e84";

/** 汇总项走共享缓存；商品分类按 metadata 中的官方 cid/indicatorId 精确更新。 */
export async function fetchNbsRetailIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null;
  const cid = scrape && typeof scrape === "object" && typeof (scrape as Record<string, unknown>).cid === "string" ? (scrape as Record<string, unknown>).cid as string : null;
  const indicatorId = scrape && typeof scrape === "object" && typeof (scrape as Record<string, unknown>).indicatorId === "string" ? (scrape as Record<string, unknown>).indicatorId as string : null;
  const finish = async (native: import("../types").ObservationPoint[]): Promise<FetchIncrementalResult> => {
    const official = await fetchNbsPriceWorkbook("RETAIL");
    const release = parseRetailRelease(official.workbook, metadata, code);
    const points = mergeNewReleasePoint(native, release);
    return { points: points.filter(p => p.obsDate >= start), sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0,
      sourceMetadata: { officialReleaseUrl: official.articleUrl, officialWorkbookUrl: official.workbookUrl, releaseSupplementUsed: points.length > native.length } };
  };
  if (!cid || !indicatorId) {
    let nativeError: unknown;
    const points = await fetchNbsRetailHistory().then(result => result.points.get(code)).catch(error => { nativeError = error; return undefined; });
    if (points) return finish(points);
    const fallback = await finish([]);
    if (fallback.points.length) return fallback;
    throw nativeError ?? new Error(`国家数据社零未登记 ${code}`);
  }
  const startMonth = obsStart.slice(0, 7).replace("-", "");
  let nativeError: unknown;
  const response = await fetchChinaOfficial(API, { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" }, body: JSON.stringify({ cid, indicatorIds: [indicatorId], das: [{ text: "全国", value: "000000000000" }], dts: [nbsRetailMonthlyRange(startMonth)], showType: "1", rootId: ROOT }), signal: AbortSignal.timeout(90_000) }).catch(error => { nativeError = error; return null; });
  if (!response || !response.ok) {
    const fallback = await finish([]);
    if (fallback.points.length) return fallback;
    throw nativeError ?? new Error(`国家数据社零分类 HTTP ${response?.status}`);
  }
  if (!response.ok) throw new Error(`国家数据社零分类 HTTP ${response.status}`);
  const json = await response.json() as { data?: Array<{ code?: string; values?: Array<{ _id?: string; value?: string | number | null }> }> };
  const points = (json.data ?? []).flatMap(row => { const m = /^(\d{4})(\d{2})MM$/.exec(String(row.code ?? "")); const raw = row.values?.find(v => v._id === indicatorId)?.value; if (!m || raw == null || String(raw).trim() === "") return []; const value = Number(raw); return Number.isFinite(value) ? [{ obsDate: new Date(Date.UTC(+m[1], +m[2] - 1, 1)), value }] : []; });
  if (!points.length) {
    const fallback = await finish([]);
    if (fallback.points.length) return fallback;
    throw new Error(`国家数据社零分类无有效观测 ${code}`);
  }
  return finish(points);
}

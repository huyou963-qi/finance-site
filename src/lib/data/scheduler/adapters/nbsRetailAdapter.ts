import type { FetchIncrementalResult } from "../types";
import { fetchNbsRetailHistory } from "../nbsRetail/client";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import { nbsRetailMonthlyRange } from "../nbsRetail/catalog";

const API = "https://data.stats.gov.cn/dg/website/publicrelease/web/external/stream/esData";
const ROOT = "fc982599aa684be7969d7b90b1bd0e84";

/** 汇总项走共享缓存；商品分类按 metadata 中的官方 cid/indicatorId 精确更新。 */
export async function fetchNbsRetailIncremental(metadata: unknown, code: string, obsStart: string): Promise<FetchIncrementalResult> {
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null;
  const cid = scrape && typeof scrape === "object" && typeof (scrape as Record<string, unknown>).cid === "string" ? (scrape as Record<string, unknown>).cid as string : null;
  const indicatorId = scrape && typeof scrape === "object" && typeof (scrape as Record<string, unknown>).indicatorId === "string" ? (scrape as Record<string, unknown>).indicatorId as string : null;
  if (!cid || !indicatorId) { const result = await fetchNbsRetailHistory(); const points = result.points.get(code); if (!points) throw new Error(`国家数据社零未登记 ${code}`); return { points: points.filter(p => p.obsDate >= start), sourceLatestObsDate: result.latest, skippedInvalid: 0 }; }
  const startMonth = obsStart.slice(0, 7).replace("-", "");
  const response = await fetchChinaOfficial(API, { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" }, body: JSON.stringify({ cid, indicatorIds: [indicatorId], das: [{ text: "全国", value: "000000000000" }], dts: [nbsRetailMonthlyRange(startMonth)], showType: "1", rootId: ROOT }), signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`国家数据社零分类 HTTP ${response.status}`);
  const json = await response.json() as { data?: Array<{ code?: string; values?: Array<{ _id?: string; value?: string | number | null }> }> };
  const points = (json.data ?? []).flatMap(row => { const m = /^(\d{4})(\d{2})MM$/.exec(String(row.code ?? "")); const raw = row.values?.find(v => v._id === indicatorId)?.value; if (!m || raw == null || String(raw).trim() === "") return []; const value = Number(raw); return Number.isFinite(value) ? [{ obsDate: new Date(Date.UTC(+m[1], +m[2] - 1, 1)), value }] : []; });
  if (!points.length) throw new Error(`国家数据社零分类无有效观测 ${code}`);
  return { points: points.filter(p => p.obsDate >= start), sourceLatestObsDate: points.at(-1)!.obsDate, skippedInvalid: 0 };
}

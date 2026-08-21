import type { ObservationPoint } from "../types";
import { NBS_RETAIL_API, NBS_RETAIL_COMPONENTS, NBS_RETAIL_ROOT_ID, RETAIL_MEASURES, nbsRetailMonthlyRange, retailCode } from "./catalog";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
let cache: { at: number; points: Map<string, ObservationPoint[]>; latest: Date } | null = null;
export async function fetchNbsRetailHistory() {
  if (cache && Date.now() - cache.at < 300_000) return cache;
  const points = new Map<string, ObservationPoint[]>(); let latest = new Date(0);
  for (const component of NBS_RETAIL_COMPONENTS) {
    const ids = Object.values(component.ids);
    const response = await fetchChinaOfficial(NBS_RETAIL_API, { method: "POST", headers: { "Content-Type": "application/json", Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" }, body: JSON.stringify({ cid: component.cid, indicatorIds: ids, das: [{ text: "全国", value: "000000000000" }], dts: [nbsRetailMonthlyRange()], showType: "1", rootId: NBS_RETAIL_ROOT_ID }), signal: AbortSignal.timeout(90_000) });
    if (!response.ok) throw new Error(`国家数据社零 HTTP ${response.status}: ${component.label}`);
    const payload = await response.json() as { data?: Array<{ code?: string; values?: Array<{ _id?: string; value?: string | number | null }> }> };
    const measureById = new Map(RETAIL_MEASURES.map(m => [component.ids[m.key], m.key]));
    for (const period of payload.data ?? []) {
      const match = /^(\d{4})(\d{2})MM$/.exec(String(period.code ?? "")); if (!match) continue;
      const obsDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
      for (const row of period.values ?? []) { const measure = row._id ? measureById.get(row._id) : undefined; if (!measure || row.value == null || row.value === "") continue; const value = Number(row.value); if (!Number.isFinite(value)) throw new Error(`国家数据社零数值异常: ${component.label}/${period.code}`); const code = retailCode(component.key, measure); const rows = points.get(code) ?? []; rows.push({ obsDate, value }); points.set(code, rows); if (obsDate > latest) latest = obsDate; }
    }
  }
  for (const [code, rows] of points) points.set(code, rows.sort((a,b) => a.obsDate.getTime()-b.obsDate.getTime()));
  if (latest.getTime() === 0) throw new Error("国家数据社零未返回观测"); return (cache = { at: Date.now(), points, latest });
}

import type { ObservationPoint } from "../types";
import { NBS_DATA_API_BASE, NBS_INDUSTRIAL_CIDS, NBS_INDUSTRIAL_COMPONENTS, NBS_INDUSTRIAL_INDEX_URL, NBS_MONTHLY_ROOT_ID, nbsIndustrialCode, type IndustrialComponent, type IndustrialMeasure } from "./catalog";
import { parseNbsIndustrialResponse } from "./parseResponse";

type Indicator = { _id?: string; i_showname?: string };
type Series = { cid: string; indicatorId: string };
const headers = { Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" };
const measures: readonly IndustrialMeasure[] = ["yoy", "cumulative_yoy"];
const suffix: Record<IndustrialMeasure, string> = { yoy: "同比增长", cumulative_yoy: "累计增长", mom: "环比" };

async function indicatorList(cid: string): Promise<Indicator[]> {
  const r = await fetch(`${NBS_DATA_API_BASE}/new/queryIndicatorsByCid?cid=${cid}`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`国家数据工业增加值目录 HTTP ${r.status}: ${cid}`);
  const json = await r.json() as { data?: { list?: Indicator[] } }; if (!Array.isArray(json.data?.list)) throw new Error(`国家数据工业增加值目录缺失: ${cid}`); return json.data.list;
}
function matches(row: Indicator, component: IndustrialComponent, measure: IndustrialMeasure) {
  const labels = [component.nbsLabel, component.nbsLabel.replace(/及/g, "和")];
  const name = typeof row.i_showname === "string" ? row.i_showname.replace(/\s/g, "") : "";
  return labels.some((label) => {
    const prefix = component.group === "headline" ? label : `${label}增加值`;
    return name.startsWith(`${prefix}${suffix[measure]}`);
  });
}
async function request(cid: string, indicatorIds: string[], startYear: number) {
  const r = await fetch(`${NBS_DATA_API_BASE}/stream/esData`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ cid, indicatorIds, das: [{ text: "全国", value: "000000000000" }], dts: [`${startYear}01MM-${new Date().getUTCFullYear() + 1}12MM`], showType: "1", rootId: NBS_MONTHLY_ROOT_ID }), signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`国家数据工业增加值历史 HTTP ${r.status}: ${cid}`); return r.json();
}

export async function fetchNbsIndustrialCurrentCatalog(): Promise<Map<string, Series>> {
  const result = new Map<string, Series>();
  const groups: readonly { cid: string; components: readonly IndustrialComponent[] }[] = [
    { cid: NBS_INDUSTRIAL_CIDS.headline, components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "headline") },
    { cid: NBS_INDUSTRIAL_CIDS.ownership, components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "ownership") },
    { cid: NBS_INDUSTRIAL_CIDS.sector, components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "sector") },
    { cid: NBS_INDUSTRIAL_CIDS.industries.at(-1)!, components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "industry") },
  ];
  for (const group of groups) { const rows = await indicatorList(group.cid); for (const component of group.components) for (const measure of measures) { const row = rows.find((x) => matches(x, component, measure)); if (!row?._id) throw new Error(`国家数据工业增加值当前目录缺少 ${component.displayName}${suffix[measure]}`); result.set(`${component.key}:${measure}`, { cid: group.cid, indicatorId: row._id }); } }
  return result;
}

export async function fetchNbsIndustrialSeries(series: Series, startYear: number): Promise<ObservationPoint[]> { return parseNbsIndustrialResponse(await request(series.cid, [series.indicatorId], startYear), [series.indicatorId]).get(series.indicatorId) ?? []; }

export async function fetchNbsIndustrialHistory(): Promise<Map<string, ObservationPoint[]>> {
  const out = new Map<string, ObservationPoint[]>(); for (const c of NBS_INDUSTRIAL_COMPONENTS) for (const m of measures) out.set(nbsIndustrialCode(c.key, m), []);
  const groups: readonly { cids: readonly string[]; components: readonly IndustrialComponent[] }[] = [
    { cids: [NBS_INDUSTRIAL_CIDS.headline], components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "headline") },
    { cids: [NBS_INDUSTRIAL_CIDS.ownership], components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "ownership") },
    { cids: [NBS_INDUSTRIAL_CIDS.sector], components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "sector") },
    { cids: NBS_INDUSTRIAL_CIDS.industries, components: NBS_INDUSTRIAL_COMPONENTS.filter((x) => x.group === "industry") },
  ];
  for (const group of groups) for (const cid of group.cids) {
    const list = await indicatorList(cid); const pairs = group.components.flatMap((component) => measures.flatMap((measure) => { const row = list.find((x) => matches(x, component, measure)); return row?._id ? [{ component, measure, id: row._id }] : []; })); if (!pairs.length) continue;
    const points = parseNbsIndustrialResponse(await request(cid, pairs.map((x) => x.id), 2003), pairs.map((x) => x.id));
    for (const pair of pairs) out.get(nbsIndustrialCode(pair.component.key, pair.measure))!.push(...(points.get(pair.id) ?? []));
  }
  for (const [code, points] of out) { const d = new Map(points.map((x) => [x.obsDate.getTime(), x])); out.set(code, [...d.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime())); }
  return out;
}

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#39;|&quot;/g, " ").replace(/\s+/g, " "); }
/** 发布页是总项环比的唯一官方来源；目录页动态选取最新一篇，避免固定月度 URL。 */
export async function fetchLatestIndustrialMom(): Promise<{ point: ObservationPoint; articleUrl: string }> {
  const index = await fetch(NBS_INDUSTRIAL_INDEX_URL, { headers, signal: AbortSignal.timeout(30_000) }); if (!index.ok) throw new Error(`国家统计局工业发布目录 HTTP ${index.status}`);
  const links = [...(await index.text()).matchAll(/href="([^"]*\/\d{6}\/t\d+_\d+\.html)"/g)].map((x) => new URL(x[1]!, NBS_INDUSTRIAL_INDEX_URL).toString());
  for (const articleUrl of [...new Set(links)].slice(0, 40)) { const r = await fetch(articleUrl, { headers, signal: AbortSignal.timeout(30_000) }); if (!r.ok) continue; const text = stripHtml(await r.text()); const m = /从环比看[，,](\d{1,2})月份[，,]规模以上工业增加值比上月(增长|下降)([\d.]+)%/.exec(text); const date = /(\d{4})年(\d{1,2})月份规模以上工业增加值/.exec(text); if (m && date) return { point: { obsDate: new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, 1)), value: (m[2] === "下降" ? -1 : 1) * Number(m[3]) }, articleUrl }; }
  throw new Error("国家统计局工业发布目录未找到最新总项环比锚点");
}

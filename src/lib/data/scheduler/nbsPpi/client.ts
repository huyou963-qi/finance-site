import type { ObservationPoint } from "../types";
import {
  NBS_DATA_API_BASE, NBS_MONTHLY_ROOT_ID, NBS_PPI_CIDS, NBS_PPI_COMPONENTS, nbsPpiCode,
  type NbsPpiComponent, type NbsPpiMeasure,
} from "./catalog";
import { parseNbsPpiResponse } from "./parseResponse";
import { fetchChinaOfficial } from "../chinaOfficialProxy";

type Indicator = { _id?: string; i_showname?: string };
const HEADERS = {
  Referer: "https://data.stats.gov.cn/dg/website/page.html",
  "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
};

function normalized(value: string) {
  return value.replace(/\s/g, "").replace(/[（()）]/g, "").replace(/指数.*$/, "");
}

function isForComponent(indicator: Indicator, component: NbsPpiComponent): boolean {
  return typeof indicator.i_showname === "string" && normalized(indicator.i_showname) === normalized(component.nbsLabel);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetchChinaOfficial(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`国家数据 PPI 元数据 HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
}

async function indicators(cid: string): Promise<Indicator[]> {
  const payload = await getJson<{ data?: { list?: Indicator[] } }>(`${NBS_DATA_API_BASE}/new/queryIndicatorsByCid?cid=${cid}`);
  if (!Array.isArray(payload.data?.list)) throw new Error(`国家数据 PPI：${cid} 缺少指标目录`);
  return payload.data.list;
}

export type NbsPpiSourceSeries = { cid: string; indicatorId: string; sourceMeasure: "index" | "mom" };
export type NbsPpiCurrentCatalog = Map<string, NbsPpiSourceSeries>;

/** 以最新分类口径发现 UUID；稳定的 instrument code 不依赖 UUID。 */
export async function fetchNbsPpiCurrentCatalog(): Promise<NbsPpiCurrentCatalog> {
  const output: NbsPpiCurrentCatalog = new Map();
  const plans: readonly { cid: string; sourceMeasure: "index" | "mom"; components: readonly NbsPpiComponent[] }[] = [
    { cid: NBS_PPI_CIDS.yoyIndexAggregate, sourceMeasure: "index", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "aggregate") },
    { cid: NBS_PPI_CIDS.momAggregate, sourceMeasure: "mom", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "aggregate") },
    { cid: NBS_PPI_CIDS.yoyIndexIndustries.at(-1)!, sourceMeasure: "index", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "industry") },
    { cid: NBS_PPI_CIDS.momIndustries.at(-1)!, sourceMeasure: "mom", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "industry") },
  ];
  for (const plan of plans) {
    const list = await indicators(plan.cid);
    for (const component of plan.components) {
      const indicator = list.find((item) => isForComponent(item, component));
      if (!indicator?._id) throw new Error(`国家数据 PPI：当前目录 ${plan.cid} 缺少“${component.displayName}”`);
      output.set(`${component.key}:${plan.sourceMeasure}`, { cid: plan.cid, indicatorId: indicator._id, sourceMeasure: plan.sourceMeasure });
    }
  }
  return output;
}

export async function fetchNbsPpiSeries(series: NbsPpiSourceSeries, measure: NbsPpiMeasure, startYear = 1983): Promise<ObservationPoint[]> {
  const endYear = new Date().getUTCFullYear() + 1;
  const response = await fetchChinaOfficial(`${NBS_DATA_API_BASE}/stream/esData`, {
    method: "POST", headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ cid: series.cid, indicatorIds: [series.indicatorId], das: [{ text: "全国", value: "000000000000" }], dts: [`${startYear}01MM-${endYear}12MM`], showType: "1", rootId: NBS_MONTHLY_ROOT_ID }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`国家数据 PPI 历史 HTTP ${response.status}: ${series.cid}`);
  const points = parseNbsPpiResponse(await response.json(), [series.indicatorId], measure).get(series.indicatorId) ?? [];
  return points;
}

/** 逐次基期拼接历史：指数/同比使用上年同月=100，环比使用上月=100。 */
export async function fetchNbsPpiHistory(): Promise<Map<string, ObservationPoint[]>> {
  const output = new Map<string, ObservationPoint[]>();
  for (const component of NBS_PPI_COMPONENTS) for (const measure of ["index", "yoy", "mom"] as const) output.set(nbsPpiCode(component.key, measure), []);
  const groups: readonly { cids: readonly string[]; sourceMeasure: "index" | "mom"; components: readonly NbsPpiComponent[] }[] = [
    { cids: [NBS_PPI_CIDS.yoyIndexAggregate], sourceMeasure: "index", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "aggregate") },
    { cids: [NBS_PPI_CIDS.momAggregate], sourceMeasure: "mom", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "aggregate") },
    { cids: NBS_PPI_CIDS.yoyIndexIndustries, sourceMeasure: "index", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "industry") },
    { cids: NBS_PPI_CIDS.momIndustries, sourceMeasure: "mom", components: NBS_PPI_COMPONENTS.filter((item) => item.group === "industry") },
  ];
  for (const group of groups) for (const cid of group.cids) {
    const list = await indicators(cid);
    const matched = group.components.flatMap((component) => {
      const item = list.find((indicator) => isForComponent(indicator, component));
      return item?._id ? [{ component, indicatorId: item._id }] : [];
    });
    if (matched.length === 0) continue;
    const rawById = new Map<string, ObservationPoint[]>();
    const values = await fetchChinaOfficial(`${NBS_DATA_API_BASE}/stream/esData`, {
      method: "POST", headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ cid, indicatorIds: matched.map((item) => item.indicatorId), das: [{ text: "全国", value: "000000000000" }], dts: ["198301MM-202712MM"], showType: "1", rootId: NBS_MONTHLY_ROOT_ID }), signal: AbortSignal.timeout(90_000),
    });
    if (!values.ok) throw new Error(`国家数据 PPI 历史 HTTP ${values.status}: ${cid}`);
    for (const [id, points] of parseNbsPpiResponse(await values.json(), matched.map((item) => item.indicatorId), group.sourceMeasure === "index" ? "index" : "mom")) rawById.set(id, points);
    for (const { component, indicatorId } of matched) for (const point of rawById.get(indicatorId) ?? []) {
      if (group.sourceMeasure === "index") {
        output.get(nbsPpiCode(component.key, "index"))!.push(point);
        output.get(nbsPpiCode(component.key, "yoy"))!.push({ obsDate: point.obsDate, value: Number((point.value - 100).toFixed(10)) });
      } else output.get(nbsPpiCode(component.key, "mom"))!.push(point);
    }
  }
  for (const [code, points] of output) {
    const byDate = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    output.set(code, [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
  }
  return output;
}

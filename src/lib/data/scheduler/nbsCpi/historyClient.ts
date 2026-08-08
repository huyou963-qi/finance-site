import type { ObservationPoint } from "../types";
import { NBS_CPI_COMPONENTS, NBS_CPI_MEASURES, NBS_DATA_API_BASE, NBS_MONTHLY_ROOT_ID, nbsCpiCode, type NbsCpiMeasure } from "./catalog";
import { fetchChinaOfficial } from "../chinaOfficialProxy";

type TreeRow = { _id?: string; name?: string; isLeaf?: boolean; sdate?: string | number | null; edate?: string | number | null };
type Indicator = { _id?: string; i_showname?: string };
type Payload = { data?: Array<{ code?: string; values?: Array<{ _id?: string; value?: string | number | null }> }> };
const HEADERS = { Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0" };
const PARENTS: Record<NbsCpiMeasure, string> = { index: "5b434e4d5e634a39b27a95f8251e9aae", yoy: "5b434e4d5e634a39b27a95f8251e9aae", mom: "7318f3bae40b4b4badbf519bcd2c79c9" };

function norm(value: unknown) { return String(value ?? "").replace(/\s/g, "").replace(/[（）()：:]/g, ""); }
function isIndexName(name: string) { return /上年同月=100/.test(name); }
function isMomName(name: string) { return /上月=100/.test(name); }
async function json(url: string) { const response = await fetchChinaOfficial(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`国家数据 CPI 元数据 HTTP ${response.status}: ${url}`); return response.json(); }
function periodStart(row: TreeRow) { const year = Number(row.sdate); return Number.isInteger(year) && year > 1900 ? year : 2000; }
function periodEnd(row: TreeRow) { const year = Number(row.edate); return Number.isInteger(year) && year > 1900 ? year : new Date().getUTCFullYear(); }

export async function fetchNbsCpiHistory(): Promise<Map<string, ObservationPoint[]>> {
  const output = new Map<string, ObservationPoint[]>();
  for (const component of NBS_CPI_COMPONENTS) for (const measure of NBS_CPI_MEASURES) output.set(nbsCpiCode(component.key, measure.key), []);
  for (const measure of ["index", "mom"] as const) {
    const tree = await json(`${NBS_DATA_API_BASE}/new/queryIndexTreeAsync?pid=${PARENTS[measure]}&code=1`) as { data?: TreeRow[] };
    const leaves = (tree.data ?? []).filter((row) => row.isLeaf && (measure === "mom" ? /全国居民消费价格分类指数/.test(row.name ?? "") : /全国居民消费价格分类指数/.test(row.name ?? "")));
    if (leaves.length < 2) throw new Error("国家数据 CPI：未找到完整时间分片");
    for (const leaf of leaves) {
      const catalog = await json(`${NBS_DATA_API_BASE}/new/queryIndicatorsByCid?cid=${leaf._id}`) as { data?: { list?: Indicator[] } };
      const indicatorByComponent = new Map<string, string>();
      for (const component of NBS_CPI_COMPONENTS) {
        const indicator = catalog.data?.list?.find((row) => {
          const name = norm(row.i_showname);
          const labels = [
            component.nbsLabel,
            component.nbsLabel.replace("及在外餐饮", ""),
            component.nbsLabel.replace("交通通信", "交通和通信"),
            component.nbsLabel.replace("教育文化娱乐", "教育文化和娱乐"),
            component.nbsLabel.replace("其他用品及服务", "其他用品和服务"),
          ].map(norm);
          return labels.some((label) => name.startsWith(label)) && (measure === "mom" ? isMomName(name) : isIndexName(name));
        });
        // 国家统计局在早期基期只发布八大类；总项以外的缺失不能伪造历史。
        if (indicator?._id) indicatorByComponent.set(component.key, indicator._id);
      }
      if (!indicatorByComponent.has("headline")) throw new Error(`国家数据 CPI：${leaf.name} 缺总指数`);
      const response = await fetchChinaOfficial(`${NBS_DATA_API_BASE}/stream/esData`, { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ cid: leaf._id, indicatorIds: [...indicatorByComponent.values()], das: [{ text: "全国", value: "000000000000" }], dts: [`${periodStart(leaf)}01MM-${periodEnd(leaf)}12MM`], showType: "1", rootId: NBS_MONTHLY_ROOT_ID }), signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`国家数据 CPI 历史 HTTP ${response.status}: ${leaf.name}`);
      const payload = await response.json() as Payload;
      if (!Array.isArray(payload.data)) throw new Error(`国家数据 CPI：${leaf.name} 返回缺 data`);
      const componentByIndicator = new Map([...indicatorByComponent].map(([component, id]) => [id, component]));
      for (const period of payload.data) {
        const match = /^(\d{4})(\d{2})MM$/.exec(String(period.code ?? ""));
        if (!match) continue;
        const obsDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
        for (const value of period.values ?? []) {
          const component = value._id ? componentByIndicator.get(value._id) : undefined;
          if (value.value == null || value.value === "") continue;
          const raw = typeof value.value === "number" ? value.value : Number(value.value);
          if (!component || !Number.isFinite(raw) || raw < 50 || raw > 200) throw new Error(`国家数据 CPI：${period.code} 数据异常`);
          output.get(nbsCpiCode(component, measure))!.push({ obsDate, value: measure === "mom" ? Number((raw - 100).toFixed(10)) : raw });
          if (measure === "index") output.get(nbsCpiCode(component, "yoy"))!.push({ obsDate, value: Number((raw - 100).toFixed(10)) });
        }
      }
    }
  }
  for (const [code, points] of output) {
    const byDate = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    const sorted = [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
    if (code === nbsCpiCode("headline", "index") && sorted.length < 12) throw new Error(`国家数据 CPI：${code} 历史不足 12 点`);
    output.set(code, sorted);
  }
  return output;
}

export function mergeNbsCpiPoints(history: Map<string, ObservationPoint[]>, latest: Map<string, ObservationPoint[]>) {
  const output = new Map<string, ObservationPoint[]>();
  for (const code of history.keys()) {
    const byDate = new Map<number, ObservationPoint>();
    for (const point of history.get(code) ?? []) byDate.set(point.obsDate.getTime(), point);
    for (const point of latest.get(code) ?? []) byDate.set(point.obsDate.getTime(), point);
    output.set(code, [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
  }
  return output;
}

import type { ObservationPoint } from "../types";
import { NBS_GDP_API_BASE, NBS_GDP_ROOT_ID, type GdpFrequency, type GdpSeries } from "./catalog";
import { parseNbsGdpResponse } from "./parseResponse";

const headers = { Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0", "Content-Type": "application/json" };
const dates = (frequency: GdpFrequency, startYear: number) => frequency === "quarterly" ? [`${startYear}01SS-${new Date().getUTCFullYear() + 1}04SS`] : [`${startYear}YY-${new Date().getUTCFullYear() + 1}YY`];

async function request(cid: string, indicatorIds: string[], frequency: GdpFrequency, startYear: number) {
  const r = await fetch(`${NBS_GDP_API_BASE}/stream/esData`, { method: "POST", headers, body: JSON.stringify({ cid, indicatorIds, das: [{ text: "全国", value: "000000000000" }], dts: dates(frequency, startYear), showType: "1", rootId: NBS_GDP_ROOT_ID }), signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`国家数据 GDP 历史 HTTP ${r.status}: ${cid}`);
  return r.json();
}

export async function fetchNbsGdpGroup(series: readonly GdpSeries[], startYear: number): Promise<Map<string, ObservationPoint[]>> {
  if (!series.length) return new Map();
  const first = series[0]!;
  if (series.some((x) => x.cid !== first.cid || x.frequency !== first.frequency)) throw new Error("国家数据 GDP：错误的序列分组");
  const ids = series.map((x) => x.indicatorId); const transforms = new Map(series.map((x) => [x.indicatorId, x.transform] as const));
  return parseNbsGdpResponse(await request(first.cid, ids, first.frequency, startYear), ids, first.frequency, transforms);
}

export async function fetchNbsGdpSeries(series: GdpSeries, startYear: number) { return (await fetchNbsGdpGroup([series], startYear)).get(series.indicatorId) ?? []; }

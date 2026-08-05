import type { ObservationPoint } from "../types";
import type { GdpFrequency, GdpTransform } from "./catalog";

type Response = { data?: Array<{ code?: unknown; values?: Array<{ _id?: unknown; value?: unknown }> }> };

/** 国家数据 esData：季度代码 YYYY0QSS，年度代码 YYYYYY；空值代表尚未发布，指数在此转换为实际同比。 */
export function parseNbsGdpResponse(payload: Response, ids: readonly string[], frequency: GdpFrequency, transforms: ReadonlyMap<string, GdpTransform>): Map<string, ObservationPoint[]> {
  if (!Array.isArray(payload.data)) throw new Error("国家数据 GDP：响应缺少 data");
  const out = new Map(ids.map((id) => [id, [] as ObservationPoint[]]));
  const pattern = frequency === "quarterly" ? /^(\d{4})0([1-4])SS$/ : /^(\d{4})YY$/;
  for (const period of payload.data) {
    const m = pattern.exec(String(period.code ?? "")); if (!m) continue;
    const year = Number(m[1]); const date = new Date(Date.UTC(year, frequency === "quarterly" ? (Number(m[2]) - 1) * 3 : 0, 1));
    for (const row of period.values ?? []) {
      const id = typeof row._id === "string" ? row._id : "";
      if (!out.has(id) || row.value == null || row.value === "") continue;
      const raw = typeof row.value === "number" ? row.value : Number(String(row.value).replace(/,/g, ""));
      if (!Number.isFinite(raw) || raw < -1_000_000 || raw > 10_000_000) throw new Error(`国家数据 GDP：${String(period.code)} 数值异常`);
      const value = transforms.get(id) === "index_minus_100" ? Number((raw - 100).toFixed(10)) : raw;
      if (!Number.isFinite(value) || value < -1_000_000 || value > 100_000_000) throw new Error(`国家数据 GDP：${String(period.code)} 转换后数值异常（${id}=${raw}）`);
      out.get(id)!.push({ obsDate: date, value });
    }
  }
  for (const [id, points] of out) {
    const deduped = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    out.set(id, [...deduped.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
  }
  return out;
}

import type { ObservationPoint } from "../types";
type Response = { data?: Array<{ code?: unknown; values?: Array<{ _id?: unknown; value?: unknown }> }> };

/** esData 的 YYYYMMMM 月份数据；空值代表未发布，百分比异常则中止而不入库。 */
export function parseNbsIndustrialResponse(payload: Response, ids: readonly string[]): Map<string, ObservationPoint[]> {
  if (!Array.isArray(payload.data)) throw new Error("国家数据工业增加值：响应缺少 data");
  const out = new Map(ids.map((id) => [id, [] as ObservationPoint[]]));
  for (const period of payload.data) {
    const m = /^(\d{4})(\d{2})MM$/.exec(String(period.code ?? "")); if (!m) continue;
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    for (const row of period.values ?? []) {
      const id = typeof row._id === "string" ? row._id : "";
      if (!out.has(id) || row.value == null || row.value === "") continue;
      const value = typeof row.value === "number" ? row.value : Number(row.value);
      if (!Number.isFinite(value) || value < -100 || value > 300) throw new Error(`国家数据工业增加值：${period.code} 数值异常`);
      out.get(id)!.push({ obsDate: date, value });
    }
  }
  for (const [id, points] of out) {
    const deduped = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    out.set(id, [...deduped.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
  }
  return out;
}

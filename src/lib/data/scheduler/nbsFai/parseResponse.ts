import type { ObservationPoint } from "../types";
import type { FaiFrequency } from "./catalog";
type Response = { data?: Array<{ code?: unknown; values?: Array<{ _id?: unknown; value?: unknown }> }> };

/** esData：月度 YYYYMMMD、年度 YYYYYY。空值为未发布；异常格式或数值会中止，绝不静默写库。 */
export function parseNbsFaiResponse(payload: Response, ids: readonly string[], frequency: FaiFrequency): Map<string, ObservationPoint[]> {
  if (!Array.isArray(payload.data)) throw new Error("国家数据固定资产投资响应缺少 data");
  const pattern = frequency === "monthly" ? /^(\d{4})(\d{2})MM$/ : /^(\d{4})YY$/;
  const out = new Map(ids.map((id) => [id, [] as ObservationPoint[]]));
  for (const period of payload.data) {
    const match = pattern.exec(String(period.code ?? "")); if (!match) continue;
    const date = new Date(Date.UTC(Number(match[1]), frequency === "monthly" ? Number(match[2]) - 1 : 0, 1));
    for (const row of period.values ?? []) {
      const id = typeof row._id === "string" ? row._id : ""; if (!out.has(id) || row.value == null || row.value === "") continue;
      const value = typeof row.value === "number" ? row.value : Number(String(row.value).replace(/,/g, ""));
      if (!Number.isFinite(value) || value < -1_000_000 || value > 100_000_000) throw new Error(`国家数据固定资产投资数值异常：${String(period.code)} ${id}=${String(row.value)}`);
      out.get(id)!.push({ obsDate: date, value });
    }
  }
  for (const [id, points] of out) { const unique = new Map(points.map((x) => [x.obsDate.getTime(), x])); out.set(id, [...unique.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime())); }
  return out;
}

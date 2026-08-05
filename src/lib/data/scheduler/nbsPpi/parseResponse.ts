import type { ObservationPoint } from "../types";
import type { NbsPpiMeasure } from "./catalog";

type NbsResponse = { data?: Array<{ code?: unknown; values?: Array<{ _id?: unknown; value?: unknown }> }> };

/** 国家数据 esData：YYYYMMMM → 月初；空值为尚未发布，绝不写入。 */
export function parseNbsPpiResponse(payload: NbsResponse, indicatorIds: readonly string[], measure: NbsPpiMeasure): Map<string, ObservationPoint[]> {
  if (!Array.isArray(payload.data)) throw new Error("国家数据 PPI：响应缺少 data");
  const output = new Map(indicatorIds.map((id) => [id, [] as ObservationPoint[]]));
  for (const period of payload.data) {
    const match = /^(\d{4})(\d{2})MM$/.exec(String(period.code ?? ""));
    if (!match) continue;
    const obsDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    for (const row of period.values ?? []) {
      const id = typeof row._id === "string" ? row._id : "";
      if (!output.has(id) || row.value == null || row.value === "") continue;
      const raw = typeof row.value === "number" ? row.value : Number(row.value);
      // 细分行业（石油/小行业）在强基数效应下可低于 50 或高于 200；0 是源端
      // 明确发布的值，不能把它悄悄当作缺失。仅拒绝负值和不可能的三位数外极值。
      if (!Number.isFinite(raw) || raw < 0 || raw > 300) throw new Error(`国家数据 PPI：${period.code} 数值异常`);
      output.get(id)!.push({ obsDate, value: measure === "index" ? raw : Number((raw - 100).toFixed(10)) });
    }
  }
  for (const [id, points] of output) {
    const byDate = new Map(points.map((point) => [point.obsDate.getTime(), point]));
    output.set(id, [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()));
  }
  return output;
}

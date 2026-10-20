import type * as XLSX from "xlsx";
import { NBS_INDUSTRIAL_COMPONENTS, nbsIndustrialCode } from "./catalog";
import { compactReleaseLabel, parseMonthlyReleaseTable } from "../nbsPriceRelease/monthlyTable";
import type { ObservationPoint } from "../types";

export function parseIndustrialRelease(workbook: XLSX.WorkBook): Map<string, ObservationPoint> {
  const { obsDate, values } = parseMonthlyReleaseTable(workbook, "INDUSTRIAL");
  const output = new Map<string, ObservationPoint>();
  for (const c of NBS_INDUSTRIAL_COMPONENTS) {
    const row = values.get(compactReleaseLabel(c.displayName));
    if (!row) continue; // The press table does not publish all 41 industries.
    for (const [measure, index] of [["yoy", 1], ["cumulative_yoy", 3]] as const) {
      const value = row[index];
      if (value != null) output.set(nbsIndustrialCode(c.key, measure), { obsDate, value });
    }
  }
  if (!output.has(nbsIndustrialCode("headline", "yoy"))) throw new Error("工业月报缺少增加值总项，拒绝串表");
  return output;
}

import type * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { NBS_RETAIL_COMPONENTS, retailCode, type RetailMeasure } from "./catalog";
import { compactReleaseLabel, parseMonthlyReleaseTable } from "../nbsPriceRelease/monthlyTable";

const labels: Record<string, string> = {
  headline: "社会消费品零售总额", above_limit: "限额以上单位消费品零售额",
  urban: "城镇", rural: "乡村", catering: "餐饮收入", goods: "商品零售额",
  above_limit_catering: "限额以上单位餐饮收入", above_limit_goods: "限额以上单位商品零售额",
};
const columns: readonly [RetailMeasure, number][] = [["current", 0], ["yoy", 1], ["cumulative", 2], ["cumulative_yoy", 3]];
export function parseRetailRelease(workbook: XLSX.WorkBook, metadata: unknown, code: string): ObservationPoint | undefined {
  const { obsDate, values } = parseMonthlyReleaseTable(workbook, "RETAIL");
  let label: string | undefined;
  let column: number | undefined;
  for (const c of NBS_RETAIL_COMPONENTS) for (const [measure, index] of columns) {
    if (retailCode(c.key, measure) === code) { label = labels[c.key]; column = index; }
  }
  // Existing goods IDs are UUID-based. Match their seeded definition, not a
  // guessed ordinal or an unrelated summary row.
  const m = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const goods = /^nbs_cn_retail_goods_[a-f0-9]{8}_(cur|cum|yoy|cyoy)$/.exec(code);
  if (goods && typeof m.displayName === "string") {
    const definition = /^限上商品零售[：:](.+?)(当期值|累计值|同比增长|累计增长)$/.exec(m.displayName);
    const suffix = { 当期值: "cur", 累计值: "cum", 同比增长: "yoy", 累计增长: "cyoy" };
    if (definition && suffix[definition[2] as keyof typeof suffix] === goods[1]) {
      label = definition[1]; column = { cur: 0, yoy: 1, cum: 2, cyoy: 3 }[goods[1]!];
    }
  }
  if (label == null || column == null) return undefined;
  const value = values.get(compactReleaseLabel(label))?.[column];
  return value == null ? undefined : { obsDate, value };
}

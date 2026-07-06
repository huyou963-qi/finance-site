import { UsMacroFrameworkClient } from "@/components/macro-framework/UsMacroFrameworkClient";
import { INDICATORS } from "@/lib/macro-framework/data";
import { fetchFrameworkIndicatorsFromDb } from "@/lib/macro-framework/fetchIndicatorsFromDb";
import { mergeFrameworkIndicators } from "@/lib/macro-framework/mergeIndicators";

export const metadata = {
  title: "宏观框架 — Finova",
  description: "美国宏观周期定位、领先/同步/滞后指标矩阵、部门传导关系与数据日历",
};

export default async function MacroFrameworkPage() {
  let indicators = INDICATORS;
  try {
    const payload = await fetchFrameworkIndicatorsFromDb();
    indicators = mergeFrameworkIndicators(INDICATORS, payload.indicators);
  } catch {
    indicators = mergeFrameworkIndicators(INDICATORS, {});
  }

  return <UsMacroFrameworkClient indicators={indicators} />;
}

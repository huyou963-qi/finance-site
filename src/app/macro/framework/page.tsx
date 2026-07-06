import { UsMacroFrameworkClient } from "@/components/macro-framework/UsMacroFrameworkClient";
import { INDICATORS } from "@/lib/macro-framework/data";
import { fetchFrameworkIndicatorsFromDb } from "@/lib/macro-framework/fetchIndicatorsFromDb";
import { mergeFrameworkIndicators } from "@/lib/macro-framework/mergeIndicators";

export const metadata = {
  title: "宏观框架 — Finova",
  description: "美国宏观周期定位、领先/同步/滞后指标矩阵、部门传导关系与数据日历",
};

/** 指标值来自 PostgreSQL，必须在请求时渲染，禁止 build 时静态快照（否则 CI 无 DB → 全 N/A 固化）。 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function MacroFrameworkPage() {
  let indicators = INDICATORS;
  try {
    const payload = await fetchFrameworkIndicatorsFromDb();
    indicators = mergeFrameworkIndicators(INDICATORS, payload.indicators);
  } catch (err) {
    console.error("[macro/framework] fetchFrameworkIndicatorsFromDb failed:", err);
    indicators = mergeFrameworkIndicators(INDICATORS, {});
  }

  return <UsMacroFrameworkClient indicators={indicators} />;
}

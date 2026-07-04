import { UsMacroFrameworkClient } from "@/components/macro-framework/UsMacroFrameworkClient";

export const metadata = {
  title: "宏观框架 — Finova",
  description: "美国宏观周期定位、领先/同步/滞后指标矩阵、部门传导关系与数据日历",
};

export default function MacroFrameworkPage() {
  return <UsMacroFrameworkClient />;
}

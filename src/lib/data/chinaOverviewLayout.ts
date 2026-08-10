import type { MacroSeriesChartType } from "@/lib/macroChartOption";

export type ChinaOverviewSeriesDef = {
  columnIndex: number;
  displayName: string;
  code: string;
  panel: 1 | 2 | 3 | 4 | 5 | 6;
  /** 指标树主题分类（与宏观目录其他国家指标一致） */
  catalogCategory: string;
  axis: "left" | "right";
  chartType: MacroSeriesChartType;
  color: string;
};

/**
 * China_Overview.xlsx 中仅保留已确认官方更新方式的两项 PMI。
 *
 * 其余 19 项历史上来自人工导入的 overview-china，更新方式均为
 * pending，且现已由各官方领域序列替代或尚未接入，不能继续创建。
 */
export const CHINA_OVERVIEW_SERIES: readonly ChinaOverviewSeriesDef[] = [
  {
    columnIndex: 5,
    displayName: "制造业PMI",
    code: "chov_c05_mfg_pmi",
    panel: 2,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#3f4f86",
  },
  {
    columnIndex: 6,
    displayName: "非制造业PMI：商务活动",
    code: "chov_c06_nm_pmi",
    panel: 2,
    catalogCategory: "景气调查",
    axis: "left",
    chartType: "line",
    color: "#67b36d",
  },
] as const;

export const CHINA_OVERVIEW_BY_COLUMN = new Map(
  CHINA_OVERVIEW_SERIES.map((row) => [row.columnIndex, row]),
);

export const CHINA_OVERVIEW_BY_CODE = new Map(
  CHINA_OVERVIEW_SERIES.map((row) => [row.code, row]),
);

export const CHINA_OVERVIEW_BY_DISPLAY = new Map(
  CHINA_OVERVIEW_SERIES.map((row) => [
    normalizeChinaOverviewName(row.displayName),
    row,
  ]),
);

export function normalizeChinaOverviewName(name: string): string {
  return name.trim().replace(/[：:]/g, ":").replace(/\s+/g, "").toLowerCase();
}

export function chinaOverviewMdsKey(code: string): string {
  return `mds:${code}`;
}

export function chinaOverviewCodeFromMdsKey(key: string): string | null {
  if (!key.startsWith("mds:chov_")) return null;
  return key.slice(4);
}

export function chinaOverviewColumnFromCode(code: string): number {
  const match = /^chov_c(\d+)_/i.exec(code);
  return match ? Number(match[1]) : 999;
}

export function chinaOverviewPanelFromCode(code: string): number {
  return CHINA_OVERVIEW_BY_CODE.get(code)?.panel ?? 1;
}

/** Prisma MacroCategory.code 后缀（挂在 macro_country_cn 下） */
export const CHINA_OVERVIEW_CATEGORY_CODE_BY_NAME: Record<string, string> = {
  景气调查: "business_survey",
};

export const CHINA_OVERVIEW_CATEGORY_SORT_BY_NAME: Record<string, number> = {
  景气调查: 70,
};

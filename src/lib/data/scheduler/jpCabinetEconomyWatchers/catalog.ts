export const JP_CAO_WATCHERS_PAGE_URL = "https://www5.cao.go.jp/keizai3/watcher.html";
export const JP_CAO_WATCHERS_WORKBOOK_URL = "https://www5.cao.go.jp/keizai3/watcher/watcher5.xls";
export const JP_CAO_WATCHERS_SCHEDULE_URL = "https://www5.cao.go.jp/keizai3/watcher/watcher-yotei.html";
export const JP_CAO_WATCHERS_TERMS_URL = "https://www.cao.go.jp/notice/rule.html";
export const JP_CAO_WATCHERS_SOURCE_ID = "jp-cao-economy-watchers";
export const JP_CAO_WATCHERS_AGENCY_ID = "jp-cao";
export const JP_CAO_WATCHERS_PROVIDER = "jp_cao_economy_watchers";
export const JP_CAO_WATCHERS_RELEASE_PACKAGE_ID = "jp.cao.economy_watchers";

export type JpCaoWatchersSeries = {
  instrumentCode: string;
  label: string;
  sheet: "分野別（現状）" | "分野別（先行き)";
  perspective: "current" | "outlook";
  component: "total" | "household" | "corporate" | "employment";
  componentJa: string;
  column: number;
};

const COMPONENTS = [
  ["total", "合计", "合計", 3],
  ["household", "家庭动向相关", "家計動向関連", 4],
  ["corporate", "企业动向相关", "企業動向関連", 9],
  ["employment", "就业相关", "雇用関連", 12],
] as const;

export const JP_CAO_WATCHERS_SERIES: readonly JpCaoWatchersSeries[] = [
  ...COMPONENTS.map(([component, componentZh, componentJa, column]) => ({
    instrumentCode: `cao_jp_watchers_current_${component}_di_sa`,
    label: `日本:景气观察者调查:现状判断DI:${componentZh}（季调）`,
    sheet: "分野別（現状）" as const,
    perspective: "current" as const,
    component,
    componentJa,
    column,
  })),
  ...COMPONENTS.map(([component, componentZh, componentJa, column]) => ({
    instrumentCode: `cao_jp_watchers_outlook_${component}_di_sa`,
    label: `日本:景气观察者调查:先行判断DI:${componentZh}（季调）`,
    sheet: "分野別（先行き)" as const,
    perspective: "outlook" as const,
    component,
    componentJa,
    column,
  })),
];

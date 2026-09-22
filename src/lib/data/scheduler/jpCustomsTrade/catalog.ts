export const JP_CUSTOMS_TRADE_PROVIDER = "jp_customs_trade";
export const JP_CUSTOMS_TRADE_SOURCE_ID = "jp-customs-trade";
export const JP_CUSTOMS_TRADE_PACKAGE_ID = "jp.customs.trade";
export const JP_CUSTOMS_TRADE_PAGE = "https://www.customs.go.jp/toukei/suii/html/time_e.htm";
export const JP_CUSTOMS_TRADE_CSV =
  "https://www.customs.go.jp/toukei/suii/html/data/d41ma.csv";
export const JP_CUSTOMS_TRADE_SCHEDULE =
  "https://www.customs.go.jp/toukei/calendar/calend_e.htm";
export const JP_CUSTOMS_TRADE_TERMS = "https://www.customs.go.jp/english/others/copyright.htm";
export const JP_CUSTOMS_TRADE_HISTORY_START = "1979-01-01";
export const JP_CUSTOMS_TRADE_NEXT_RELEASE_AT = "2026-09-16T00:50:00.000Z";

/**
 * 只存官方 CSV 原样发布的两列。贸易差额（出口 − 进口）是二次指标，按「宏观数据库约束」不入库：
 * 原 customs_jp_trade_balance_nsa 已退役（2026-09-22），模板里改成指标运算 calc:jp-trade-balance。
 */
export const JP_CUSTOMS_TRADE_SERIES = [
  {
    key: "exports",
    instrumentCode: "customs_jp_trade_exports_total_nsa",
    label: "货物出口总额",
    nameEn: "Merchandise exports, total",
    sourceColumn: "Exp-Total",
  },
  {
    key: "imports",
    instrumentCode: "customs_jp_trade_imports_total_nsa",
    label: "货物进口总额",
    nameEn: "Merchandise imports, total",
    sourceColumn: "Imp-Total",
  },
] as const;

export type JpCustomsTradeSeries = (typeof JP_CUSTOMS_TRADE_SERIES)[number];

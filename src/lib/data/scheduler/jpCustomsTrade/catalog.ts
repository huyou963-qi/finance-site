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

export const JP_CUSTOMS_TRADE_SERIES = [
  {
    key: "exports",
    instrumentCode: "customs_jp_trade_exports_total_nsa",
    label: "货物出口总额",
    nameEn: "Merchandise exports, total",
    sourceColumn: "Exp-Total",
    derivation: null,
  },
  {
    key: "imports",
    instrumentCode: "customs_jp_trade_imports_total_nsa",
    label: "货物进口总额",
    nameEn: "Merchandise imports, total",
    sourceColumn: "Imp-Total",
    derivation: null,
  },
  {
    key: "balance",
    instrumentCode: "customs_jp_trade_balance_nsa",
    label: "货物贸易差额",
    nameEn: "Merchandise trade balance",
    sourceColumn: "Exp-Total minus Imp-Total",
    derivation: "exports_minus_imports",
  },
] as const;

export type JpCustomsTradeSeries = (typeof JP_CUSTOMS_TRADE_SERIES)[number];

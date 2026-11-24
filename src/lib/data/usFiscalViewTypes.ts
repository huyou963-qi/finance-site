export const US_FISCAL_VIEW_IDS = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
] as const;
export type UsFiscalViewId = (typeof US_FISCAL_VIEW_IDS)[number];
export const US_FISCAL_VIEW_LABELS: Record<UsFiscalViewId, string> = {
  A1: "公共债务存量",
  A2: "债务余额变化",
  A3: "官方债务率",
  A4: "公众与政府内部持有",
  A5: "公众持有人构成",
  A6: "谁在增持或减持",
  B1: "财政收入与支出",
  B2: "收支趋势变化",
  B3: "赤字、初级赤字与净利息",
  B4: "本财年进展",
  B5: "财政收入结构",
  B6: "财政支出结构",
  C1: "发行、偿还与净发行",
  C2: "短债与中长债净发行",
  C3: "五券种拍卖发行结构",
  C4: "未来12个月到期分布",
  C5: "赤字与融资衔接",
  C6: "利息负担与存量成本",
};
export type UsFiscalView = {
  id: UsFiscalViewId;
  title: string;
  unit: string;
  rightUnit?: string;
  asOf: string;
  categories: string[];
  series: {
    name: string;
    data: (number | null)[];
    type: "line" | "bar";
    stack?: string;
    color: string;
    dashed?: boolean;
    right?: boolean;
  }[];
  table: { columns: string[]; rows: (string | number | null)[][] };
  note: string;
};
export type UsFiscalViewsPayload = {
  computedAt: string;
  attribution: string;
  views: Record<UsFiscalViewId, UsFiscalView>;
};

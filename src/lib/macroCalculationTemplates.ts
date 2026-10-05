import type { MacroSeriesCalcStep } from "@/lib/data/macroPresetTemplates";

export type MacroCalculationTemplate =
  | {
      id: string;
      title: string;
      description: string;
      mode: "single";
      steps: MacroSeriesCalcStep[];
    }
  | {
      id: string;
      title: string;
      description: string;
      mode: "derived";
      kind: "formula" | "correlation" | "regression";
      formula?: string;
      correlation?: {
        input: "level" | "diff" | "pctChange" | "logReturn" | "yoy";
        window: number;
        minPeriods: number;
      };
      regression?: {
        output: "coefficient" | "intercept" | "rSquared" | "fitted" | "residual";
        input: "level" | "diff" | "pctChange" | "logReturn" | "yoy";
        window: number;
        minPeriods: number;
      };
    };

export const MACRO_CALCULATION_TEMPLATES: readonly MacroCalculationTemplate[] = [
  {
    id: "annualized-volatility",
    title: "年化波动率",
    description: "百分比变化后计算 12 期样本标准差，并按 12 年化。",
    mode: "single",
    steps: [{ id: "template-vol", type: "volatility", input: "pctChange", window: 12, minPeriods: 10, sample: true, annualize: true, periodsPerYear: 12 }],
  },
  {
    id: "rolling-median",
    title: "滚动中位数",
    description: "24 期滚动 50% 分位数，降低极端值影响。",
    mode: "single",
    steps: [{ id: "template-median", type: "rollingQuantile", window: 24, minPeriods: 18, quantile: 0.5 }],
  },
  {
    id: "robust-zscore",
    title: "去极值 Z-Score",
    description: "先按 5%/95% Winsorize，再计算 24 期滚动 Z-Score。",
    mode: "single",
    steps: [
      { id: "template-winsor", type: "outlier", method: "winsorize", lower: 0.05, upper: 0.95 },
      { id: "template-zscore", type: "zScore", window: 24, minPeriods: 18, sample: true },
    ],
  },
  {
    id: "yoy-correlation",
    title: "同比后相关性",
    description: "A、B 先同比，再计算 24 期滚动 Pearson 相关性。",
    mode: "derived",
    kind: "correlation",
    correlation: { input: "yoy", window: 24, minPeriods: 18 },
  },
  {
    id: "real-rate",
    title: "实际利率",
    description: "名义利率 A 减去通胀 B。",
    mode: "derived",
    kind: "formula",
    formula: "A - B",
  },
  {
    id: "term-spread",
    title: "期限利差",
    description: "长端利率 A 减去短端利率 B。",
    mode: "derived",
    kind: "formula",
    formula: "A - B",
  },
  {
    id: "rolling-residual",
    title: "滚动回归残差",
    description: "A 对 B–H 做 36 期滚动 OLS，输出最新一期残差。",
    mode: "derived",
    kind: "regression",
    regression: { output: "residual", input: "level", window: 36, minPeriods: 24 },
  },
] as const;

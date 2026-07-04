import {
  Stack,
  Row,
  Grid,
  H1,
  H2,
  H3,
  Text,
  Card,
  CardHeader,
  CardBody,
  Pill,
  Callout,
  Swatch,
  Stat,
  Button,
  CollapsibleSection,
  UsageBar,
  Table,
  useHostTheme,
  useCanvasState,
  computeDAGLayout,
} from "cursor/canvas";

// ─── Types ───────────────────────────────────────────────────────────────────

type IndicatorTiming = "leading" | "coincident" | "lagging";
type Sector =
  | "corporate"
  | "financial"
  | "household"
  | "fiscal"
  | "monetary"
  | "external"
  | "inflation";
type IndustryCycleTag = "cyclical" | "growth" | "defensive" | "mixed";
type TransmissionChannel =
  | "interest_rate"
  | "credit"
  | "exchange_rate"
  | "wealth"
  | "expectations";
type ScenarioId = "A" | "B" | "C" | "D";

interface MacroIndicator {
  id: string;
  nameEn: string;
  nameZh: string;
  timing: IndicatorTiming;
  sector: Sector;
  value: number;
  unit: string;
  prevValue: number;
  releaseFreq: string;
  asOfDate: string;
  source: string;
  sparkline: number[];
  description: string;
}

interface SicIndustryRow {
  sicRange: string;
  nameZh: string;
  nameEn: string;
  cycleTag: IndustryCycleTag;
  mockOutputYoY: number;
  mockEmploymentYoY: number;
}

interface TransmissionEdge {
  from: string;
  to: string;
  channel: TransmissionChannel;
  lagMonths: string;
  label?: string;
}

interface TransmissionScenario {
  id: ScenarioId;
  titleZh: string;
  descriptionZh: string;
  nodes: { id: string; labelZh: string; type: "indicator" | "policy" | "shock" }[];
  edges: TransmissionEdge[];
}

// ─── Mock Data ───────────────────────────────────────────────────────────────

const INDICATORS: MacroIndicator[] = [
  // Corporate leading
  { id: "ism-pmi", nameEn: "ISM Manufacturing PMI", nameZh: "ISM 制造业 PMI", timing: "leading", sector: "corporate", value: 52.4, unit: "指数", prevValue: 51.8, releaseFreq: "月度", asOfDate: "2026-06", source: "ISM", sparkline: [48, 49, 50, 51, 51.8, 52.4], description: "制造业景气领先指标，>50 扩张。" },
  { id: "ism-orders", nameEn: "ISM New Orders", nameZh: "ISM 新订单", timing: "leading", sector: "corporate", value: 54.1, unit: "指数", prevValue: 53.2, releaseFreq: "月度", asOfDate: "2026-06", source: "ISM", sparkline: [46, 48, 50, 52, 53.2, 54.1], description: "新订单领先生产约 1-2 季度。" },
  { id: "durables-ex-trans", nameEn: "Durable Goods Orders ex-Transport", nameZh: "耐用品订单（除运输）", timing: "leading", sector: "corporate", value: 0.8, unit: "MoM%", prevValue: -0.3, releaseFreq: "月度", asOfDate: "2026-05", source: "Census", sparkline: [-0.5, 0.2, 0.6, -0.3, 0.8, 0.4], description: "资本品需求前瞻。" },
  { id: "nonres-construct", nameEn: "Nonresidential Construction", nameZh: "非住宅营建支出", timing: "leading", sector: "corporate", value: 2.1, unit: "YoY%", prevValue: 1.8, releaseFreq: "月度", asOfDate: "2026-05", source: "Census", sparkline: [0.5, 1.0, 1.4, 1.6, 1.8, 2.1], description: "商业投资领先指标。" },
  { id: "jobless-claims", nameEn: "Initial Claims (4-wk avg)", nameZh: "初请失业金（4周均值）", timing: "leading", sector: "corporate", value: 228, unit: "千人", prevValue: 232, releaseFreq: "周度", asOfDate: "2026-06-28", source: "DOL", sparkline: [245, 240, 235, 232, 230, 228], description: "劳动力市场早期信号。" },
  // Corporate coincident
  { id: "ind-prod", nameEn: "Industrial Production Index", nameZh: "工业生产指数", timing: "coincident", sector: "corporate", value: 103.2, unit: "指数", prevValue: 102.8, releaseFreq: "月度", asOfDate: "2026-05", source: "Fed G.17", sparkline: [101, 101.5, 102, 102.4, 102.8, 103.2], description: "制造业产出同步指标。" },
  { id: "mfg-inventories", nameEn: "Mfg & Trade Inventories", nameZh: "制造业和贸易库存", timing: "coincident", sector: "corporate", value: 1.2, unit: "YoY%", prevValue: 1.0, releaseFreq: "月度", asOfDate: "2026-04", source: "Census", sparkline: [0.5, 0.7, 0.8, 0.9, 1.0, 1.2], description: "库存周期同步变量。" },
  { id: "nf-output", nameEn: "Nonfarm Business Output", nameZh: "非农企业产出", timing: "coincident", sector: "corporate", value: 2.4, unit: "YoY%", prevValue: 2.2, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BLS", sparkline: [1.8, 2.0, 2.1, 2.2, 2.3, 2.4], description: "企业部门产出同步。" },
  { id: "corp-profits", nameEn: "Corporate Profits After Tax", nameZh: "税后企业利润", timing: "coincident", sector: "corporate", value: 3.1, unit: "YoY%", prevValue: 2.6, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BEA", sparkline: [1.5, 2.0, 2.2, 2.4, 2.6, 3.1], description: "盈利周期同步确认。" },
  // Corporate lagging
  { id: "unit-labor-cost", nameEn: "Unit Labor Cost", nameZh: "单位劳动力成本", timing: "lagging", sector: "corporate", value: 3.2, unit: "YoY%", prevValue: 3.0, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BLS", sparkline: [2.5, 2.7, 2.8, 2.9, 3.0, 3.2], description: "成本压力滞后反映。" },
  { id: "inv-sales", nameEn: "Inventory-to-Sales Ratio", nameZh: "库销比", timing: "lagging", sector: "corporate", value: 1.38, unit: "比率", prevValue: 1.40, releaseFreq: "月度", asOfDate: "2026-04", source: "Census", sparkline: [1.42, 1.41, 1.40, 1.39, 1.40, 1.38], description: "库存周期滞后指标。" },
  { id: "cap-util", nameEn: "Capacity Utilization: Mfg", nameZh: "制造业产能利用率", timing: "lagging", sector: "corporate", value: 78.4, unit: "%", prevValue: 78.0, releaseFreq: "月度", asOfDate: "2026-05", source: "Fed", sparkline: [76, 76.5, 77, 77.5, 78, 78.4], description: "产能利用滞后于订单。" },
  // Financial
  { id: "sloos", nameEn: "SLOOS C&I Tightening", nameZh: "SLOOS 银行贷款收紧", timing: "leading", sector: "financial", value: 28.5, unit: "% 净收紧", prevValue: 25.0, releaseFreq: "季度", asOfDate: "2026-Q2", source: "Fed", sparkline: [15, 18, 20, 22, 25, 28.5], description: "信贷条件领先指标。" },
  { id: "hy-oas", nameEn: "High Yield OAS", nameZh: "高收益债 OAS", timing: "leading", sector: "financial", value: 412, unit: "bp", prevValue: 385, releaseFreq: "日度", asOfDate: "2026-07-03", source: "ICE BofA", sparkline: [350, 360, 370, 380, 385, 412], description: "信用风险领先定价。" },
  { id: "spread-2s10", nameEn: "2s10s Treasury Spread", nameZh: "2-10年国债利差", timing: "leading", sector: "financial", value: -18, unit: "bp", prevValue: -25, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Treasury", sparkline: [-50, -40, -35, -30, -25, -18], description: "收益率曲线形态。" },
  { id: "nfci", nameEn: "Chicago Fed NFCI", nameZh: "全国金融条件指数", timing: "leading", sector: "financial", value: 0.32, unit: "σ", prevValue: 0.18, releaseFreq: "周度", asOfDate: "2026-06-27", source: "Chicago Fed", sparkline: [0.0, 0.05, 0.10, 0.14, 0.18, 0.32], description: "综合金融松紧度，>0 偏紧。" },
  { id: "ci-loans", nameEn: "C&I Loans Outstanding", nameZh: "商业工业贷款", timing: "coincident", sector: "financial", value: 2.8, unit: "YoY%", prevValue: 3.2, releaseFreq: "周度", asOfDate: "2026-06-25", source: "Fed H.8", sparkline: [4.5, 4.0, 3.8, 3.5, 3.2, 2.8], description: "信贷存量同步。" },
  { id: "m2-yoy", nameEn: "M2 Money Stock YoY", nameZh: "M2 同比", timing: "coincident", sector: "financial", value: 4.2, unit: "YoY%", prevValue: 4.0, releaseFreq: "月度", asOfDate: "2026-05", source: "Fed", sparkline: [2.5, 3.0, 3.2, 3.5, 4.0, 4.2], description: "广义货币同步。" },
  { id: "sp500", nameEn: "S&P 500", nameZh: "标普 500", timing: "coincident", sector: "financial", value: 5580, unit: "点位", prevValue: 5520, releaseFreq: "日度", asOfDate: "2026-07-03", source: "S&P", sparkline: [5200, 5300, 5380, 5450, 5520, 5580], description: "风险资产同步定价。" },
  { id: "delinq-rate", nameEn: "Bank Delinquency Rate", nameZh: "银行拖欠率", timing: "lagging", sector: "financial", value: 1.42, unit: "%", prevValue: 1.38, releaseFreq: "季度", asOfDate: "2026-Q1", source: "Fed", sparkline: [1.20, 1.25, 1.30, 1.34, 1.38, 1.42], description: "信用质量滞后。" },
  { id: "charge-off", nameEn: "C&I Charge-off Rate", nameZh: "C&I 贷款核销率", timing: "lagging", sector: "financial", value: 0.68, unit: "%", prevValue: 0.62, releaseFreq: "季度", asOfDate: "2026-Q1", source: "Fed", sparkline: [0.45, 0.50, 0.55, 0.58, 0.62, 0.68], description: "违约滞后确认。" },
  { id: "hh-net-worth", nameEn: "Household Net Worth", nameZh: "家庭净财富", timing: "lagging", sector: "financial", value: 168.2, unit: "万亿美元", prevValue: 166.8, releaseFreq: "季度", asOfDate: "2026-Q1", source: "Fed Z.1", sparkline: [160, 162, 163, 165, 166.8, 168.2], description: "财富效应滞后变量。" },
  // Household
  { id: "michigan-sent", nameEn: "U Michigan Sentiment", nameZh: "密歇根消费者信心", timing: "leading", sector: "household", value: 68.5, unit: "指数", prevValue: 65.2, releaseFreq: "月度", asOfDate: "2026-06", source: "U Michigan", sparkline: [62, 63, 64, 65, 65.2, 68.5], description: "消费意愿领先。" },
  { id: "cb-expect", nameEn: "CB Consumer Expectations", nameZh: "谘商会消费者预期", timing: "leading", sector: "household", value: 82.1, unit: "指数", prevValue: 78.5, releaseFreq: "月度", asOfDate: "2026-06", source: "Conf Board", sparkline: [75, 76, 77, 78, 78.5, 82.1], description: "预期分项领先。" },
  { id: "bldg-permits", nameEn: "Building Permits", nameZh: "建筑许可", timing: "leading", sector: "household", value: 1.42, unit: "百万套 SAAR", prevValue: 1.38, releaseFreq: "月度", asOfDate: "2026-05", source: "Census", sparkline: [1.30, 1.32, 1.34, 1.36, 1.38, 1.42], description: "住房活动领先。" },
  { id: "existing-home", nameEn: "Existing Home Sales", nameZh: "成屋销售", timing: "leading", sector: "household", value: 4.12, unit: "百万套 SAAR", prevValue: 4.05, releaseFreq: "月度", asOfDate: "2026-05", source: "NAR", sparkline: [3.90, 3.95, 4.00, 4.02, 4.05, 4.12], description: "利率敏感领先。" },
  { id: "pce", nameEn: "Personal Consumption Expenditures", nameZh: "个人消费 PCE", timing: "coincident", sector: "household", value: 2.6, unit: "YoY%", prevValue: 2.5, releaseFreq: "月度", asOfDate: "2026-05", source: "BEA", sparkline: [2.0, 2.1, 2.2, 2.3, 2.5, 2.6], description: "消费同步核心。" },
  { id: "retail-ex-auto", nameEn: "Retail Sales ex-Auto", nameZh: "零售销售（除汽车）", timing: "coincident", sector: "household", value: 0.4, unit: "MoM%", prevValue: 0.2, releaseFreq: "月度", asOfDate: "2026-05", source: "Census", sparkline: [-0.1, 0.0, 0.1, 0.15, 0.2, 0.4], description: "消费同步高频。" },
  { id: "payrolls", nameEn: "Nonfarm Payrolls", nameZh: "非农就业", timing: "coincident", sector: "household", value: 185, unit: "千人/月", prevValue: 210, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [250, 230, 220, 215, 210, 185], description: "劳动力同步。" },
  { id: "avg-earnings", nameEn: "Average Hourly Earnings YoY", nameZh: "平均时薪同比", timing: "coincident", sector: "household", value: 4.1, unit: "YoY%", prevValue: 4.0, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [3.8, 3.9, 3.9, 4.0, 4.0, 4.1], description: "工资同步。" },
  { id: "unemployment", nameEn: "Unemployment Rate (U3)", nameZh: "失业率 U3", timing: "lagging", sector: "household", value: 4.0, unit: "%", prevValue: 3.9, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [3.7, 3.8, 3.8, 3.9, 3.9, 4.0], description: "就业市场滞后。" },
  { id: "lfpr", nameEn: "Labor Force Participation", nameZh: "劳动参与率", timing: "lagging", sector: "household", value: 62.6, unit: "%", prevValue: 62.5, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [62.3, 62.4, 62.4, 62.5, 62.5, 62.6], description: "供给端滞后。" },
  { id: "real-dpi", nameEn: "Real Disposable Income", nameZh: "实际可支配个人收入", timing: "lagging", sector: "household", value: 2.2, unit: "YoY%", prevValue: 2.0, releaseFreq: "月度", asOfDate: "2026-05", source: "BEA", sparkline: [1.5, 1.6, 1.8, 1.9, 2.0, 2.2], description: "购买力滞后。" },
  // Fiscal
  { id: "fed-deficit-12m", nameEn: "Federal Deficit (12m rolling)", nameZh: "滚动12月联邦赤字", timing: "leading", sector: "fiscal", value: 1.82, unit: "万亿美元", prevValue: 1.78, releaseFreq: "月度", asOfDate: "2026-05", source: "Treasury", sparkline: [1.65, 1.70, 1.72, 1.75, 1.78, 1.82], description: "财政立场领先信号。" },
  { id: "fed-contracts", nameEn: "Federal Contract Awards", nameZh: "联邦新签合同", timing: "leading", sector: "fiscal", value: 42.5, unit: "十亿美元/月", prevValue: 40.2, releaseFreq: "月度", asOfDate: "2026-05", source: "USASpending", sparkline: [38, 39, 40, 40.5, 40.2, 42.5], description: "财政支出前瞻。" },
  { id: "fed-expend", nameEn: "Federal Current Expenditures", nameZh: "联邦当期支出", timing: "coincident", sector: "fiscal", value: 6.8, unit: "YoY%", prevValue: 6.5, releaseFreq: "月度", asOfDate: "2026-05", source: "BEA", sparkline: [5.5, 5.8, 6.0, 6.2, 6.5, 6.8], description: "财政支出同步。" },
  { id: "sl-spending", nameEn: "State & Local Spending", nameZh: "州和地方支出", timing: "coincident", sector: "fiscal", value: 3.4, unit: "YoY%", prevValue: 3.2, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BEA", sparkline: [2.8, 2.9, 3.0, 3.1, 3.2, 3.4], description: "地方财政同步。" },
  { id: "fed-debt-gdp", nameEn: "Federal Debt / GDP", nameZh: "联邦债务/GDP", timing: "lagging", sector: "fiscal", value: 98.2, unit: "%", prevValue: 97.5, releaseFreq: "季度", asOfDate: "2026-Q1", source: "OMB/CBO", sparkline: [96, 96.5, 97, 97.2, 97.5, 98.2], description: "财政可持续性滞后。" },
  { id: "primary-balance", nameEn: "Primary Surplus/Deficit", nameZh: "初级财政余额", timing: "lagging", sector: "fiscal", value: -2.8, unit: "% GDP", prevValue: -2.6, releaseFreq: "年度", asOfDate: "FY2025", source: "CBO", sparkline: [-2.2, -2.3, -2.4, -2.5, -2.6, -2.8], description: "剔除利息后的财政。" },
  { id: "interest-rev", nameEn: "Interest / Federal Revenue", nameZh: "利息/财政收入", timing: "lagging", sector: "fiscal", value: 18.5, unit: "%", prevValue: 17.8, releaseFreq: "年度", asOfDate: "FY2025", source: "Treasury", sparkline: [15, 16, 16.5, 17, 17.8, 18.5], description: "利息负担滞后。" },
  // Monetary
  { id: "ff-futures", nameEn: "Fed Funds Futures Path", nameZh: "联邦基金利率期货路径", timing: "leading", sector: "monetary", value: 4.25, unit: "% EOY", prevValue: 4.50, releaseFreq: "日度", asOfDate: "2026-07-03", source: "CME", sparkline: [5.0, 4.75, 4.50, 4.40, 4.50, 4.25], description: "市场隐含政策路径。" },
  { id: "breakeven-5y5y", nameEn: "5y5y Forward Inflation", nameZh: "5y5y 远期通胀预期", timing: "leading", sector: "monetary", value: 2.35, unit: "%", prevValue: 2.28, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Fed/Treasury", sparkline: [2.10, 2.15, 2.18, 2.22, 2.28, 2.35], description: "长期通胀预期。" },
  { id: "ust-2y", nameEn: "2-Year Treasury Yield", nameZh: "2年期国债收益率", timing: "leading", sector: "monetary", value: 4.42, unit: "%", prevValue: 4.55, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Treasury", sparkline: [4.80, 4.70, 4.60, 4.55, 4.55, 4.42], description: "短端政策预期。" },
  { id: "eff-ffr", nameEn: "Effective Fed Funds Rate", nameZh: "有效联邦基金利率", timing: "coincident", sector: "monetary", value: 4.58, unit: "%", prevValue: 4.58, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Fed", sparkline: [5.33, 5.08, 4.83, 4.58, 4.58, 4.58], description: "当前政策利率。" },
  { id: "fed-bs", nameEn: "Fed Balance Sheet", nameZh: "联储资产负债表", timing: "coincident", sector: "monetary", value: 7.12, unit: "万亿美元", prevValue: 7.18, releaseFreq: "周度", asOfDate: "2026-06-25", source: "Fed", sparkline: [7.50, 7.40, 7.30, 7.22, 7.18, 7.12], description: "QT 同步。" },
  { id: "real-policy-rate", nameEn: "Real Policy Rate", nameZh: "实际政策利率", timing: "coincident", sector: "monetary", value: 2.18, unit: "%", prevValue: 2.28, releaseFreq: "月度", asOfDate: "2026-05", source: "Fed/BEA", sparkline: [2.80, 2.60, 2.45, 2.35, 2.28, 2.18], description: "FFR - Core PCE。" },
  { id: "core-pce", nameEn: "Core PCE YoY", nameZh: "核心 PCE 同比", timing: "lagging", sector: "monetary", value: 2.4, unit: "YoY%", prevValue: 2.5, releaseFreq: "月度", asOfDate: "2026-05", source: "BEA", sparkline: [2.8, 2.7, 2.6, 2.55, 2.5, 2.4], description: "Fed 2% 目标锚。" },
  { id: "core-cpi", nameEn: "Core CPI YoY", nameZh: "核心 CPI 同比", timing: "lagging", sector: "monetary", value: 3.1, unit: "YoY%", prevValue: 3.2, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [3.6, 3.5, 3.4, 3.3, 3.2, 3.1], description: "通胀滞后确认。" },
  { id: "eci-yoy", nameEn: "ECI YoY", nameZh: "雇佣成本指数同比", timing: "lagging", sector: "monetary", value: 3.8, unit: "YoY%", prevValue: 3.9, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BLS", sparkline: [4.2, 4.1, 4.0, 3.95, 3.9, 3.8], description: "工资-物价滞后。" },
  // External
  { id: "ism-export", nameEn: "ISM New Export Orders", nameZh: "ISM 新出口订单", timing: "leading", sector: "external", value: 49.8, unit: "指数", prevValue: 48.5, releaseFreq: "月度", asOfDate: "2026-06", source: "ISM", sparkline: [46, 47, 48, 48.2, 48.5, 49.8], description: "外需领先。" },
  { id: "usd-broad", nameEn: "USD Broad Trade-Weighted", nameZh: "美元广义贸易加权指数", timing: "leading", sector: "external", value: 126.4, unit: "指数", prevValue: 125.8, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Fed", sparkline: [122, 123, 124, 125, 125.8, 126.4], description: "汇率领先变量。" },
  { id: "goods-trade", nameEn: "Goods Trade Balance", nameZh: "商品贸易差额", timing: "coincident", sector: "external", value: -92.5, unit: "十亿美元", prevValue: -91.2, releaseFreq: "月度", asOfDate: "2026-05", source: "Census", sparkline: [-88, -89, -90, -90.5, -91.2, -92.5], description: "贸易同步。" },
  { id: "current-acct", nameEn: "Current Account Balance", nameZh: "经常账户", timing: "coincident", sector: "external", value: -3.2, unit: "% GDP", prevValue: -3.1, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BEA", sparkline: [-2.8, -2.9, -3.0, -3.05, -3.1, -3.2], description: "外部均衡同步。" },
  { id: "niip", nameEn: "Net International Investment Position", nameZh: "净国际投资头寸", timing: "lagging", sector: "external", value: -22.8, unit: "万亿美元", prevValue: -22.5, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BEA", sparkline: [-21.5, -21.8, -22.0, -22.2, -22.5, -22.8], description: "对外净资产滞后。" },
  { id: "terms-trade", nameEn: "Terms of Trade Index", nameZh: "贸易条件指数", timing: "lagging", sector: "external", value: 98.2, unit: "指数", prevValue: 99.0, releaseFreq: "季度", asOfDate: "2026-Q1", source: "BEA", sparkline: [100, 99.5, 99.2, 99.0, 99.0, 98.2], description: "进出口价格比滞后。" },
  // Inflation cross-cut
  { id: "supercore", nameEn: "Supercore (Svc ex-housing)", nameZh: "Supercore 服务（除住房）", timing: "coincident", sector: "inflation", value: 3.4, unit: "YoY%", prevValue: 3.5, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [4.0, 3.8, 3.7, 3.6, 3.5, 3.4], description: "联储关注粘性通胀。" },
  { id: "sticky-cpi", nameEn: "Atlanta Fed Sticky CPI", nameZh: "Sticky CPI", timing: "lagging", sector: "inflation", value: 3.6, unit: "YoY%", prevValue: 3.7, releaseFreq: "月度", asOfDate: "2026-06", source: "Atlanta Fed", sparkline: [4.0, 3.9, 3.8, 3.75, 3.7, 3.6], description: "粘性价格分项。" },
  { id: "flexible-cpi", nameEn: "Atlanta Fed Flexible CPI", nameZh: "Flexible CPI", timing: "leading", sector: "inflation", value: 1.8, unit: "YoY%", prevValue: 2.0, releaseFreq: "月度", asOfDate: "2026-06", source: "Atlanta Fed", sparkline: [2.5, 2.3, 2.2, 2.1, 2.0, 1.8], description: "灵活价格分项。" },
  { id: "breakeven-5y", nameEn: "Breakeven Inflation 5Y", nameZh: "5Y 盈亏平衡通胀", timing: "leading", sector: "inflation", value: 2.28, unit: "%", prevValue: 2.22, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Treasury", sparkline: [2.10, 2.12, 2.15, 2.18, 2.22, 2.28], description: "市场通胀预期。" },
  { id: "breakeven-10y", nameEn: "Breakeven Inflation 10Y", nameZh: "10Y 盈亏平衡通胀", timing: "leading", sector: "inflation", value: 2.32, unit: "%", prevValue: 2.26, releaseFreq: "日度", asOfDate: "2026-07-03", source: "Treasury", sparkline: [2.15, 2.18, 2.20, 2.23, 2.26, 2.32], description: "长期通胀预期。" },
  { id: "headline-cpi", nameEn: "Headline CPI YoY", nameZh: "Headline CPI 同比", timing: "lagging", sector: "inflation", value: 2.9, unit: "YoY%", prevValue: 3.0, releaseFreq: "月度", asOfDate: "2026-06", source: "BLS", sparkline: [3.5, 3.3, 3.2, 3.1, 3.0, 2.9], description: "总体通胀滞后。" },
  { id: "wti", nameEn: "WTI Crude Oil", nameZh: "WTI 原油", timing: "leading", sector: "inflation", value: 78.5, unit: "$/bbl", prevValue: 72.0, releaseFreq: "日度", asOfDate: "2026-07-03", source: "NYMEX", sparkline: [68, 70, 72, 74, 72, 78.5], description: "供给冲击来源。" },
];

const SIC_INDUSTRIES: SicIndustryRow[] = [
  { sicRange: "01-09", nameZh: "农林渔", nameEn: "Agriculture", cycleTag: "defensive", mockOutputYoY: 1.2, mockEmploymentYoY: 0.5 },
  { sicRange: "10-14", nameZh: "采矿", nameEn: "Mining", cycleTag: "cyclical", mockOutputYoY: 3.8, mockEmploymentYoY: 2.1 },
  { sicRange: "15-17", nameZh: "建筑", nameEn: "Construction", cycleTag: "cyclical", mockOutputYoY: 2.5, mockEmploymentYoY: 1.8 },
  { sicRange: "20-39", nameZh: "制造业综合", nameEn: "Manufacturing", cycleTag: "cyclical", mockOutputYoY: 1.8, mockEmploymentYoY: 0.6 },
  { sicRange: "20-21", nameZh: "食品", nameEn: "Food", cycleTag: "defensive", mockOutputYoY: 1.5, mockEmploymentYoY: 0.8 },
  { sicRange: "22-23", nameZh: "纺织 / Apparel", nameEn: "Textiles", cycleTag: "cyclical", mockOutputYoY: -0.5, mockEmploymentYoY: -1.2 },
  { sicRange: "28", nameZh: "化工", nameEn: "Chemicals", cycleTag: "mixed", mockOutputYoY: 1.0, mockEmploymentYoY: 0.3 },
  { sicRange: "29", nameZh: "石油炼制", nameEn: "Petroleum Refining", cycleTag: "cyclical", mockOutputYoY: 4.2, mockEmploymentYoY: 0.2 },
  { sicRange: "34", nameZh: "金属制品", nameEn: "Fabricated Metals", cycleTag: "cyclical", mockOutputYoY: 2.2, mockEmploymentYoY: 1.0 },
  { sicRange: "35-36", nameZh: "机械 / 电子", nameEn: "Machinery & Electronics", cycleTag: "growth", mockOutputYoY: 3.5, mockEmploymentYoY: 1.5 },
  { sicRange: "37", nameZh: "运输设备", nameEn: "Transportation Equipment", cycleTag: "cyclical", mockOutputYoY: 1.2, mockEmploymentYoY: 0.4 },
  { sicRange: "38-39", nameZh: "仪器制造", nameEn: "Instruments", cycleTag: "growth", mockOutputYoY: 4.0, mockEmploymentYoY: 2.0 },
  { sicRange: "40-42,44-45", nameZh: "运输", nameEn: "Transportation", cycleTag: "cyclical", mockOutputYoY: 2.8, mockEmploymentYoY: 1.2 },
  { sicRange: "48", nameZh: "通信", nameEn: "Communications", cycleTag: "growth", mockOutputYoY: 3.2, mockEmploymentYoY: 0.9 },
  { sicRange: "49", nameZh: "公用事业", nameEn: "Utilities", cycleTag: "defensive", mockOutputYoY: 0.8, mockEmploymentYoY: 0.2 },
  { sicRange: "50-51", nameZh: "批发", nameEn: "Wholesale Trade", cycleTag: "cyclical", mockOutputYoY: 1.6, mockEmploymentYoY: 0.5 },
  { sicRange: "52-59", nameZh: "零售", nameEn: "Retail Trade", cycleTag: "cyclical", mockOutputYoY: 2.0, mockEmploymentYoY: 0.7 },
  { sicRange: "60-67", nameZh: "金融保险房地产", nameEn: "Finance & Real Estate", cycleTag: "cyclical", mockOutputYoY: 2.4, mockEmploymentYoY: 1.1 },
  { sicRange: "73-74", nameZh: "商业 / IT 服务", nameEn: "Business & IT Services", cycleTag: "growth", mockOutputYoY: 4.5, mockEmploymentYoY: 2.8 },
  { sicRange: "80", nameZh: "健康服务", nameEn: "Health Services", cycleTag: "defensive", mockOutputYoY: 2.8, mockEmploymentYoY: 2.2 },
];

const SCENARIOS: TransmissionScenario[] = [
  {
    id: "A",
    titleZh: "A · 货币收紧",
    descriptionZh: "通胀仍高于目标、就业偏强 → FOMC 维持限制性利率 → 信贷收紧 → 实体放缓 → 通胀回落",
    nodes: [
      { id: "core-pce", labelZh: "Core PCE↑", type: "indicator" },
      { id: "payrolls", labelZh: "非农强", type: "indicator" },
      { id: "fomc", labelZh: "FOMC 高利率", type: "policy" },
      { id: "spread-2s10", labelZh: "2s10s / HY OAS↑", type: "indicator" },
      { id: "ci-loans", labelZh: "C&I 收紧", type: "indicator" },
      { id: "ism-orders", labelZh: "ISM 新订单↓", type: "indicator" },
      { id: "ind-prod", labelZh: "工业产出↓", type: "indicator" },
      { id: "unemployment", labelZh: "失业率↑", type: "indicator" },
      { id: "core-pce-2", labelZh: "Core PCE↓", type: "indicator" },
    ],
    edges: [
      { from: "core-pce", to: "fomc", channel: "expectations", lagMonths: "0-1", label: "通胀超目标" },
      { from: "payrolls", to: "fomc", channel: "expectations", lagMonths: "0-1", label: "就业强" },
      { from: "fomc", to: "spread-2s10", channel: "interest_rate", lagMonths: "0-3" },
      { from: "spread-2s10", to: "ci-loans", channel: "credit", lagMonths: "3-6" },
      { from: "ci-loans", to: "ism-orders", channel: "credit", lagMonths: "3-6" },
      { from: "ism-orders", to: "ind-prod", channel: "interest_rate", lagMonths: "3-6" },
      { from: "ind-prod", to: "unemployment", channel: "interest_rate", lagMonths: "6-12" },
      { from: "unemployment", to: "core-pce-2", channel: "interest_rate", lagMonths: "6-12" },
    ],
  },
  {
    id: "B",
    titleZh: "B · 财政扩张",
    descriptionZh: "赤字扩大 + 转移支付 → 消费↑ → 利润↑ → 投资↑ → 就业↑ → 通胀预期↑ → Fed 反应",
    nodes: [
      { id: "fed-deficit-12m", labelZh: "赤字↑", type: "policy" },
      { id: "real-dpi", labelZh: "实际可支配收入↑", type: "indicator" },
      { id: "pce", labelZh: "零售/PCE↑", type: "indicator" },
      { id: "corp-profits", labelZh: "企业利润↑", type: "indicator" },
      { id: "nonres-construct", labelZh: "非住宅营建↑", type: "indicator" },
      { id: "payrolls", labelZh: "非农↑", type: "indicator" },
      { id: "breakeven-5y5y", labelZh: "通胀预期↑", type: "indicator" },
      { id: "fomc", labelZh: "Fed 反应", type: "policy" },
    ],
    edges: [
      { from: "fed-deficit-12m", to: "real-dpi", channel: "wealth", lagMonths: "1-3" },
      { from: "real-dpi", to: "pce", channel: "wealth", lagMonths: "1-3" },
      { from: "pce", to: "corp-profits", channel: "interest_rate", lagMonths: "3-6" },
      { from: "corp-profits", to: "nonres-construct", channel: "credit", lagMonths: "6-12" },
      { from: "nonres-construct", to: "payrolls", channel: "interest_rate", lagMonths: "6-12" },
      { from: "payrolls", to: "breakeven-5y5y", channel: "expectations", lagMonths: "3-6" },
      { from: "breakeven-5y5y", to: "fomc", channel: "expectations", lagMonths: "3-6" },
    ],
  },
  {
    id: "C",
    titleZh: "C · 油价供给冲击",
    descriptionZh: "WTI 上涨 → Headline CPI↑ → 实际收入↓ → 信心↓ → 零售放缓 → Fed 两难",
    nodes: [
      { id: "wti", labelZh: "WTI↑", type: "shock" },
      { id: "headline-cpi", labelZh: "Headline CPI↑", type: "indicator" },
      { id: "real-dpi", labelZh: "实际收入↓", type: "indicator" },
      { id: "michigan-sent", labelZh: "信心↓", type: "indicator" },
      { id: "retail-ex-auto", labelZh: "零售放缓", type: "indicator" },
      { id: "fomc", labelZh: "Fed 两难", type: "policy" },
    ],
    edges: [
      { from: "wti", to: "headline-cpi", channel: "exchange_rate", lagMonths: "0-1" },
      { from: "headline-cpi", to: "real-dpi", channel: "wealth", lagMonths: "1-3" },
      { from: "real-dpi", to: "michigan-sent", channel: "wealth", lagMonths: "1-3" },
      { from: "michigan-sent", to: "retail-ex-auto", channel: "expectations", lagMonths: "3-6" },
      { from: "retail-ex-auto", to: "fomc", channel: "expectations", lagMonths: "3-6" },
    ],
  },
  {
    id: "D",
    titleZh: "D · 信贷紧缩",
    descriptionZh: "NFCI 偏紧 + SLOOS 收紧 → C&I↓ → 周期行业产出下滑 → 违约↑ → 净财富↓",
    nodes: [
      { id: "nfci", labelZh: "NFCI↑", type: "indicator" },
      { id: "sloos", labelZh: "SLOOS 收紧", type: "indicator" },
      { id: "ci-loans", labelZh: "C&I↓", type: "indicator" },
      { id: "sic-cyclical", labelZh: "周期 SIC 产出↓", type: "indicator" },
      { id: "charge-off", labelZh: "HY 违约↑", type: "indicator" },
      { id: "hh-net-worth", labelZh: "净财富↓", type: "indicator" },
    ],
    edges: [
      { from: "nfci", to: "ci-loans", channel: "credit", lagMonths: "0-3" },
      { from: "sloos", to: "ci-loans", channel: "credit", lagMonths: "3-6" },
      { from: "ci-loans", to: "sic-cyclical", channel: "credit", lagMonths: "3-6" },
      { from: "sic-cyclical", to: "charge-off", channel: "credit", lagMonths: "6-12" },
      { from: "charge-off", to: "hh-net-worth", channel: "wealth", lagMonths: "6-12" },
    ],
  },
];

const CALENDAR = [
  { date: "2026-07-07", event: "JOLTS 职位空缺", impact: "高" },
  { date: "2026-07-10", event: "CPI（6月）", impact: "高" },
  { date: "2026-07-11", event: "PPI（6月）", impact: "中" },
  { date: "2026-07-15", event: "Retail Sales（6月）", impact: "高" },
  { date: "2026-07-16", event: "Industrial Production", impact: "中" },
  { date: "2026-07-17", event: "Jobless Claims", impact: "中" },
  { date: "2026-07-29", event: "FOMC 利率决议", impact: "高" },
];

const IND_BY_ID = Object.fromEntries(INDICATORS.map((i) => [i.id, i]));

const SECTOR_LABEL: Record<Sector, string> = {
  corporate: "企业部门",
  financial: "金融部门",
  household: "居民部门",
  fiscal: "政府（财政）",
  monetary: "央行（货币）",
  external: "外部门",
  inflation: "通胀横切",
};

const TIMING_LABEL: Record<IndicatorTiming, string> = {
  leading: "领先",
  coincident: "同步",
  lagging: "滞后",
};

const CHANNEL_LABEL: Record<TransmissionChannel, string> = {
  interest_rate: "利率",
  credit: "信贷",
  exchange_rate: "汇率",
  wealth: "财富",
  expectations: "预期",
};

const CYCLE_LABEL: Record<IndustryCycleTag, string> = {
  cyclical: "周期",
  growth: "成长",
  defensive: "防御",
  mixed: "混合",
};

// Map transmission node ids to indicator ids for bidirectional highlight
const NODE_TO_INDICATOR: Record<string, string> = {
  "core-pce": "core-pce",
  "core-pce-2": "core-pce",
  payrolls: "payrolls",
  fomc: "eff-ffr",
  "spread-2s10": "spread-2s10",
  "ci-loans": "ci-loans",
  "ism-orders": "ism-orders",
  "ind-prod": "ind-prod",
  unemployment: "unemployment",
  "fed-deficit-12m": "fed-deficit-12m",
  "real-dpi": "real-dpi",
  pce: "pce",
  "corp-profits": "corp-profits",
  "nonres-construct": "nonres-construct",
  "breakeven-5y5y": "breakeven-5y5y",
  wti: "wti",
  "headline-cpi": "headline-cpi",
  "michigan-sent": "michigan-sent",
  "retail-ex-auto": "retail-ex-auto",
  nfci: "nfci",
  sloos: "sloos",
  "sic-cyclical": "ind-prod",
  "charge-off": "charge-off",
  "hh-net-worth": "hh-net-worth",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function changeArrow(cur: number, prev: number): string {
  const d = cur - prev;
  if (Math.abs(d) < 0.01) return "→";
  return d > 0 ? "↑" : "↓";
}

function formatValue(v: number, unit: string): string {
  if (unit === "%" || unit.includes("%")) return `${v.toFixed(1)}%`;
  if (unit === "bp") return `${v} bp`;
  if (unit === "指数") return v.toFixed(1);
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(2);
}

function sparklinePath(data: number[], w: number, h: number): string {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function UsMacroFrameworkPreview() {
  const theme = useHostTheme();
  const [activeSector, setActiveSector] = useCanvasState<Sector | "all">("sector", "all");
  const [activeScenario, setActiveScenario] = useCanvasState<ScenarioId>("scenario", "A");
  const [selectedId, setSelectedId] = useCanvasState<string | null>("selected", null);
  const [sicFilter, setSicFilter] = useCanvasState<IndustryCycleTag | "all">("sicFilter", "all");
  const [animStep, setAnimStep] = useCanvasState<number>("animStep", -1);
  const [animPlaying, setAnimPlaying] = useCanvasState<boolean>("animPlaying", false);
  const [viewTab, setViewTab] = useCanvasState<"matrix" | "inflation">("viewTab", "matrix");

  const timingColor = (t: IndicatorTiming) =>
    t === "leading" ? theme.category.cyan : t === "coincident" ? theme.category.yellow : theme.category.pink;

  const cycleColor = (c: IndustryCycleTag) => {
    if (c === "cyclical") return theme.category.orange;
    if (c === "growth") return theme.category.blue;
    if (c === "defensive") return theme.category.green;
    return theme.text.tertiary;
  };

  const scenario = SCENARIOS.find((s) => s.id === activeScenario)!;

  const filteredIndicators = INDICATORS.filter((i) => {
    if (viewTab === "inflation") return i.sector === "inflation";
    if (activeSector === "all") return i.sector !== "inflation";
    return i.sector === activeSector;
  });

  const playAnimation = () => {
    setAnimPlaying(true);
    setAnimStep(-1);
    let step = 0;
    const total = scenario.edges.length;
    const interval = setInterval(() => {
      setAnimStep(step);
      step++;
      if (step > total) {
        clearInterval(interval);
        setAnimPlaying(false);
      }
    }, 400);
  };

  const highlightIds = new Set<string>();
  if (selectedId) {
    highlightIds.add(selectedId);
    const nodeId = Object.entries(NODE_TO_INDICATOR).find(([, v]) => v === selectedId)?.[0];
    if (nodeId) highlightIds.add(nodeId);
  }

  const taylorImplied = 2.5 + 2.4 + 0.5 * (2.4 - 2.0) + 0.5 * 0.8;
  const taylorActual = 4.58;
  const taylorGap = taylorActual - taylorImplied;
  const taylorStance = taylorGap > 0.5 ? "过紧" : taylorGap < -0.5 ? "过松" : "合适";

  return (
    <Stack gap={16} style={{ padding: 20, background: theme.bg.editor, minHeight: "100%" }}>
      {/* Layer 0 */}
      <Stack gap={4}>
        <H1>美国宏观分析框架</H1>
        <Text tone="secondary" size="small">
          领先 / 同步 / 滞后指标 × 六部门 · 政策传导动态路径 · 数据截至 2026-07-03（mock）
        </Text>
      </Stack>

      <Grid columns={6} gap={8}>
        <Stat label="周期阶段" value="晚期扩张" />
        <Stat label="GDPNow" value="+2.1%" tone="success" />
        <Stat label="衰退概率 (12M)" value="28%" tone="warning" />
        <Stat label="领先扩散指数" value="62%" tone="success" />
        <Stat label="政策组合" value="紧货币·中性财政" />
        <Stat label="NFCI" value="+0.32σ" tone="warning" />
      </Grid>

      <Row gap={8} wrap align="center">
        <Row gap={6} align="center"><Swatch color="cyan" /><Text size="small">领先</Text></Row>
        <Row gap={6} align="center"><Swatch color="yellow" /><Text size="small">同步</Text></Row>
        <Row gap={6} align="center"><Swatch color="pink" /><Text size="small">滞后</Text></Row>
        <Text tone="tertiary">|</Text>
        <Row gap={6} align="center"><Swatch color="orange" /><Text size="small">周期</Text></Row>
        <Row gap={6} align="center"><Swatch color="blue" /><Text size="small">成长</Text></Row>
        <Row gap={6} align="center"><Swatch color="green" /><Text size="small">防御</Text></Row>
        <Row gap={6} align="center"><Swatch color="purple" /><Text size="small">政策</Text></Row>
      </Row>

      {/* Layer 2 — Transmission (prominent) */}
      <Card>
        <CardHeader
          trailing={
            <Row gap={8}>
              {SCENARIOS.map((s) => (
                <span key={s.id}>
                  <Pill active={activeScenario === s.id} onClick={() => { setActiveScenario(s.id); setAnimStep(-1); }}>
                    {s.titleZh}
                  </Pill>
                </span>
              ))}
              <Button variant="secondary" onClick={playAnimation} disabled={animPlaying}>
                {animPlaying ? "播放中…" : "播放传导"}
              </Button>
            </Row>
          }
        >
          政策—指标传导路径
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          <Text tone="secondary" size="small" style={{ padding: "8px 16px" }}>{scenario.descriptionZh}</Text>
          <TransmissionDiagram
            scenario={scenario}
            animStep={animStep}
            selectedId={selectedId}
            onSelectNode={(id) => {
              const indId = NODE_TO_INDICATOR[id] ?? id;
              setSelectedId(selectedId === indId ? null : indId);
            }}
            theme={theme}
          />
        </CardBody>
      </Card>

      {/* Taylor Rule */}
      <Card>
        <CardHeader trailing={<Pill tone={taylorStance === "过紧" ? "warning" : taylorStance === "过松" ? "info" : "success"}>{taylorStance}</Pill>}>
          Taylor Rule（mock）
        </CardHeader>
        <CardBody>
          <Row gap={24} wrap>
            <Text size="small" style={{ fontFamily: "monospace" }}>
              i* = r* + π + 0.5(π − 2%) + 0.5(output gap)
            </Text>
            <Text size="small">隐含利率 {taylorImplied.toFixed(2)}% · 实际 FFR {taylorActual}% · 偏差 {taylorGap > 0 ? "+" : ""}{taylorGap.toFixed(2)}pp</Text>
            <Text size="small" tone="tertiary">r*=2.5% · π=Core PCE 2.4% · output gap=+0.8%</Text>
          </Row>
        </CardBody>
      </Card>

      {/* Layer 1 — Matrix tabs */}
      <Row gap={8} wrap>
        <Pill active={viewTab === "matrix"} onClick={() => setViewTab("matrix")}>指标矩阵</Pill>
        <Pill active={viewTab === "inflation"} onClick={() => setViewTab("inflation")}>通胀横切</Pill>
        {viewTab === "matrix" && (
          <>
            <Pill active={activeSector === "all"} onClick={() => setActiveSector("all")}>全部部门</Pill>
            {(Object.keys(SECTOR_LABEL) as Sector[]).filter((s) => s !== "inflation").map((s) => (
              <Pill key={s} active={activeSector === s} onClick={() => setActiveSector(s)}>{SECTOR_LABEL[s]}</Pill>
            ))}
          </>
        )}
      </Row>

      {viewTab === "matrix" && activeSector === "corporate" && (
        <CollapsibleSection title="企业 SIC 行业分类（周期 / 成长 / 防御）" defaultOpen>
          <Stack gap={8}>
            <Row gap={8}>
              {(["all", "cyclical", "growth", "defensive", "mixed"] as const).map((f) => (
                <Pill key={f} active={sicFilter === f} onClick={() => setSicFilter(f)}>
                  {f === "all" ? "全部" : CYCLE_LABEL[f]}
                </Pill>
              ))}
            </Row>
            <Table
              headers={["SIC", "行业", "分类", "产出 YoY", "就业 YoY"]}
              columnAlign={["left", "left", "left", "right", "right"]}
              rows={SIC_INDUSTRIES.filter((r) => sicFilter === "all" || r.cycleTag === sicFilter).map((r) => [
                r.sicRange,
                `${r.nameZh} (${r.nameEn})`,
                CYCLE_LABEL[r.cycleTag],
                `${r.mockOutputYoY > 0 ? "+" : ""}${r.mockOutputYoY.toFixed(1)}%`,
                `${r.mockEmploymentYoY > 0 ? "+" : ""}${r.mockEmploymentYoY.toFixed(1)}%`,
              ])}
            />
          </Stack>
        </CollapsibleSection>
      )}

      {/* Indicator grid by timing */}
      {viewTab === "matrix" ? (
        <Grid columns={3} gap={12}>
          {(["leading", "coincident", "lagging"] as IndicatorTiming[]).map((timing) => (
            <Stack key={timing} gap={8}>
              <Row gap={8} align="center">
                <div style={{ width: 8, height: 8, borderRadius: 4, background: timingColor(timing) }} />
                <H3>{TIMING_LABEL[timing]}指标</H3>
              </Row>
              {filteredIndicators
                .filter((i) => i.timing === timing)
                .map((ind) => (
                  <IndicatorCard
                    key={ind.id}
                    ind={ind}
                    selected={selectedId === ind.id}
                    highlighted={highlightIds.has(ind.id)}
                    onClick={() => setSelectedId(selectedId === ind.id ? null : ind.id)}
                    accent={timingColor(timing)}
                    theme={theme}
                  />
                ))}
            </Stack>
          ))}
        </Grid>
      ) : (
        <Grid columns={3} gap={12}>
          {filteredIndicators.map((ind) => (
            <IndicatorCard
              key={ind.id}
              ind={ind}
              selected={selectedId === ind.id}
              highlighted={highlightIds.has(ind.id)}
              onClick={() => setSelectedId(selectedId === ind.id ? null : ind.id)}
              accent={timingColor(ind.timing)}
              theme={theme}
            />
          ))}
        </Grid>
      )}

      {/* Detail drawer */}
      {selectedId && IND_BY_ID[selectedId] ? (
        <Callout tone="info" title={`${IND_BY_ID[selectedId].nameZh} · ${IND_BY_ID[selectedId].nameEn}`}>
          <Stack gap={4}>
            <Text size="small">{IND_BY_ID[selectedId].description}</Text>
            <Text size="small" tone="tertiary">
              {TIMING_LABEL[IND_BY_ID[selectedId].timing]} · {SECTOR_LABEL[IND_BY_ID[selectedId].sector]} · {IND_BY_ID[selectedId].source} · {IND_BY_ID[selectedId].asOfDate} · {IND_BY_ID[selectedId].releaseFreq}
            </Text>
          </Stack>
        </Callout>
      ) : null}

      {/* Layer 3 — Financial conditions */}
      <Card>
        <CardHeader>金融条件与杠杆</CardHeader>
        <CardBody>
          <Grid columns={4} gap={16}>
            <Stack gap={4}>
              <Text size="small" tone="secondary">Chicago Fed NFCI</Text>
              <Text weight="semibold">+0.32σ（偏紧）</Text>
              <UsageBar total={100} segments={[{ id: "tight", value: 66, color: "orange" }, { id: "rest", value: 34, color: "gray" }]} />
            </Stack>
            <Stack gap={4}>
              <Text size="small" tone="secondary">家庭债务 / GDP</Text>
              <Text weight="semibold">75%</Text>
              <UsageBar total={100} segments={[{ id: "hh", value: 75, color: "yellow" }, { id: "hh-rest", value: 25, color: "gray" }]} />
            </Stack>
            <Stack gap={4}>
              <Text size="small" tone="secondary">非金融企业债务 / GDP</Text>
              <Text weight="semibold">52%</Text>
              <UsageBar total={100} segments={[{ id: "corp", value: 52, color: "green" }, { id: "corp-rest", value: 48, color: "gray" }]} />
            </Stack>
            <Stack gap={4}>
              <Text size="small" tone="secondary">联邦债务 / GDP</Text>
              <Text weight="semibold">98.2%</Text>
              <UsageBar total={100} segments={[{ id: "fed", value: 85, color: "orange" }, { id: "fed-rest", value: 15, color: "gray" }]} />
            </Stack>
          </Grid>
        </CardBody>
      </Card>

      {/* Layer 4 — Scenarios & consistency */}
      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader>三情景展望（2026H2 mock）</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Row gap={8} align="center">
                <Pill tone="success">Baseline</Pill>
                <Text size="small">软着陆：Core PCE → 2.2%，GDP +1.8%，失业率 4.2%</Text>
              </Row>
              <Row gap={8} align="center">
                <Pill tone="info">Upside</Pill>
                <Text size="small">AI 资本开支推动：GDP +2.8%，通胀粘性 2.6%</Text>
              </Row>
              <Row gap={8} align="center">
                <Pill tone="warning">Downside</Pill>
                <Text size="small">信贷事件：GDP +0.5%，失业率 5.0%，HY OAS 550bp</Text>
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>矛盾信号检测</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Callout tone="warning" title="软数据 vs 硬数据背离">
                ISM PMI 52.4（&gt;50）但 Industrial Production 3 个月环比停滞
              </Callout>
              <Callout tone="warning" title="就业 vs 信心背离">
                失业率 4.0% 低位，但 Michigan Sentiment 68.5 仍低于长期均值
              </Callout>
              <Callout tone="success" title="金融条件一致">
                HY OAS 412bp 与 NFCI +0.32σ 同向走阔，信贷渠道收紧信号一致
              </Callout>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader trailing={<Text size="small" tone="tertiary">未来 7 天</Text>}>数据日历</CardHeader>
        <CardBody style={{ padding: 0 }}>
          <Table
            headers={["日期", "事件", "影响"]}
            rows={CALENDAR.map((c) => [c.date, c.event, c.impact])}
          />
        </CardBody>
      </Card>
    </Stack>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function IndicatorCard(props: {
  ind: MacroIndicator;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
  accent: string;
  theme: ReturnType<typeof useHostTheme>;
}) {
  const { ind, selected, highlighted, onClick, accent, theme } = props;
  const chg = changeArrow(ind.value, ind.prevValue);

  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${selected || highlighted ? accent : theme.stroke.primary}`,
        background: selected ? theme.fill.secondary : theme.bg.elevated,
        cursor: "pointer",
        opacity: highlighted && !selected ? 0.95 : 1,
      }}
    >
      <Stack gap={6}>
        <Row gap={8} align="center">
          <div style={{ width: 3, height: 28, borderRadius: 2, background: accent, flexShrink: 0 }} />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text size="small" weight="semibold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ind.nameZh}
            </Text>
            <Text size="small" tone="tertiary" style={{ fontFamily: "monospace", fontSize: 11 }}>
              {ind.nameEn}
            </Text>
          </Stack>
        </Row>
        <Row gap={8} align="baseline">
          <Text weight="semibold">{formatValue(ind.value, ind.unit)}</Text>
          <Text
            size="small"
            tone="tertiary"
            style={{ color: chg === "↑" ? theme.category.green : chg === "↓" ? theme.category.pink : undefined }}
          >
            {chg}
          </Text>
          <Text size="small" tone="tertiary">{ind.asOfDate}</Text>
        </Row>
        <svg width="100%" height={24} viewBox="0 0 80 24" preserveAspectRatio="none" style={{ display: "block" }}>
          <path d={sparklinePath(ind.sparkline, 80, 24)} fill="none" stroke={accent} strokeWidth={1.5} />
        </svg>
      </Stack>
    </div>
  );
}

const TX_NODE_W = 130;
const TX_NODE_H = 44;

function TransmissionDiagram(props: {
  scenario: TransmissionScenario;
  animStep: number;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  theme: ReturnType<typeof useHostTheme>;
}) {
  const { scenario, animStep, selectedId, onSelectNode, theme } = props;

  const layout = computeDAGLayout({
    nodes: scenario.nodes.map((n) => ({ id: n.id })),
    edges: scenario.edges.map((e) => ({ from: e.from, to: e.to })),
    direction: "horizontal",
    nodeWidth: TX_NODE_W,
    nodeHeight: TX_NODE_H,
    rankGap: 90,
    nodeGap: 20,
    padding: 24,
  });

  const nodeById = Object.fromEntries(scenario.nodes.map((n) => [n.id, n]));
  const edgeByIndex = scenario.edges;

  const activeEdgeSet = new Set<number>();
  if (animStep >= 0) {
    for (let i = 0; i <= animStep && i < edgeByIndex.length; i++) activeEdgeSet.add(i);
  }

  const selectedNodeIds = new Set<string>();
  if (selectedId) {
    for (const [nodeId, indId] of Object.entries(NODE_TO_INDICATOR)) {
      if (indId === selectedId) selectedNodeIds.add(nodeId);
    }
  }

  return (
    <div style={{ overflowX: "auto", padding: "8px 0 16px" }}>
      <svg width={layout.width} height={layout.height + 40} viewBox={`0 0 ${layout.width} ${layout.height + 40}`} style={{ display: "block" }}>
        {layout.edges.map((e, i) => {
          const edge = edgeByIndex[i];
          const active = activeEdgeSet.has(i) || animStep < 0;
          const sx = e.sourceX;
          const sy = e.sourceY;
          const tx = e.targetX;
          const ty = e.targetY;
          const mx = (sx + tx) / 2;
          const color = active ? theme.category.cyan : theme.stroke.secondary;
          const isBack = e.isBackEdge;
          return (
            <g key={i} opacity={active ? 1 : 0.25}>
              <path
                d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                fill="none"
                stroke={color}
                strokeWidth={active && animStep === i ? 2.5 : 1.5}
                strokeDasharray={isBack ? "6 4" : undefined}
              />
              <polygon points={`${tx},${ty} ${tx - 8},${ty - 4} ${tx - 8},${ty + 4}`} fill={color} />
              {active && edge ? (
                <text x={(sx + tx) / 2} y={(sy + ty) / 2 - 8} textAnchor="middle" fontSize={9} fill={theme.text.tertiary}>
                  {CHANNEL_LABEL[edge.channel]} · {edge.lagMonths}M
                </text>
              ) : null}
              {active && animStep === i ? (
                <circle r={4} fill={theme.category.yellow}>
                  <animateMotion dur="0.6s" repeatCount="1" path={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`} />
                </circle>
              ) : null}
            </g>
          );
        })}

        {layout.nodes.map((n) => {
          const node = nodeById[n.id];
          const isPolicy = node.type === "policy";
          const isShock = node.type === "shock";
          const isSelected = selectedNodeIds.has(n.id);
          const accent = isPolicy ? theme.category.purple : isShock ? theme.category.orange : theme.category.cyan;

          if (isPolicy) {
            const cx = n.x + TX_NODE_W / 2;
            const cy = n.y + TX_NODE_H / 2;
            const hw = TX_NODE_W / 2 - 4;
            const hh = TX_NODE_H / 2 - 4;
            return (
              <g key={n.id} onClick={() => onSelectNode(n.id)} style={{ cursor: "pointer" }}>
                <polygon
                  points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`}
                  fill={theme.bg.elevated}
                  stroke={isSelected ? accent : theme.stroke.primary}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={theme.text.primary}>
                  {node.labelZh}
                </text>
              </g>
            );
          }

          return (
            <g key={n.id} onClick={() => onSelectNode(n.id)} style={{ cursor: "pointer" }}>
              <rect
                x={n.x}
                y={n.y}
                width={TX_NODE_W}
                height={TX_NODE_H}
                rx={8}
                fill={theme.bg.elevated}
                stroke={isSelected ? accent : theme.stroke.primary}
                strokeWidth={isSelected ? 2 : 1}
              />
              <rect x={n.x} y={n.y} width={3} height={TX_NODE_H} rx={1} fill={accent} />
              <text x={n.x + TX_NODE_W / 2} y={n.y + TX_NODE_H / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={theme.text.primary}>
                {node.labelZh}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

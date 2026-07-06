export type IndicatorTiming = "leading" | "coincident" | "lagging";
export type Sector =
  | "corporate"
  | "financial"
  | "household"
  | "fiscal"
  | "monetary"
  | "external"
  | "inflation";
export type IndustryCycleTag = "cyclical" | "growth" | "defensive" | "mixed";
export type TransmissionChannel =
  | "interest_rate"
  | "credit"
  | "exchange_rate"
  | "wealth"
  | "expectations";
export type ScenarioId = "A" | "B" | "C" | "D";

export interface MacroIndicator {
  id: string;
  nameEn: string;
  nameZh: string;
  timing: IndicatorTiming;
  sector: Sector;
  value: number | null;
  unit: string;
  prevValue: number | null;
  releaseFreq: string;
  asOfDate: string;
  source: string;
  sparkline: number[];
  description: string;
}

export interface SicIndustryRow {
  sicRange: string;
  nameZh: string;
  nameEn: string;
  cycleTag: IndustryCycleTag;
  /** 行业景气度指数（PMI 式，50=中性；由产出/产能/就业等合成） */
  prosperityIndex: number;
  prosperityPrev: number;
  mockEmploymentYoY: number;
}

export interface TransmissionEdge {
  from: string;
  to: string;
  channel: TransmissionChannel;
  lagMonths: string;
  label?: string;
}

export interface TransmissionScenario {
  id: ScenarioId;
  titleZh: string;
  descriptionZh: string;
  nodes: { id: string; labelZh: string; type: "indicator" | "policy" | "shock" }[];
  edges: TransmissionEdge[];
}


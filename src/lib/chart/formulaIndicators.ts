import type { CandlestickData, HistogramData, LineData, WhitespaceData } from "lightweight-charts";
import type { KlineCandleColors } from "./klineColorScheme";
import {
  compileIndicatorFormula,
  evaluateIndicatorFormula,
  type IndicatorProgram,
} from "./indicatorFormula";

export type FormulaIndicatorId = `formula:${string}`;
export type SavedFormula = { id: FormulaIndicatorId; name: string; source: string };
type FormulaPreset = SavedFormula & { category: "trend" | "momentum" | "volume"; needsVolume?: boolean; summary: string };
export const MAX_FORMULAS = 24;
export const MAX_FORMULA_NAME = 36;
export const DEFAULT_FORMULA_SOURCE = "N:=20;\nBASE:=MA(CLOSE,N);\nBIAS:100*(CLOSE/BASE-1);\nZERO:0,#94A3B8;";

const trueRange = "PREV:=REF(CLOSE,1);\nTR:=MAX(HIGH-LOW,MAX(ABS(HIGH-PREV),ABS(LOW-PREV)));";

export const FORMULA_PRESETS: readonly FormulaPreset[] = [
  { id: "formula:atr", name: "ATR", category: "trend", summary: "平均真实波幅（14）",
    source: `N:=14;\n${trueRange}\nATR:RMA(NZ(TR,HIGH-LOW),N);` },
  { id: "formula:atrp", name: "ATR%", category: "trend", summary: "平均真实波幅占收盘价的百分比（14）",
    source: `N:=14;\n${trueRange}\nATRP:100*RMA(NZ(TR,HIGH-LOW),N)/CLOSE;` },
  { id: "formula:adx", name: "DMI / ADX", category: "trend", summary: "方向指标与趋势强度（14, 14）",
    source: `N:=14; SMOOTH:=14;\n${trueRange}
UP:=HIGH-REF(HIGH,1); DOWN:=REF(LOW,1)-LOW;
POS:=IF(UP>DOWN AND UP>0,UP,0); NEG:=IF(DOWN>UP AND DOWN>0,DOWN,0);
ATRBASE:=RMA(TR,N);
PDI:IF(ATRBASE=0,0,100*RMA(POS,N)/ATRBASE);
MDI:IF(ATRBASE=0,0,100*RMA(NEG,N)/ATRBASE);
ADX:RMA(IF(PDI+MDI=0,0,100*ABS(PDI-MDI)/(PDI+MDI)),SMOOTH);` },
  { id: "formula:donchian", name: "Donchian", category: "trend", summary: "唐奇安通道的区间高、低和中线（20）",
    source: "N:=20;\nTOP:HHV(HIGH,N);\nBOTTOM:LLV(LOW,N);\nMID:(TOP+BOTTOM)/2;" },
  { id: "formula:roc", name: "ROC", category: "momentum", summary: "收盘价变动率（12）",
    source: "N:=12;\nROC:100*(CLOSE/REF(CLOSE,N)-1),COLORSTICK;" },
  { id: "formula:mom", name: "Momentum", category: "momentum", summary: "收盘价动量（10）",
    source: "N:=10;\nMOM:CLOSE-REF(CLOSE,N);\nZERO:0,#94A3B8;" },
  { id: "formula:wr", name: "Williams %R", category: "momentum", summary: "收盘价在近期高低区间中的位置（14）",
    source: "N:=14;\nTOP:=HHV(HIGH,N); BOTTOM:=LLV(LOW,N);\nWR:-100*(TOP-CLOSE)/(TOP-BOTTOM);\nUPPER:-20,#94A3B8;\nLOWER:-80,#94A3B8;" },
  { id: "formula:stoch", name: "Stochastic", category: "momentum", summary: "慢速随机指标 %K 和 %D（14, 3, 3）",
    source: "N:=14; KS:=3; DS:=3;\nTOP:=HHV(HIGH,N); BOTTOM:=LLV(LOW,N);\nK:MA(100*(CLOSE-BOTTOM)/(TOP-BOTTOM),KS);\nD:MA(K,DS);\nUPPER:80,#94A3B8;\nLOWER:20,#94A3B8;" },
  { id: "formula:bias", name: "BIAS", category: "momentum", summary: "收盘价相对均线的偏离率（20）",
    source: DEFAULT_FORMULA_SOURCE },
  { id: "formula:obv", name: "OBV", category: "volume", needsVolume: true, summary: "按价格涨跌累加或扣减成交量",
    source: "PREV:=NZ(REF(CLOSE,1),CLOSE);\nOBV:SUM(VOL*IF(CLOSE>PREV,1,IF(CLOSE<PREV,-1,0)),0);" },
  { id: "formula:rvol", name: "RVOL", category: "volume", needsVolume: true, summary: "本根成交量除以前 20 根的平均成交量",
    source: "N:=20;\nRVOL:VOL/MA(REF(VOL,1),N),HIST;\nBASE:1,#94A3B8;" },
];

export function isFormulaIndicator(id: string): id is FormulaIndicatorId {
  return id.startsWith("formula:");
}

const STORAGE_KEY = "market-indicator-formulas-v1";
export function loadSavedFormulas(): SavedFormula[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    const result = new Map<FormulaIndicatorId, SavedFormula>();
    for (const item of value.slice(0, MAX_FORMULAS)) {
      if (!item || typeof item.id !== "string" || !/^formula:custom-[0-9a-f-]{36}$/.test(item.id)) continue;
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > MAX_FORMULA_NAME) continue;
      if (typeof item.source !== "string" || !compileIndicatorFormula(item.source).ok) continue;
      result.set(item.id, { id: item.id, name: item.name, source: item.source });
    }
    return [...result.values()];
  } catch {
    return [];
  }
}

export function saveFormulas(items: SavedFormula[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function formulaVolumes(
  payload: { candles: CandlestickData[]; volumes?: number[]; volumeAvailable?: boolean } | null,
): readonly number[] | undefined {
  if (!payload || payload.volumeAvailable === false || !payload.volumes?.length) return undefined;
  return payload.volumes.length === payload.candles.length ? payload.volumes : undefined;
}

export function evaluateOnCandles(program: IndicatorProgram, candles: CandlestickData[], volumes: readonly number[] | undefined) {
  return evaluateIndicatorFormula(program, {
    OPEN: candles.map(candle => candle.open),
    HIGH: candles.map(candle => candle.high),
    LOW: candles.map(candle => candle.low),
    CLOSE: candles.map(candle => candle.close),
    VOL: volumes,
  }, candles.length);
}

const OUTPUT_COLORS = ["#2563eb", "#b45309", "#9333ea", "#0891b2", "#db2777", "#15803d", "#ea580c", "#475569"];

export function formulaOutputColor(output: IndicatorProgram["outputs"][number], index: number): string {
  return output.color ?? OUTPUT_COLORS[index % OUTPUT_COLORS.length]!;
}

export function formulaOutputData(
  program: IndicatorProgram,
  candles: CandlestickData[],
  volumes: readonly number[] | undefined,
  colors: KlineCandleColors,
): (LineData | HistogramData | WhitespaceData)[][] {
  const results = evaluateOnCandles(program, candles, volumes);
  return program.outputs.map(output => {
    const values = results.get(output.name)!;
    return candles.map(({ time }, i) => {
      const value = values[i]!;
      if (!Number.isFinite(value)) return { time };
      if (output.plot === "signed") {
        return { time, value, color: value >= 0 ? output.color ?? colors.volumeUp : colors.volumeDown };
      }
      return { time, value };
    });
  });
}

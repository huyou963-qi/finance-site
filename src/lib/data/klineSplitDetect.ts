import type { CandlestickData } from "lightweight-charts";

export type SplitLikeAction = {
  /** 跳变后第一根 bar 的索引（除权/拆股生效后的交易日） */
  barIndex: number;
  /** 前收 / 后收，拆股 4:1 时约为 4 */
  ratio: number;
};

/** 是否像常见拆股/合股整数比例（2、3、4、5、10 等） */
function plausibleSplitRatio(ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio < 1.35 || ratio > 12) return false;
  for (const n of [2, 3, 4, 5, 6, 8, 10, 1.5, 1.25]) {
    if (Math.abs(ratio - n) / n < 0.12) return true;
  }
  const rounded = Math.round(ratio);
  return rounded >= 2 && rounded <= 10 && Math.abs(ratio - rounded) / rounded < 0.12;
}

/** 仅保留拆股方向（ratio≥1），并去掉相邻重复 */
function normalizeSplitActions(actions: SplitLikeAction[]): SplitLikeAction[] {
  const forward = actions.filter((a) => a.ratio >= 1.35);
  if (!forward.length) return [];
  forward.sort((a, b) => a.barIndex - b.barIndex);
  const out: SplitLikeAction[] = [];
  for (const act of forward) {
    const last = out[out.length - 1];
    if (last && act.barIndex - last.barIndex <= 2) {
      if (act.ratio > last.ratio) out[out.length - 1] = act;
      continue;
    }
    out.push(act);
  }
  return out;
}

/**
 * 根据相邻收盘跳变识别拆股（仅价格下跌 r<0.52）。
 * IB Trades 在真实拆股前常有 拆后价→拆前价 的回跳，不按合股处理。
 */
export function detectSplitLikeActions(
  candles: CandlestickData[],
): SplitLikeAction[] {
  const out: SplitLikeAction[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1]!.close;
    const curr = candles[i]!.close;
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0) {
      continue;
    }
    const r = curr / prev;
    if (r < 0.52) {
      const ratio = prev / curr;
      if (plausibleSplitRatio(ratio)) {
        out.push({ barIndex: i, ratio });
      }
    }
  }
  return normalizeSplitActions(out);
}

/** 拆后刻度上界（与锚定前收、拆股比相关） */
export function postSplitCap(anchor: number, ratio: number): number {
  return (anchor / ratio) * 1.38;
}

import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

/** 演示用「宏观」月度序列（非真实数据） */
export function buildMacroDemoSeries(months = 36) {
  const categories: string[] = [];
  const inflation: number[] = [];
  const policyRate: number[] = [];

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));

  let inf = 2.1;
  let rate = 3.5;

  for (let i = 0; i < months; i++) {
    const y = start.getUTCFullYear();
    const m = String(start.getUTCMonth() + 1).padStart(2, "0");
    categories.push(`${y}-${m}`);
    inf += (Math.random() - 0.52) * 0.25;
    rate += (Math.random() - 0.5) * 0.15;
    inflation.push(Number(inf.toFixed(2)));
    policyRate.push(Number(rate.toFixed(2)));
    start.setUTCMonth(start.getUTCMonth() + 1);
  }

  return { categories, inflation, policyRate };
}

function utcDayStart(sec: number): UTCTimestamp {
  return sec as UTCTimestamp;
}

/** 演示用 K 线（随机游走，非真实行情） */
export function buildCandleDemo(count = 200): CandlestickData[] {
  const out: CandlestickData[] = [];
  const daySec = 86400;
  let t = Math.floor(Date.now() / 1000 / daySec) * daySec - count * daySec;
  let price = 100 + Math.random() * 20;

  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (Math.random() - 0.48) * 2.2;
    const close = Math.max(0.05, open + drift);
    const high = Math.max(open, close) + Math.random() * 1.2;
    const low = Math.min(open, close) - Math.random() * 1.2;
    out.push({
      time: utcDayStart(t),
      open,
      high,
      low,
      close,
    });
    price = close;
    t += daySec;
  }

  return out;
}

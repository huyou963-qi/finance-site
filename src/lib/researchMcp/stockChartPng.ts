import sharp from "sharp";
import { colorsForKlineMode, DEFAULT_KLINE_CANDLE_COLOR_MODE } from "@/lib/chart/klineColorScheme";
import type { AdjustedBar } from "@/lib/equity/priceAdjustment";
import { MarketError } from "@/lib/market/schema";

const width = 1200, height = 640;
const left = 64, right = 1088, top = 105, priceBottom = 433, volumeTop = 465, volumeBottom = 541;
const labelColor = "#536178", ink = "#162337", grid = "#e4eaf0", eventColor = "#6651a5";
const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const xml = (value: string) => value.replace(/[<>&"']/g, character => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[character]!);

function label(x: number, y: number, value: string, size = 13, color = labelColor, anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${xml(value)}</text>`;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string) {
  return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${stroke}"/>`;
}

export async function renderStockChartPng(
  symbol: string,
  bars: AdjustedBar[],
  earningsDates: string[],
  options: { interval: "1d" | "1w" | "1M"; adjustment: "forward" | "backward" | "none" },
) {
  const candles = bars.flatMap(bar => {
    const { open, high, low, close } = bar;
    if (open == null || high == null || low == null || ![open, high, low, close].every(value => Number.isFinite(value) && value > 0)) return [];
    const volume = bar.volume != null && Number.isFinite(bar.volume) && bar.volume > 0 ? bar.volume : 0;
    return [{ ...bar, open, high: Math.max(open, high, close), low: Math.min(open, low, close), volume }];
  });
  if (!candles.length) throw new MarketError("DATA_UNAVAILABLE", "站内在所选区间没有完整的 OHLC 行情可绘图");
  const colors = colorsForKlineMode(DEFAULT_KLINE_CANDLE_COLOR_MODE);
  const lowest = Math.min(...candles.map(bar => bar.low));
  const highest = Math.max(...candles.map(bar => bar.high));
  const padding = Math.max((highest - lowest) * 0.06, highest * 0.005);
  const min = lowest - padding, max = highest + padding;
  const maxVolume = Math.max(1, ...candles.map(bar => bar.volume));
  const xStep = (right - left) / candles.length;
  const x = (i: number) => left + (i + 0.5) * xStep;
  const y = (price: number) => priceBottom - (price - min) / (max - min) * (priceBottom - top);
  const bodyWidth = Math.max(1.5, Math.min(16, xStep * 0.62));
  const priceAxis = Array.from({ length: 6 }, (_, i) => {
    const value = min + (max - min) * i / 5, axisY = y(value);
    return line(left, axisY, right, axisY, grid) + label(right + 12, axisY + 4, value.toFixed(highest < 1 ? 4 : 2));
  }).join("");
  const dates = candles.map(bar => day(bar.time));
  const markers = [...new Set(earningsDates.flatMap(date => {
    const index = options.interval === "1d" ? dates.findIndex(value => value >= date)
      : dates.findLastIndex(value => value <= date);
    return index < 0 ? [] : [index];
  }))].map(index =>
    `<line x1="${x(index)}" y1="${top}" x2="${x(index)}" y2="${volumeBottom}" stroke="${eventColor}" stroke-dasharray="4 4" opacity=".60"/>`
    + label(x(index), top - 9, "E", 12, eventColor, "middle"),
  ).join("");
  const marks = candles.map((bar, i) => {
    const center = x(i), color = bar.close >= bar.open ? colors.up : colors.down;
    const bodyTop = Math.min(y(bar.open), y(bar.close));
    const bodyHeight = Math.max(1, Math.abs(y(bar.open) - y(bar.close)));
    const volumeHeight = bar.volume / maxVolume * (volumeBottom - volumeTop);
    return line(center, y(bar.high), center, y(bar.low), color)
      + `<rect x="${(center - bodyWidth / 2).toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyWidth}" height="${bodyHeight.toFixed(2)}" fill="${color}"/>`
      + `<rect x="${(center - bodyWidth / 2).toFixed(2)}" y="${(volumeBottom - volumeHeight).toFixed(2)}" width="${bodyWidth}" height="${volumeHeight.toFixed(2)}" fill="${color}" opacity=".65"/>`;
  }).join("");
  const dateLabels = [...new Set(Array.from({ length: 7 }, (_, i) => Math.round(i * (dates.length - 1) / 6)))].map(index => {
    const position = Math.min(right - 33, Math.max(left + 33, x(index)));
    return label(position, 568, dates[index]!, 12, labelColor, "middle");
  }).join("");
  const frequency = { "1d": "Daily", "1w": "Weekly", "1M": "Monthly" }[options.interval];
  const adjustment = { forward: "Forward adjusted", backward: "Backward adjusted", none: "Unadjusted" }[options.adjustment];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Arial, sans-serif">
    <rect width="${width}" height="${height}" fill="#fff"/>
    ${label(left, 50, `${symbol}  /  ${frequency} candlesticks`, 26, ink)}
    ${label(left, 76, `${adjustment} · USD${markers ? " · E = earnings release" : ""}`)}
    ${priceAxis}${markers}${marks}
    ${line(left, volumeBottom, right, volumeBottom, grid)}
    ${label(left, volumeTop - 10, "Volume")}
    ${dateLabels}${label(left, 614, "GekkoTech · Stored US equity market data")}
  </svg>`;
  return { image: await sharp(Buffer.from(svg)).png().toBuffer(), candleCount: candles.length };
}

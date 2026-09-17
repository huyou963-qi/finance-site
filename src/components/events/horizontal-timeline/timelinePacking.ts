/**
 * 横向时间轴的纯布局计算：精确到日的时间坐标、自适应刻度、事件卡避让与聚合。
 * 与 React 无关，便于单测。
 */

export const TIMELINE_ORIGIN_YEAR = 1776;
export const TIMELINE_END_YEAR = 2027;
export const BASE_PX_PER_YEAR = 14;

/** ISO 时间 → 小数年（2020-07-02 ≈ 2020.5），用于把同一年内的事件按日期拉开 */
export function fractionalYear(iso: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    const y = Number(iso.slice(0, 4));
    return Number.isFinite(y) ? y : TIMELINE_ORIGIN_YEAR;
  }
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (ms - start) / (end - start);
}

export function yearToX(year: number, pxPerYear: number): number {
  return (year - TIMELINE_ORIGIN_YEAR) * pxPerYear;
}

export function xToYear(x: number, pxPerYear: number): number {
  return TIMELINE_ORIGIN_YEAR + x / pxPerYear;
}

export function contentWidth(pxPerYear: number): number {
  return yearToX(TIMELINE_END_YEAR, pxPerYear) + 120;
}

export type TimelineTick = { key: string; x: number; label: string | null; major: boolean };

const YEAR_STEPS = [1, 2, 5, 10, 25, 50, 100] as const;
const MONTH_STEPS = [1, 3, 6] as const;
/** 相邻刻度至少间隔的像素 */
const MIN_TICK_GAP = 64;

/** 只生成 [fromX, toX] 可视范围内的刻度；放大到月级时按月/季度标注 */
export function buildTicks(pxPerYear: number, fromX: number, toX: number): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  const fromYear = Math.max(TIMELINE_ORIGIN_YEAR, Math.floor(xToYear(fromX, pxPerYear)));
  const toYear = Math.min(TIMELINE_END_YEAR, Math.ceil(xToYear(toX, pxPerYear)));

  const monthStep = MONTH_STEPS.find((m) => (pxPerYear / 12) * m >= MIN_TICK_GAP);
  if (monthStep) {
    for (let y = fromYear; y <= toYear; y++) {
      for (let m = 0; m < 12; m += monthStep) {
        const t = fractionalYear(new Date(Date.UTC(y, m, 1)).toISOString());
        const x = yearToX(t, pxPerYear);
        if (x < fromX || x > toX) continue;
        ticks.push({
          key: `${y}-${m}`,
          x,
          label: m === 0 ? String(y) : `${m + 1}月`,
          major: m === 0,
        });
      }
    }
    return ticks;
  }

  const step = YEAR_STEPS.find((s) => s * pxPerYear >= MIN_TICK_GAP) ?? 100;
  const majorEvery = step >= 25 ? step * 2 : step * 5;
  const first = Math.ceil(fromYear / step) * step;
  for (let y = first; y <= toYear; y += step) {
    const x = yearToX(y, pxPerYear);
    if (x < fromX || x > toX) continue;
    ticks.push({ key: String(y), x, label: String(y), major: y % majorEvery === 0 });
  }
  return ticks;
}

export type PackInput = { id: string; t: number };

export type PackedItem = {
  /** 本卡片包含的事件 id（按时间升序）；长度 > 1 即聚合卡 */
  ids: string[];
  lane: "above" | "below";
  /** 卡片左边缘 px */
  left: number;
  /** 连接线在卡片内的横向偏移 px */
  stemOffset: number;
  /** 事件锚点横坐标范围 px */
  minX: number;
  maxX: number;
};

export type PackOptions = {
  pxPerYear: number;
  cardWidth: number;
  gap?: number;
  /** 连接线离卡片左右边缘的最小距离 */
  stemInset?: number;
};

/**
 * 贪心双轨排布：按时间扫描，每张卡优先贴着锚点居中放；放不下则在不遮挡锚点的前提下右移；
 * 上下两轨都放不下时并入该轨最后一张卡，形成聚合卡（点击放大展开）。
 */
export function packTimelineCards(items: PackInput[], opts: PackOptions): PackedItem[] {
  const { pxPerYear, cardWidth: w } = opts;
  const gap = opts.gap ?? 10;
  const inset = opts.stemInset ?? 18;
  const sorted = [...items].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));

  const out: PackedItem[] = [];
  const laneEnd = { above: -Infinity, below: -Infinity };
  const laneLast: Record<"above" | "below", PackedItem | null> = { above: null, below: null };
  let preferAbove = true;

  for (const it of sorted) {
    const x = yearToX(it.t, pxPerYear);
    const order: ("above" | "below")[] = preferAbove ? ["above", "below"] : ["below", "above"];

    let placed = false;
    for (const lane of order) {
      const left = Math.max(x - w / 2, laneEnd[lane] + gap);
      if (left > x - inset) continue;
      const item: PackedItem = { ids: [it.id], lane, left, stemOffset: x - left, minX: x, maxX: x };
      out.push(item);
      laneEnd[lane] = left + w;
      laneLast[lane] = item;
      preferAbove = lane === "below";
      placed = true;
      break;
    }
    if (placed) continue;

    // 两轨都满：并入两轨末卡中事件较少的一张，使上下聚合量均衡
    const a = laneLast.above!;
    const b = laneLast.below!;
    const host = a.ids.length < b.ids.length || (a.ids.length === b.ids.length && laneEnd.above <= laneEnd.below) ? a : b;
    host.ids.push(it.id);
    host.maxX = x;
    const mid = (host.minX + host.maxX) / 2;
    host.stemOffset = Math.min(w - inset, Math.max(inset, mid - host.left));
  }

  return out;
}

import type { FetchIncrementalResult } from "../types";
import { GACC_DIRECTIONS, type TradeDirection } from "../gaccCommodity/catalog";
import {
  fetchGaccCommodityTable,
  fetchGaccMonthlyIndex,
  clearGaccCommodityCache,
} from "../gaccCommodity/client";
import { parseGaccMonthlyIndex } from "../gaccCommodity/parseMonthlyIndex";
import { parseGaccCommodityTable } from "../gaccCommodity/parseCommodityTable";
import { buildGaccSeriesPoints, type GaccSeriesPoint } from "../gaccCommodity/toSeriesPoints";

/**
 * worker 增量：抓当年月报索引 → 最近 RECENT_MONTHS 期表(13)/(14) → 过滤出本仪器的观测点。
 *
 * 同一轮 worker 里 150 条仪器共用同一批页面，client 的 60s 缓存保证每个 URL 只打一次源站
 * （一轮总计 2 个索引页 + 6 个详情页）。只回看最近三期是为了让偶发漏抓的月份下一轮自动补上，
 * 更早的历史由 sync 脚本一次性回填。
 */

const RECENT_MONTHS = 3;

function readDirection(metadata: unknown, instrumentCode: string): TradeDirection {
  const scrape =
    metadata && typeof metadata === "object"
      ? ((metadata as Record<string, unknown>).scrape as Record<string, unknown> | undefined)
      : undefined;
  const declared = typeof scrape?.direction === "string" ? scrape.direction : undefined;
  if (declared && (GACC_DIRECTIONS as readonly string[]).includes(declared)) {
    return declared as TradeDirection;
  }
  // metadata 缺 direction 时按 code 前缀兜底（gacc_cn_exp_* / gacc_cn_imp_*）
  if (instrumentCode.startsWith("gacc_cn_exp_")) return "export";
  if (instrumentCode.startsWith("gacc_cn_imp_")) return "import";
  throw new Error(`海关主要商品量值表：无法判定 ${instrumentCode} 的进出口方向`);
}

export async function fetchGaccCommodityIncremental(
  metadata: unknown,
  instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const direction = readDirection(metadata, instrumentCode);
  const currentYear = new Date().getUTCFullYear();
  const index = await fetchGaccMonthlyIndex(currentYear, currentYear);
  const links = parseGaccMonthlyIndex(index, direction).slice(-RECENT_MONTHS);

  const collected: GaccSeriesPoint[] = [];
  let skippedInvalid = 0;
  for (const link of links) {
    const parsed = parseGaccCommodityTable(await fetchGaccCommodityTable(link.url));
    if (parsed.monthSpan > 1) continue; // 合并期不作当月值
    skippedInvalid += parsed.skippedInvalid;
    const built = buildGaccSeriesPoints(direction, parsed);
    collected.push(...built.points.filter((p) => p.code === instrumentCode));
  }

  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const points = collected
    .map((p) => p.point)
    .filter((p) => p.obsDate >= start)
    .sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  const latest = collected.reduce<Date | null>(
    (current, p) => (!current || p.point.obsDate > current ? p.point.obsDate : current),
    null,
  );
  return { points, sourceLatestObsDate: latest, skippedInvalid };
}

export { clearGaccCommodityCache };

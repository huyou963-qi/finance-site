import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { aarRailTrafficSeriesByProvider } from "../aarRailTraffic/catalog";
import {
  fetchAarArchiveListPage,
  fetchAarWeeklyReleasePage,
  clearAarRailTrafficCache,
} from "../aarRailTraffic/client";
import {
  parseAarArchiveListPage,
  parseAarWeeklyReleasePage,
} from "../aarRailTraffic/parseWeeklyTraffic";

function readScrapeConfig(metadata: unknown): { provider?: string; fixturePath?: string } {
  if (!metadata || typeof metadata !== "object") return {};
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return {};
  const s = scrape as Record<string, unknown>;
  return {
    provider: typeof s.provider === "string" ? s.provider : undefined,
    fixturePath: typeof s.fixturePath === "string" ? s.fixturePath : undefined,
  };
}

function seriesValue(
  seriesKey: "carloads" | "intermodal",
  parsed: { carloads: number; intermodal: number },
): number {
  return seriesKey === "carloads" ? parsed.carloads : parsed.intermodal;
}

/**
 * worker 增量：抓取归档列表第 1 页（近 10 周），筛出 weekEndingDate >= obsStart 的条目，
 * 逐篇抓正文解析取对应分项值。归档列表页覆盖近 ~2.5 个月，足以应对常规 probe 间隔下的
 * 补抓；若探测中断超过 10 周未运行，需人工执行 sync 脚本手动补历史。
 */
export async function fetchAarRailTrafficIncremental(
  metadata: unknown,
  _instrumentCode: string,
  obsStart: string,
): Promise<FetchIncrementalResult> {
  const { provider, fixturePath } = readScrapeConfig(metadata);
  const config = aarRailTrafficSeriesByProvider(provider ?? "");
  if (!config) {
    throw new Error(`AAR 铁路装车量：未识别 scrape.provider=${provider ?? "无"}`);
  }

  const listHtml = await fetchAarArchiveListPage(1, { fixturePath: undefined });
  const items = parseAarArchiveListPage(listHtml);
  const start = new Date(`${obsStart}T00:00:00.000Z`);

  const points: ObservationPoint[] = [];
  let latestObsDate: Date | null = null;
  let skippedInvalid = 0;

  for (const item of items) {
    if (!item.weekEndingDate || item.weekEndingDate < start) continue;
    const detailHtml = await fetchAarWeeklyReleasePage(item.url, { fixturePath });
    const parsed = parseAarWeeklyReleasePage(detailHtml);
    const value = seriesValue(config.seriesKey, parsed);
    const [lo, hi] = config.valueRange;
    if (value < lo || value > hi) {
      throw new Error(
        `AAR ${config.seriesKey}：${parsed.weekEndingDate.toISOString().slice(0, 10)} 值 ${value} 超出值域 [${lo},${hi}]（拒绝写入，疑似解析错位）`,
      );
    }
    points.push({ obsDate: parsed.weekEndingDate, value });
    if (!latestObsDate || parsed.weekEndingDate > latestObsDate) {
      latestObsDate = parsed.weekEndingDate;
    }
  }

  return { points, sourceLatestObsDate: latestObsDate, skippedInvalid };
}

export { clearAarRailTrafficCache };

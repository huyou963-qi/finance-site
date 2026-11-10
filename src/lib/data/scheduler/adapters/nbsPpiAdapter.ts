import type { FetchIncrementalResult } from "../types";
import { fetchNbsPpiSeries, type NbsPpiSourceSeries } from "../nbsPpi/client";
import { nbsPpiDefinition, type NbsPpiMeasure } from "../nbsPpi/catalog";
import { fetchNbsPriceWorkbook } from "../nbsPriceRelease/client";
import { parseNbsPpiWorkbook } from "../nbsPpi/parseWorkbook";
import { SourcePendingError } from "../sourcePending";

function sourceSeries(metadata: unknown): NbsPpiSourceSeries {
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null;
  if (!scrape || typeof scrape !== "object") throw new Error("国家数据 PPI：缺少 scrape 配置");
  const row = scrape as Record<string, unknown>;
  if (typeof row.cid !== "string" || typeof row.indicatorId !== "string" || (row.sourceMeasure !== "index" && row.sourceMeasure !== "mom")) throw new Error("国家数据 PPI：scrape 配置不完整");
  return { cid: row.cid, indicatorId: row.indicatorId, sourceMeasure: row.sourceMeasure };
}

/** 国家数据网站通常在月报发布后几天内补齐未列入月报的行业；超过此宽限仍缺才算故障。 */
export const NBS_PPI_PORTAL_GRACE_DAYS = 7;

/** 月报发布日：文章 URL 形如 .../t20261110_1234.html；取不到时按次月 15 日估计。 */
export function nbsReleaseDate(articleUrl: string, obsMonth: Date): Date {
  const match = /\/t(20\d{2})(\d{2})(\d{2})_/.exec(articleUrl);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Date(Date.UTC(obsMonth.getUTCFullYear(), obsMonth.getUTCMonth() + 1, 15));
}

/** 未列入月报的成员：国家数据只晚一个月 → 待补齐（宽限内）；更旧或为空 → 故障。 */
export function nbsPpiPortalGapError(instrumentCode: string, releaseMonth: Date, latest: Date | undefined, articleUrl: string): Error {
  const month = releaseMonth.toISOString().slice(0, 7);
  const message = `国家统计局 PPI：已发布 ${month}，但 ${instrumentCode} 未列入月报且国家数据尚未补齐；不能报告无变化`;
  const previousMonth = Date.UTC(releaseMonth.getUTCFullYear(), releaseMonth.getUTCMonth() - 1, 1);
  if (latest?.getTime() !== previousMonth) return new Error(message);
  const until = new Date(nbsReleaseDate(articleUrl, releaseMonth).getTime() + NBS_PPI_PORTAL_GRACE_DAYS * 86_400_000);
  return new SourcePendingError(message, until);
}

export async function fetchNbsPpiIncremental(metadata: unknown, instrumentCode: string, obsStart: string): Promise<FetchIncrementalResult> {
  const definition = nbsPpiDefinition(instrumentCode);
  if (!definition) throw new Error(`国家数据 PPI：未登记仪器 ${instrumentCode}`);
  const official = await fetchNbsPriceWorkbook("PPI");
  const release = parseNbsPpiWorkbook(official.workbook);
  const published = release.pointsByInstrument.get(instrumentCode)?.[0];
  const points = await fetchNbsPpiSeries(sourceSeries(metadata), definition.measure.key as NbsPpiMeasure, new Date(`${obsStart}T00:00:00.000Z`).getUTCFullYear());
  const latest = points.at(-1)?.obsDate;
  if (published && (!latest || published.obsDate > latest)) points.push(published);
  else if (!published && (!latest || latest < release.sourceLatestObsDate)) {
    throw nbsPpiPortalGapError(instrumentCode, release.sourceLatestObsDate, latest, official.articleUrl);
  }
  // Same-period JSON is the revision source: do not overwrite it with the first-release file.
  return { points: points.filter((point) => point.obsDate >= new Date(`${obsStart}T00:00:00.000Z`)), sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}

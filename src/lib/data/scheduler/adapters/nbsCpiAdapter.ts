import type { FetchIncrementalResult } from "../types";
import { fetchNbsCpiWorkbook } from "../nbsCpi/client";
import { nbsCpiDefinition } from "../nbsCpi/catalog";
import { fetchNbsCpiHistory, mergeNbsCpiPoints } from "../nbsCpi/historyClient";
import { parseNbsCpiWorkbook } from "../nbsCpi/parseWorkbook";

function config(metadata: unknown) {
  const scrape = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).scrape : null;
  const values = scrape && typeof scrape === "object" ? scrape as Record<string, unknown> : null;
  const read = (key: string) => values && typeof values[key] === "string" ? values[key] as string : undefined;
  return { fixturePath: read("fixturePath"), indexUrl: read("indexUrl"), articleUrl: read("articleUrl"), workbookUrl: read("workbookUrl") };
}

/** 同一轮 worker 由 client 的 60 秒缓存共用一个官方发布包。 */
export async function fetchNbsCpiIncremental(metadata: unknown, instrumentCode: string, obsStart: string): Promise<FetchIncrementalResult> {
  if (!nbsCpiDefinition(instrumentCode)) throw new Error(`国家统计局 CPI：未登记仪器 ${instrumentCode}`);
  const opts = config(metadata);
  const workbook = await fetchNbsCpiWorkbook(opts);
  const latest = parseNbsCpiWorkbook(workbook.workbook);
  const start = new Date(`${obsStart}T00:00:00.000Z`);
  const pointsByInstrument = !opts.fixturePath && start.getUTCFullYear() < new Date().getUTCFullYear() - 1
    ? mergeNbsCpiPoints(await fetchNbsCpiHistory(), latest.pointsByInstrument)
    : latest.pointsByInstrument;
  const points = pointsByInstrument.get(instrumentCode);
  if (!points) throw new Error(`国家统计局 CPI：发布包缺仪器 ${instrumentCode}`);
  return { points: points.filter((point) => point.obsDate >= start), sourceLatestObsDate: latest.sourceLatestObsDate, skippedInvalid: 0 };
}

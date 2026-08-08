import type { ObservationPoint } from "../types";
import {
  NBS_PMI_CID_BY_SHEET,
  NBS_PMI_HISTORY_API_URL,
  NBS_PMI_HISTORY_ROOT_ID,
  NBS_PMI_INDICATOR_ID_BY_CODE,
  NBS_PMI_INSTRUMENTS,
} from "./catalog";
import { fetchChinaOfficial } from "../chinaOfficialProxy";

type ApiValue = {
  _id?: string;
  value?: string | number | null;
};

type ApiPeriod = {
  code?: string;
  values?: ApiValue[];
};

type ApiResponse = {
  data?: ApiPeriod[];
};

export type NbsPmiHistoryResult = {
  pointsByInstrument: Map<string, ObservationPoint[]>;
  sourceLatestObsDate: Date;
};

const CACHE_TTL_MS = 5 * 60_000;
let cache: { at: number; result: NbsPmiHistoryResult } | null = null;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}MM`;
}

export function parseNbsPmiHistoryResponse(
  payload: unknown,
  codeByIndicatorId: Map<string, string>,
): Map<string, ObservationPoint[]> {
  const response = payload as ApiResponse;
  if (!Array.isArray(response?.data)) {
    throw new Error("国家数据 PMI：JSON 缺 data 数组（接口结构可能已变）");
  }
  const output = new Map<string, ObservationPoint[]>();
  for (const code of codeByIndicatorId.values()) output.set(code, []);

  for (const period of response.data) {
    const match = /^(\d{4})(\d{2})MM$/.exec(String(period.code ?? ""));
    if (!match || !Array.isArray(period.values)) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) continue;
    const obsDate = new Date(Date.UTC(year, month - 1, 1));
    for (const item of period.values) {
      const code = item._id ? codeByIndicatorId.get(item._id) : undefined;
      if (!code || item.value == null || item.value === "") continue;
      const value = typeof item.value === "number" ? item.value : Number(item.value);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(
          `国家数据 PMI：${code} ${period.code} 数值异常 ${String(item.value)}`,
        );
      }
      output.get(code)!.push({ obsDate, value });
    }
  }

  for (const [code, points] of output) {
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
    if (points.length === 0) {
      throw new Error(`国家数据 PMI：${code} 返回 0 个历史点`);
    }
  }
  return output;
}

async function fetchSheet(
  sheetName: "制造业" | "非制造业",
): Promise<Map<string, ObservationPoint[]>> {
  const definitions = NBS_PMI_INSTRUMENTS.filter((row) => row.sheetName === sheetName);
  const codeByIndicatorId = new Map<string, string>();
  for (const definition of definitions) {
    const indicatorId = NBS_PMI_INDICATOR_ID_BY_CODE[definition.code];
    if (!indicatorId) throw new Error(`国家数据 PMI：缺 UUID 映射 ${definition.code}`);
    codeByIndicatorId.set(indicatorId, definition.code);
  }
  const start = sheetName === "制造业" ? "200501MM" : "200701MM";
  const response = await fetchChinaOfficial(NBS_PMI_HISTORY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://data.stats.gov.cn/dg/website/page.html",
      "User-Agent": process.env.NBS_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
    },
    body: JSON.stringify({
      cid: NBS_PMI_CID_BY_SHEET[sheetName],
      indicatorIds: [...codeByIndicatorId.keys()],
      daCatalogId: "",
      das: [{ text: "全国", value: "000000000000" }],
      dts: [`${start}-${currentPeriod()}`],
      showType: "1",
      rootId: NBS_PMI_HISTORY_ROOT_ID,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`国家数据 PMI 历史接口 HTTP ${response.status}`);
  }
  return parseNbsPmiHistoryResponse(await response.json(), codeByIndicatorId);
}

/** 新版国家数据 UUID/JSON：制造业 2005-01 起，非制造业 2007-01 起。 */
export async function fetchNbsPmiHistory(): Promise<NbsPmiHistoryResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  const pointsByInstrument = new Map<string, ObservationPoint[]>();
  for (const sheetName of ["制造业", "非制造业"] as const) {
    const sheet = await fetchSheet(sheetName);
    for (const [code, points] of sheet) pointsByInstrument.set(code, points);
  }
  let latest: Date | null = null;
  for (const points of pointsByInstrument.values()) {
    const point = points.at(-1);
    if (point && (!latest || point.obsDate > latest)) latest = point.obsDate;
  }
  if (!latest || pointsByInstrument.size !== NBS_PMI_INSTRUMENTS.length) {
    throw new Error("国家数据 PMI：历史返回不完整");
  }
  const result = { pointsByInstrument, sourceLatestObsDate: latest };
  cache = { at: Date.now(), result };
  return result;
}

export function mergeNbsPmiPoints(
  history: Map<string, ObservationPoint[]>,
  latest: Map<string, ObservationPoint[]>,
): Map<string, ObservationPoint[]> {
  const merged = new Map<string, ObservationPoint[]>();
  for (const definition of NBS_PMI_INSTRUMENTS) {
    const byDate = new Map<number, ObservationPoint>();
    for (const point of history.get(definition.code) ?? []) {
      byDate.set(point.obsDate.getTime(), point);
    }
    // 月报 Excel 是首发源，并可覆盖数据库尚未更新或已修订的最近 13 个月。
    for (const point of latest.get(definition.code) ?? []) {
      byDate.set(point.obsDate.getTime(), point);
    }
    merged.set(
      definition.code,
      [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime()),
    );
  }
  return merged;
}

/**
 * CPI nowcast 输入装载：全部复用既有读取层——FRED 序列走 `loadFredObservationMapsDbFirst`
 * （库优先、缺失才实时回退），mds 月频序列走 `loadMonthlySeriesByCode`。不新增抓取或事实表。
 */
import { loadFredObservationMapsDbFirst } from "@/lib/data/fredDbFirst";
import { loadMonthlySeriesByCode } from "@/lib/quant/macroRegime";
import { HF_KEYS, LEVEL_KEYS, type HfKey, type LevelKey, type ModelInputs } from "./model";

/** 月频 CPI/PPI 水平序列 → FRED ID（季调，注明者除外） */
export const LEVEL_FRED_IDS: Record<LevelKey, string> = {
  ALL: "CPIAUCSL",
  ALLNSA: "CPIAUCNS",
  CORE: "CPILFESL",
  CORENSA: "CPILFENS",
  FOOD: "CPIUFDSL",
  ENE: "CPIENGSL",
  FAH: "CUSR0000SAF11",
  FAFH: "CUSR0000SEFV",
  GAS: "CUSR0000SETB01",
  GASNSA: "CUUR0000SETB01",
  FUEL: "CUSR0000SEHE",
  ELEC: "CUSR0000SEHF01",
  UGAS: "CUSR0000SEHF02",
  CG: "CUSR0000SACL1E",
  NEWV: "CUSR0000SETA01",
  USED: "CUSR0000SETA02",
  APP: "CPIAPPSL",
  MEDC: "CUSR0000SAM1",
  CS: "CUSR0000SASLE",
  SHEL: "CUSR0000SAH1",
  RENT: "CUSR0000SEHA",
  OER: "CUSR0000SEHC",
  LODG: "CUSR0000SEHB",
  MEDS: "CUSR0000SAM2",
  TRS: "CUSR0000SAS4",
  AIR: "CUSR0000SETG01",
  PPIFOOD: "PPIDFS",
};

/** 日/周频高频代理（FRED）与月频代理（mds） */
export const HF_SOURCES: Record<HfKey, { kind: "fred"; id: string } | { kind: "mds"; code: string }> = {
  GASRETAIL: { kind: "fred", id: "GASREGW" },
  HEATOIL: { kind: "fred", id: "DHOILNYH" },
  JET: { kind: "fred", id: "DJFUELUSGULF" },
  HH: { kind: "fred", id: "DHHNGSP" },
  MANHEIM: { kind: "mds", code: "cox_us_manheim_used_vehicle_value_index_sa" },
  ZORI: { kind: "mds", code: "zillow_us_zori_sa" },
};

/** 日/周频折月：只取当月 1–22 日的观测（回测与实时一致的信息截止日） */
export const HF_CUTOFF_DAY = 22;
const START_MONTH = "1990-01-01";

export type InputFreshness = {
  key: string;
  seriesKey: string;
  latestDate: string | null;
};

export type LoadedInputs = {
  inputs: ModelInputs;
  /** 最新已公布 CPI 月（YYYY-MM-01） */
  latestCpiMonth: string;
  /** nowcast 目标月 = 最新 CPI 月的下一个月 */
  targetMonth: string;
  freshness: InputFreshness[];
};

function addMonths(iso: string, k: number): string {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 10);
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** 日/周频观测 → 各月「1–22 日」均值 */
export function monthlyAsOfAverage(
  obs: Map<string, number | null>,
  months: readonly string[],
  cutoffDay = HF_CUTOFF_DAY,
): number[] {
  const sums = new Map<string, { s: number; n: number }>();
  for (const [date, v] of obs) {
    if (v == null || !Number.isFinite(v)) continue;
    if (Number(date.slice(8, 10)) > cutoffDay) continue;
    const key = `${date.slice(0, 7)}-01`;
    const cur = sums.get(key) ?? { s: 0, n: 0 };
    cur.s += v;
    cur.n += 1;
    sums.set(key, cur);
  }
  return months.map((m) => {
    const c = sums.get(m);
    return c ? c.s / c.n : NaN;
  });
}

function monthlyFromMap(obs: Map<string, number | null>, months: readonly string[]): number[] {
  const byMonth = new Map<string, number>();
  for (const [date, v] of obs) {
    if (v != null && Number.isFinite(v)) byMonth.set(`${date.slice(0, 7)}-01`, v);
  }
  return months.map((m) => byMonth.get(m) ?? NaN);
}

function latestDate(obs: Map<string, number | null>): string | null {
  let latest: string | null = null;
  for (const [d, v] of obs) if (v != null && (!latest || d > latest)) latest = d;
  return latest;
}

export async function loadUsCpiNowcastInputs(): Promise<LoadedInputs> {
  const fredIds = [
    ...Object.values(LEVEL_FRED_IDS),
    ...Object.values(HF_SOURCES).flatMap((s) => (s.kind === "fred" ? [s.id] : [])),
  ];
  const { maps } = await loadFredObservationMapsDbFirst(fredIds);
  const get = (id: string) => maps.get(id) ?? new Map<string, number | null>();

  // 目标月只在全部 CPI 输入都到齐后推进：发布日各分项分批入库，若只看总体 CPI，
  // 中间窗口里分项缺当月值，模型会错把下一个月当目标。
  const cpiIds = LEVEL_KEYS.filter((k) => k !== "PPIFOOD").map((k) => LEVEL_FRED_IDS[k]);
  const cpiLatest = cpiIds.map((id) => ({ id, date: latestDate(get(id)) }));
  const missing = cpiLatest.filter((x) => !x.date).map((x) => x.id);
  if (missing.length) throw new Error(`CPI 输入序列无观测：${missing.join(", ")}`);
  const latestCpi = cpiLatest.map((x) => x.date!).reduce((a, b) => (a < b ? a : b));
  const latestCpiMonth = `${latestCpi.slice(0, 7)}-01`;
  const targetMonth = addMonths(latestCpiMonth, 1);
  const months = monthRange(START_MONTH, targetMonth);

  const levels = Object.fromEntries(
    LEVEL_KEYS.map((k) => [k, monthlyFromMap(get(LEVEL_FRED_IDS[k]), months)]),
  ) as Record<LevelKey, number[]>;
  // 目标月的 CPI 尚未公布：确保为空（防御源端提前出现占位值）
  for (const k of LEVEL_KEYS) {
    if (k !== "PPIFOOD") levels[k][months.length - 1] = NaN;
  }

  const freshness: InputFreshness[] = LEVEL_KEYS.map((k) => ({
    key: k,
    seriesKey: `fred:${LEVEL_FRED_IDS[k]}`,
    latestDate: latestDate(get(LEVEL_FRED_IDS[k])),
  }));

  const hf = {} as Record<HfKey, number[]>;
  for (const k of HF_KEYS) {
    const src = HF_SOURCES[k];
    if (src.kind === "fred") {
      const obs = get(src.id);
      hf[k] = monthlyAsOfAverage(obs, months);
      freshness.push({ key: k, seriesKey: `fred:${src.id}`, latestDate: latestDate(obs) });
    } else {
      const series = await loadMonthlySeriesByCode(src.code);
      const obs = new Map<string, number | null>(series.months.map((m, i) => [m, series.values[i]!]));
      hf[k] = monthlyFromMap(obs, months);
      freshness.push({ key: k, seriesKey: `mds:${src.code}`, latestDate: latestDate(obs) });
    }
  }

  return { inputs: { months, levels, hf }, latestCpiMonth, targetMonth, freshness };
}

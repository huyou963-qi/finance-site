import type { FetchIncrementalResult, ObservationPoint } from "../types";
import { requestEStat, record, list } from "../eStat/client";

export type EStatSelection = {
  statsDataId: string;
  filters: Record<string, string>;
  frequency: "M" | "Q" | "A";
  expectedUnit?: string;
  historyStart?: string;
};

/** Decode published time labels, never mistake e-Stat's 10-digit classification codes for YYYYMMDD.
 * Fiscal years and other aggregate periods intentionally remain separate/unsupported.
 */
export function parseEStatTimeLabel(raw: string): { date: Date; frequency: "M" | "Q" | "A" } | null {
  const text = raw.normalize("NFKC").trim();
  let m = /^(\d{4})年(\d{1,2})月$/.exec(text);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { date: new Date(Date.UTC(+m[1], +m[2]-1, 1)), frequency: "M" };
  m = /^(\d{4})年(\d{1,2})[~～\-−](\d{1,2})月$/.exec(text);
  if (m && [1,4,7,10].includes(+m[2]) && +m[3] === +m[2]+2) return { date: new Date(Date.UTC(+m[1], +m[2]-1, 1)), frequency: "Q" };
  m = /^(\d{4})年(?:平均)?$/.exec(text);
  if (m) return { date: new Date(Date.UTC(+m[1], 0, 1)), frequency: "A" };
  return null;
}

function parsePage(json: unknown, selection?: EStatSelection): { points: ObservationPoint[]; skippedInvalid: number; fingerprint: string } {
  const root = record(record(json).GET_STATS_DATA);
  if (Number(record(root.RESULT).STATUS) !== 0) throw new Error("e-Stat unsuccessful or empty data response");
  const data = record(root.STATISTICAL_DATA);
  if (selection && record(data.TABLE_INF)["@id"] !== selection.statsDataId) throw new Error("e-Stat table identity changed");
  const classes = list(record(data.CLASS_INF).CLASS_OBJ);
  const timeClass = classes.find((c) => c["@id"] === "time");
  if (!timeClass) throw new Error("e-Stat time metadata missing");
  const times = new Map(list(timeClass.CLASS).map((c) => [String(c["@code"]), parseEStatTimeLabel(String(c["@name"]))]));
  const dimensions = classes.filter((c) => c["@id"] !== "time");
  const expected = new Map<string,string>();
  for (const dim of dimensions) {
    const id = String(dim["@id"]);
    const param = `cd${id[0].toUpperCase()}${id.slice(1)}`;
    const choices = list(dim.CLASS);
    const selected = selection?.filters[param] ?? (choices.length === 1 ? String(choices[0]["@code"]) : undefined);
    if (!selected || !choices.some((c) => String(c["@code"]) === selected)) throw new Error(`e-Stat dimension ${id} requires one fixed code`);
    expected.set(id, selected);
  }
  for (const param of Object.keys(selection?.filters ?? {})) {
    if (![...expected.keys()].some((id) => `cd${id[0].toUpperCase()}${id.slice(1)}` === param)) throw new Error("e-Stat filter dimension missing from schema");
  }
  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  const units = new Set<string>();
  const frequencies = new Set<string>();
  for (const row of list(record(data.DATA_INF).VALUE)) {
    for (const [id, code] of expected) if (String(row[`@${id}`]) !== code) throw new Error(`e-Stat mixed dimension ${id}`);
    for (const attr of Object.keys(row)) if (/^@(tab|area|cat\d+)$/.test(attr) && !expected.has(attr.slice(1))) throw new Error("e-Stat unclassified dimension");
    const timeCode = String(row["@time"]);
    if (!times.has(timeCode)) throw new Error("e-Stat unknown time code");
    const unit = String(row["@unit"] ?? "");
    units.add(unit);
    if (selection?.expectedUnit !== undefined && unit !== selection.expectedUnit) throw new Error("e-Stat unit changed");
    const time = times.get(timeCode);
    if (!time || (selection && time.frequency !== selection.frequency)) continue;
    if (selection?.historyStart && time.date.toISOString().slice(0,10) < selection.historyStart) continue;
    frequencies.add(time.frequency);
    const raw = String(row.$ ?? "").trim();
    if (["", "-", "...", "…", "***", "x", "X", "－"].includes(raw)) { skippedInvalid++; continue; }
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) throw new Error("e-Stat unknown numeric notation");
    const value = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(value)) throw new Error("e-Stat invalid numeric value");
    points.push({ obsDate: time.date, value });
  }
  if (units.size > 1 || frequencies.size > 1) throw new Error("e-Stat mixed units or frequency");
  points.sort((a,b) => a.obsDate.getTime()-b.obsDate.getTime());
  for (let i=1; i<points.length; i++) if (+points[i].obsDate === +points[i-1].obsDate) throw new Error("e-Stat duplicate observation period");
  return { points, skippedInvalid, fingerprint: JSON.stringify([[...expected], [...units]]) };
}

export function parseEStatObservations(json: unknown, selection?: EStatSelection): ObservationPoint[] { return parsePage(json, selection).points; }

/** Legacy key remains accepted only when the returned metadata proves a unique series.
 * Full history is intentional: Japanese official tables revise previous observations.
 */
export async function fetchEStatIncremental(sourceSeriesKey: string, _observationStart: string, metadata?: unknown): Promise<FetchIncrementalResult> {
  const config = record(record(metadata).eStat);
  const [legacyId, legacyCat] = sourceSeriesKey.split("|");
  const statsDataId = String(config.statsDataId ?? legacyId);
  if (!/^\d+$/.test(statsDataId)) throw new Error("e-Stat invalid statsDataId");
  let selection: EStatSelection | undefined;
  const filters = Object.fromEntries(Object.entries(record(config.filters)).map(([k,v]) => [k,String(v)]));
  if (legacyCat && !config.statsDataId) filters.cdCat01 = legacyCat;
  for (const [key,value] of Object.entries(filters)) if (!/^cd(?:Tab|Area|Cat\d{2})$/.test(key) || !/^[\w.-]+$/.test(value)) throw new Error("e-Stat invalid single-code filter");
  if (config.statsDataId) {
    if (!["M","Q","A"].includes(String(config.frequency))) throw new Error("e-Stat frequency missing");
    if (config.historyStart !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(config.historyStart))) throw new Error("e-Stat invalid historyStart");
    selection = { statsDataId, filters, frequency: config.frequency as EStatSelection["frequency"], ...(config.expectedUnit !== undefined ? { expectedUnit: String(config.expectedUnit) } : {}), ...(config.historyStart ? { historyStart: String(config.historyStart) } : {}) };
  }
  const points: ObservationPoint[] = [];
  let skippedInvalid = 0, startPosition = 1, fingerprint: string | undefined, total: number | undefined, received = 0;
  for (let page=0; page<1000; page++) {
    const json = await requestEStat("getStatsData", { statsDataId, ...filters, metaGetFlg: "Y", limit: 10000, startPosition });
    const parsed = parsePage(json, selection);
    if (fingerprint && parsed.fingerprint !== fingerprint) throw new Error("e-Stat page schema changed");
    fingerprint = parsed.fingerprint;
    points.push(...parsed.points); skippedInvalid += parsed.skippedInvalid;
    const data = record(record(json.GET_STATS_DATA).STATISTICAL_DATA);
    const result = record(data.RESULT_INF);
    const pageTotal = Number(result.TOTAL_NUMBER);
    if (!Number.isSafeInteger(pageTotal) || pageTotal < 0 || (total !== undefined && total !== pageTotal)) throw new Error("e-Stat pagination total changed");
    total = pageTotal; received += list(record(data.DATA_INF).VALUE).length;
    if (result.NEXT_KEY == null || result.NEXT_KEY === "") {
      if (received !== total) throw new Error("e-Stat incomplete pagination");
      points.sort((a,b) => +a.obsDate - +b.obsDate);
      for (let i=1;i<points.length;i++) if (+points[i].obsDate === +points[i-1].obsDate) throw new Error("e-Stat duplicate period across pages");
      if (!points.length) throw new Error("e-Stat selected series has no observations");
      return { points, skippedInvalid, sourceLatestObsDate: points.at(-1)!.obsDate };
    }
    const next = Number(result.NEXT_KEY);
    if (!Number.isSafeInteger(next) || next <= startPosition) throw new Error("e-Stat invalid NEXT_KEY");
    startPosition = next;
  }
  throw new Error("e-Stat pagination limit exceeded");
}

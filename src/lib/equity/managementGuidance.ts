/** Company-issued outlook only. Pure parser/projections; never analyst consensus or model estimates. */
export const GUIDANCE_PARSER_VERSION = 4;
export type GuidanceMetric = "revenue" | "grossMargin" | "eps" | "operatingExpenses" | "operatingIncome" | "capex" | "ocf" | "fcf" | "netLeverage";
export type GuidanceBasis = "gaap" | "nonGaap" | "company" | "unspecified";
export type GuidanceTarget = {
  key: string; label: string; horizon: "quarter" | "year" | "unknown";
  endDate: string | null;
};
export type GuidanceValue = {
  low: number | null; high: number | null; point: number | null;
  unit: "USD" | "USD/share" | "percent" | "multiple";
  qualifier: "range" | "point" | "approximate" | "atLeast" | "atMost" | "above" | "below";
};
export type GuidanceRecord = {
  metric: GuidanceMetric; basis: GuidanceBasis; target: GuidanceTarget; value: GuidanceValue | null;
  status: "active" | "withdrawn" | "unparsed";
  sourceUrl: string; evidence: string;
};
export type GuidanceVersion = GuidanceRecord & {
  id: string; accession: string; disclosedOn: string;
  dateBasis: "publication" | "filing";
};
export const GUIDANCE_NAMES: Record<GuidanceMetric, string> = {
  revenue: "营业收入", grossMargin: "毛利率", eps: "每股收益（EPS）", operatingExpenses: "营业费用",
  operatingIncome: "营业利润", capex: "资本开支", ocf: "经营现金流", fcf: "自由现金流", netLeverage: "净杠杆",
};
export const GUIDANCE_BASIS_NAMES: Record<GuidanceBasis, string> = { gaap: "GAAP", nonGaap: "Non-GAAP", company: "公司定义", unspecified: "口径未明确" };
export const GUIDANCE_GROUPS: Record<GuidanceMetric, string> = {
  revenue: "盈利与增长", grossMargin: "盈利与增长", eps: "盈利与增长", operatingExpenses: "盈利与增长", operatingIncome: "盈利与增长",
  capex: "现金流与资本配置", ocf: "现金流与资本配置", fcf: "现金流与资本配置", netLeverage: "资产负债与偿债目标",
};
const METRICS: [GuidanceMetric, RegExp][] = [
  ["grossMargin", /\bgross\s+margins?\b/i], ["eps", /\b(?:diluted\s+(?:earnings\s+per\s+share|EPS)|earnings\s+per\s+diluted\s+share|EPS)\b/i],
  ["operatingExpenses", /\boperating\s+expenses\b/i], ["operatingIncome", /\boperating\s+(?:income|profit)\b/i],
  ["capex", /\b(?:capital\s+expenditures?|capex)\b/i], ["ocf", /\b(?:operating\s+cash\s+flow|cash\s+flow\s+from\s+operations)\b/i],
  ["fcf", /\bfree\s+cash\s+flow\b/i], ["netLeverage", /\b(?:net\s+leverage|net\s+debt\s+to\s+(?:adjusted\s+)?EBITDA)\b/i], ["revenue", /\brevenues?\b/i],
];
const FORWARD = /\b(?:expect(?:s|ed)?|outlook|guidance|forecast|anticipate[sd]?|project(?:s|ed)?|target(?:s|ing)?|plan(?:s|ned)?)\b/i;
const WITHDRAW = /\b(?:withdraw(?:s|n|ing)?|suspend(?:s|ed|ing)?|no\s+longer\s+(?:providing|provide))\b/i;
const FORECAST_NOUN = /\b(?:guidance|outlook|forecast)\b/i;
const ACCOUNTING_PREFIX = /\b(?:non[- ]GAAP|GAAP|adjusted)\s*$/i;
const TABLE_UNITS = /^\(in (millions|billions)(?:, except [^)]+)?\)$/i;

function tableMetric(label: string): GuidanceMetric | undefined {
  return METRICS.find(([, pattern]) => {
    const match = pattern.exec(label);
    return match && (!match.index || ACCOUNTING_PREFIX.test(label.slice(0, match.index)))
      && /^[\s%*]*$/.test(label.slice(match.index + match[0].length));
  })?.[0];
}
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function endDate(text: string): string | null {
  const hit = text.match(/\b(?:quarter|year)\s+end(?:ing|ed|s)?\s+(?:(20\d{2}-\d{2}-\d{2})|([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2}))/i);
  if (!hit) return null;
  const month = MONTHS.indexOf(hit[2]?.toLowerCase());
  const day = hit[1] ?? (month >= 0 ? `${hit[4]}-${String(month + 1).padStart(2, "0")}-${hit[3].padStart(2, "0")}` : "");
  return /^20\d{2}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : null;
}
/** Explicit fiscal labels stay fiscal labels; never map them to calendar quarters. */
export function parseGuidanceTarget(text: string): GuidanceTarget | null {
  const end = endDate(text);
  const q = text.match(/\b(first|second|third|fourth|[1-4](?:st|nd|rd|th))\s+quarter\s+(?:of\s+)?(?:(fiscal|calendar)\s+(?:year\s+)?)?(20\d{2})\b/i)
    ?? text.match(/\b(first|second|third|fourth|[1-4](?:st|nd|rd|th))\s+(fiscal|calendar)\s+quarter\s+(?:of\s+)?(20\d{2})\b/i)
    ?? text.match(/\bQ([1-4])\s*(FY|CY)?\s*(20\d{2})\b/i);
  if (q) {
    const number = ({ first: "1", second: "2", third: "3", fourth: "4" } as Record<string, string>)[q[1].toLowerCase()] ?? q[1][0];
    const basis = /^(?:fiscal|FY)$/i.test(q[2] ?? "") ? "FY" : /^(?:calendar|CY)$/i.test(q[2] ?? "") ? "CY" : "Y";
    return { key: `${basis}${q[3]}Q${number}`, label: `${basis === "Y" ? "" : basis}${q[3]} Q${number}`, horizon: "quarter", endDate: end };
  }
  const year = text.match(/\b(fiscal\s+(?:year\s+)?|FY\s*|calendar\s+year\s+|full[- ]year\s+)(20\d{2})\b/i)
    ?? text.match(/\b(FY)\s*(\d{2})\b/i);
  if (year && !/\bquarter\b|\bQ[1-4]\b/i.test(text)) {
    const basis = /fiscal|FY/i.test(year[1]) ? "FY" : /calendar/i.test(year[1]) ? "CY" : "Y";
    const number = year[2].length === 2 ? `20${year[2]}` : year[2];
    return { key: `${basis}${number}`, label: `${basis === "Y" ? "" : basis}${number} 全年`, horizon: "year", endDate: end };
  }
  if (end) return { key: `${/\bquarter\b/i.test(text) ? "Q" : "FY"}:${end}`, label: `截至 ${end} 的${/\bquarter\b/i.test(text) ? "季度" : "全年"}`, endDate: end, horizon: /\bquarter\b/i.test(text) ? "quarter" : "year" };
  return null;
}
function basisOf(text: string, metric: GuidanceMetric): GuidanceBasis {
  if (/non[- ]GAAP|adjusted/i.test(text)) return "nonGaap";
  if (/\bGAAP\b/i.test(text)) return "gaap";
  return ["capex", "fcf", "netLeverage"].includes(metric) ? "company" : "unspecified";
}
const NUM = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const MONEY = new RegExp(`^\\$?\\s*(${NUM})\\s*(billion|million|bn|[BM])?\\b`, "i");
const scale = (unit?: string) => /^(billion|bn|b)$/i.test(unit ?? "") ? 1e9 : /^(million|m)$/i.test(unit ?? "") ? 1e6 : 1;
/** Deliberately narrow grammar. Ambiguous growth, currencies, multiple metrics or negative EPS remain quotes. */
export function parseGuidanceValue(after: string, metric: GuidanceMetric, tableUsdScale?: number): GuidanceValue | null {
  if (/growth|increase|decrease|decline|versus|compared|respectively|€|£|\b(?:EUR|GBP|CAD|AUD)\b/i.test(after)) return null;
  let text = after.replace(/^\s*(?:\|\s*)?/, "").replace(/^(?:(?:is|are|will\s+be)\s+)?(?:(?:now\s+)?(?:expected|anticipated|forecast|projected)\s+(?:to\s+be\s+|at\s+)?)?(?:in\s+the\s+range\s+of\s+|between\s+|of\s+|to\s+be\s+|to\s+)?/i, "").trim();
  const qualifierMatch = text.match(/^(approximately|about|around|at\s+least|at\s+most|no\s+more\s+than|exceed|above|over|below|under)\s+/i);
  const q = qualifierMatch?.[1]?.toLowerCase();
  if (qualifierMatch) text = text.slice(qualifierMatch[0].length);
  const qualifier: GuidanceValue["qualifier"] = q && /approximately|about|around/.test(q) ? "approximate" : q === "at least" ? "atLeast" : q && /at most|no more/.test(q) ? "atMost" : q && /exceed|above|over/.test(q) ? "above" : q ? "below" : "point";
  const unit = metric === "grossMargin" ? "percent" : metric === "netLeverage" ? "multiple" : metric === "eps" ? "USD/share" : "USD";
  const first = text.match(MONEY);
  if (!first) return null;
  const rest = text.slice(first[0].length);
  const range = rest.match(new RegExp(`^\\s*(?:%|x|times)?\\s*(?:to|and|[-–—])\\s*\\$?\\s*(${NUM})\\s*(billion|million|bn|[BM])?`, "i"));
  const number = Number(first[1].replace(/,/g, ""));
  const moneyScale = first[2] ?? range?.[2];
  const low = number * (unit === "USD" ? moneyScale ? scale(moneyScale) : tableUsdScale ?? 1 : 1);
  if (unit === "USD" && !moneyScale && tableUsdScale == null) return null;
  if (unit === "USD/share" && !/^\$/.test(text)) return null;
  if (unit === "percent" && !/%/.test(text.slice(0, first[0].length + (range?.[0].length ?? 0) + 3))) return null;
  if (unit === "multiple" && !/\b(?:x|times)\b/.test(text)) return null;
  if (!Number.isFinite(low)) return null;
  if (range) {
    const high = Number(range[1].replace(/,/g, "")) * (unit === "USD" ? moneyScale ? scale(range[2] ?? first[2]) : tableUsdScale ?? 1 : 1);
    if (!Number.isFinite(high) || high < low || qualifier !== "point") return null;
    return { low, high, point: null, unit, qualifier: "range" };
  }
  const tolerance = rest.match(/(?:±|\+\s*\/?\s*-|plus\s+or\s+minus)\s*(\d+(?:\.\d+)?)\s*(%|percent|basis\s+points)/i);
  if (tolerance) {
    const amount = Number(tolerance[1]);
    const delta = /basis/i.test(tolerance[2]) ? amount / 100 : unit === "percent" ? amount : low * amount / 100;
    if ((unit !== "USD" && unit !== "percent") || (unit === "USD" && /basis/i.test(tolerance[2])) || delta <= 0 || (unit === "USD" && amount > 100)) return null;
    return { low: low - delta, high: low + delta, point: low, unit, qualifier: "range" };
  }
  if (/\bat\s+least\b|\bexceed|\babove\b|\bover\b/i.test(rest)) return null;
  return { low: ["atLeast", "above"].includes(qualifier) ? low : null, high: ["atMost", "below"].includes(qualifier) ? low : null,
    point: ["point", "approximate"].includes(qualifier) ? low : null, qualifier, unit };
}

/** Use the grammatical object of the withdrawal, excluding neighboring disclosures. */
function withdrawalScope(line: string): string | null {
  const action = WITHDRAW.exec(line);
  if (!action) return null;
  const before = line.slice(0, action.index);
  if (/\b(?:not|never|if|whether|may|might|could|previously|consider(?:s|ed|ing)?)\b/i.test(before)) return null;
  const after = line.slice(action.index + action[0].length);
  if (/^\s+(?:from|to)\b/i.test(after)) return null;
  const object = after.split(/;\s+|,\s+(?=which|because|while|but)\b|\s+and\s+(?:(?:is|are|will be)\s+)?(?:provid\w*|updat\w*|reaffirm\w*|maintain\w*|replac\w*)\b/i)[0];
  if (/\b(?:except|exception|other than|unless)\b/i.test(after)) return null;
  const noun = FORECAST_NOUN.exec(object);
  if (noun && !/\b(?:which|because|that|resulting|resulted|due to)\b/i.test(object.slice(0, noun.index))) {
    const end = noun.index + noun[0].length;
    const suffix = object.slice(end);
    // Permit a trailing period or an explicitly enumerated list, not incidental metrics.
    return /^\s*[, ]?\s*including\b/i.test(suffix) ? object : object.slice(0, end) + (parseGuidanceTarget(suffix) ? suffix.replace(/\s*\b(?:and|while|but)\b.*$/i, "") : "");
  }
  // Passive voice and table rows, e.g. "FY2020 EPS guidance: withdrawn".
  if (/^\s*[.!?\s]*$/.test(after) && FORECAST_NOUN.test(before)) return before;
  return null;
}

/** Partition a coordinated forecast only when each metric has its own value. */
function coordinatedValues(line: string, target: GuidanceTarget): Pick<GuidanceRecord, "metric" | "basis" | "value">[] {
  if (target.horizon === "unknown") return [];
  const lead = line.match(/\b(?:we|the company)\s+(?:expect|expects|anticipate|anticipates|forecast|forecasts)\s+/i);
  if (!lead || /\b(?:not|if|would|could|unless)\b/i.test(line)) return [];
  const body = line.slice(lead.index! + lead[0].length)
    .replace(/,\s*(?:up|down)\s+[\d.]+%?\s+and\s+[\d.]+\s*(?:%|percent)\s+year[- ]over[- ]year,?\s+respectively[.!?"”]*$/i, "");
  if (/\b(?:quarter|fiscal|full[- ]year|Q[1-4]|FY\d{2,4}|prior|previous|reported|actual)\b/i.test(body)) return [];
  const metrics = METRICS.flatMap(([metric, pattern]) => {
    const match = pattern.exec(body);
    if (!match) return [];
    const prefix = ACCOUNTING_PREFIX.exec(body.slice(0, match.index));
    return [{ metric, start: prefix?.index ?? match.index, end: match.index + match[0].length, basis: basisOf(prefix?.[0] ?? "", metric) }];
  }).sort((a, b) => a.start - b.start);
  if (metrics.length < 2 || body.slice(0, metrics[0].start).trim()) return [];
  const values = metrics.map(({ metric, basis, end }, i) => {
    const next = metrics[i + 1];
    const span = body.slice(end, next?.start);
    if (next && !/(?:,|\band|\bwith)\s*$/i.test(span)) return { metric, basis, value: null };
    return { metric, basis, value: parseGuidanceValue(span.replace(/(?:,|\band|\bwith)[\s,]*$/i, ""), metric) };
  });
  return values.every(row => row.value !== null) ? values : [];
}

export function extractManagementGuidance(attachments: { text: string; url: string }[]): GuidanceRecord[] {
  const records: GuidanceRecord[] = [];
  for (const attachment of attachments) {
    if (!/^https:\/\/www\.sec\.gov\/Archives\//.test(attachment.url)) continue;
    let scope: GuidanceTarget | null = null;
    let inOutlook = false;
    let tableUsdScale: number | undefined;
    // Existing HTML snapshots can have a line break inside a table cell.
    const text = attachment.text.replace(/^([^\n|]+)\n(?=[ \t]*\|[ \t]*[^|\s])/gm,
      (whole, label: string) => TABLE_UNITS.test(label.trim()) || tableMetric(label.trim()) ? label + " " : whole);
    for (const raw of text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)) {
      const evidence = raw.replace(/\s+/g, " ").trim();
      const line = evidence.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ");
      if (!line || line.length > 1800) continue;
      if (/forward[- ]looking\s+statements|safe\s+harbor|reconciliation|consolidated\s+(?:statements|balance)|results\s+of\s+operations/i.test(line) || /^(?:highlights|(?:business|financial(?: and operational)?) highlights|CFO commentary|conference call|non[- ]GAAP measures|about\s)/i.test(line)) { scope = null; inOutlook = false; tableUsdScale = undefined; continue; }
      if (WITHDRAW.test(line)) {
        const object = withdrawalScope(line);
        if (!object) continue;
        const target = parseGuidanceTarget(object) ?? (inOutlook && !/\b(?:20\d{2}|FY\s*\d{2,4}|(?:prior|last|next|previous|full)[ -](?:quarter|year))\b/i.test(object) ? scope : null);
        const metrics = METRICS.filter(([, pattern]) => pattern.test(object));
        // A withdrawal must identify both the covered metric(s) and period to affect a version.
        if (metrics.length !== 1 && /non[- ]GAAP|adjusted|\bGAAP\b/i.test(object)) continue;
        if (target) for (const [metric] of metrics) {
          records.push({ metric, basis: basisOf(object, metric), target, value: null, status: "withdrawn", sourceUrl: attachment.url, evidence });
        }
        continue;
      }
      const ownTarget = parseGuidanceTarget(line);
      const cells = evidence.split("|").map(cell => cell.trim()).filter(Boolean);
      if (inOutlook && scope && cells.length >= 2) {
        const units = cells[0].match(TABLE_UNITS);
        const headerYear = cells[1].match(/^(?:FY\s*)?(20\d{2})\s+(?:financial\s+)?guidance\*?$/i)?.[1];
        if (units && headerYear && scope.horizon === "year" && scope.key.endsWith(headerYear)) {
          tableUsdScale = scale(units[1].slice(0, -1));
          continue;
        }
        if (tableUsdScale) {
          const metric = tableMetric(cells[0]);
          if (metric && /^[\s$\d,.%–—-]+$/.test(cells[1])) {
            const value = parseGuidanceValue(cells[1], metric, tableUsdScale);
            if (value) records.push({ metric, basis: basisOf(cells[0], metric), target: scope, value, status: "active", sourceUrl: attachment.url, evidence });
            if (value) continue;
          }
          tableUsdScale = undefined;
        }
      } else if (!evidence.startsWith("|")) {
        tableUsdScale = undefined;
      }
      const heading = /outlook|guidance|forecast/i.test(line) && line.length < 220 && (ownTarget || !METRICS.some(([, pattern]) => pattern.test(line)));
      if (heading) { scope = ownTarget; inOutlook = true; }
      const hits = METRICS.map(([metric, pattern]) => ({ metric, hit: line.match(pattern) })).filter(x => x.hit);
      if (!hits.length || !(inOutlook || FORWARD.test(line))) continue;
      if (/\bassum(?:e[sd]?|ing|ptions?)\b/i.test(line) && !/\b(?:expect|expects|expected|guidance|forecast|target)\b/i.test(line)) continue;
      if (!FORWARD.test(line) && /\b(?:was|were|reported|delivered|generated|recorded|increased|grew|decreased)\b/i.test(line)) continue;
      // A new explicit period wins; never carry a quarter into an explicit annual statement.
      const unresolved = { key: "unresolved", label: "目标财期待确认", horizon: "unknown" as const, endDate: null };
      const ambiguousPeriod = /\b20\d{2}\b|\b(?:next|following|full|previous|last)[ -](?:quarter|year)\b|\bexit\s+(?:the\s+)?year\b/i.test(line) && !ownTarget;
      const target = ownTarget ?? (ambiguousPeriod ? unresolved : scope) ?? unresolved;
      if (hits.length > 1) {
        const values = coordinatedValues(line, target);
        if (values.length) {
          records.push(...values.map(value => ({ ...value, target, status: "active" as const, sourceUrl: attachment.url, evidence })));
          continue;
        }
      }
      for (const { metric, hit } of hits) {
        const mixed = hits.length > 1 || /GAAP\s+and\s+non[- ]GAAP/i.test(line);
        const after = line.slice(hit!.index! + hit![0].length);
        const pair = hits.length === 1 && /\bGAAP\s+and\s+non[- ]GAAP/i.test(line) && after.match(/^(.*?)\band\b(.*?),?\s*respectively\b(.*)$/i);
        if (pair && target.horizon !== "unknown") {
          for (const [basis, part] of [["gaap", pair[1]], ["nonGaap", pair[2]]] as const) {
            const prefix = basis === "nonGaap" && /approximately|about|around/i.test(pair[1]) ? "approximately " : "";
            const value = parseGuidanceValue(`${prefix}${part.trim()}${pair[3]}`, metric);
            records.push({ metric, basis, target, value, status: value ? "active" : "unparsed", sourceUrl: attachment.url, evidence: evidence.slice(0, 1800) });
          }
          continue;
        }
        if (hits.length === 1 && /\bGAAP\s+and\s+non[- ]GAAP/i.test(line) && !/\band\b|respectively/i.test(after) && target.horizon !== "unknown") {
          const value = parseGuidanceValue(after, metric);
          for (const basis of ["gaap", "nonGaap"] as const) records.push({ metric, basis, target, value, status: value ? "active" : "unparsed", sourceUrl: attachment.url, evidence: evidence.slice(0, 1800) });
          continue;
        }
        const value = mixed || target.horizon === "unknown" ? null : parseGuidanceValue(after, metric);
        records.push({ metric, basis: mixed ? "unspecified" : basisOf(line, metric), target, value,
          status: value ? "active" : "unparsed", sourceUrl: attachment.url, evidence: evidence.slice(0, 1800) });
      }
    }
  }
  return [...new Map(records.map(r => [`${guidanceKey(r)}|${r.sourceUrl}|${r.evidence}`, r])).values()].slice(0, 100);
}
export function guidanceKey(r: GuidanceRecord): string {
  return `${r.metric}|${r.basis}|${r.target.key}|${r.target.endDate ?? ""}${r.target.key === "unresolved" && "accession" in r ? `|${r.accession}` : ""}`;
}
export function guidanceMidpoint(value: GuidanceValue): number | null {
  if (value.qualifier === "range" && value.low != null && value.high != null) return (value.low + value.high) / 2;
  return ["point", "approximate"].includes(value.qualifier) ? value.point : null;
}
export type GuidanceSeries = { latest: GuidanceVersion; history: GuidanceVersion[]; change: { delta: number; kind: "percent" | "pp" | "absolute" } | null };
function valueRank(record: GuidanceVersion): number {
  return record.status === "withdrawn" ? 0 : record.value?.qualifier === "range" ? 1 : record.status === "active" ? 2 : 3;
}
function compatibleValues(a: GuidanceValue, b: GuidanceValue): boolean {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  if (a.unit !== b.unit) return false;
  // A repeated presentation table often shows just the centre of the prose's +/- interval.
  const range = a.qualifier === "range" ? a : b.qualifier === "range" ? b : null;
  const point = range === a ? b : a;
  return Boolean(range && ["point", "approximate"].includes(point.qualifier) && point.point === guidanceMidpoint(range));
}
export function buildGuidanceSeries(versions: GuidanceVersion[]): GuidanceSeries[] {
  const groups = new Map<string, GuidanceVersion[]>();
  for (const record of versions) { const key = guidanceKey(record); groups.set(key, [...(groups.get(key) ?? []), record]); }
  return [...groups.values()].map(rawHistory => {
    const announcements = new Map<string, GuidanceVersion[]>();
    for (const record of rawHistory) announcements.set(record.accession, [...(announcements.get(record.accession) ?? []), record]);
    const history = [...announcements.values()].map(records => {
      records.sort((a, b) => valueRank(a) - valueRank(b));
      const representative = records[0];
      const conflict = representative.value && records.some(r => r.value && !compatibleValues(representative.value!, r.value));
      return conflict ? { ...representative, value: null, status: "unparsed" as const } : representative;
    }).sort((a, b) => b.disclosedOn.localeCompare(a.disclosedOn) || b.accession.localeCompare(a.accession));
    // Conflicting statements from one announcement are retained as evidence, never arbitrarily selected.
    const original = history[0];
    const withdrawal = versions.find(v => v.status === "withdrawn" && v.metric === original.metric && v.target.key === original.target.key && v.target.endDate === original.target.endDate && (v.basis === original.basis || v.basis === "unspecified") && v.disclosedOn >= original.disclosedOn);
    const latest = withdrawal ? { ...original, status: "withdrawn" as const, value: null, evidence: withdrawal.evidence, sourceUrl: withdrawal.sourceUrl, disclosedOn: withdrawal.disclosedOn, dateBasis: withdrawal.dateBasis, accession: withdrawal.accession, id: withdrawal.id } : original;
    const conflict = latest.value != null && history.some(h => h.disclosedOn === latest.disclosedOn && h.value != null && !compatibleValues(h.value, latest.value!));
    const prior = history.find(h => h.disclosedOn < latest.disclosedOn);
    const curr = latest.value && guidanceMidpoint(latest.value), prev = prior?.value && guidanceMidpoint(prior.value);
    const comparable = !conflict && latest.status === "active" && prior?.status === "active" && curr != null && prev != null
      && latest.basis !== "unspecified" && latest.basis !== "company" && latest.metric !== "eps";
    const change = comparable ? { delta: latest.value!.unit === "percent" ? curr - prev : prev > 0 ? (curr / prev - 1) * 100 : curr - prev,
      kind: latest.value!.unit === "percent" ? "pp" as const : prev > 0 ? "percent" as const : "absolute" as const } : null;
    const completeHistory = withdrawal ? [withdrawal, ...history.filter(h => h.accession !== withdrawal.accession)] : history;
    return { latest: conflict && latest.status !== "withdrawn" ? { ...latest, value: null, status: "unparsed" as const } : latest, history: completeHistory, change };
  }).sort((a, b) => b.latest.disclosedOn.localeCompare(a.latest.disclosedOn) || a.latest.metric.localeCompare(b.latest.metric));
}

export type GuidanceActual = { endDate: string; horizon: "quarter" | "year"; metric: GuidanceMetric; basis: GuidanceBasis; value: number; unit: GuidanceValue["unit"]; reportedOn: string; sourceUrl: string };
export type GuidanceDelivery = { guidance: GuidanceVersion; actual: GuidanceActual; outcome: "above" | "within" | "below" | "met" | "missed" | "point"; midpointDelta: number | null };
/** Exact period, currency, accounting basis; use only guidance publicly known before the period ended. */
export function compareGuidanceActual(record: GuidanceVersion, actual: GuidanceActual): GuidanceDelivery | null {
  const value = record.value;
  if (!value || record.status !== "active" || record.basis === "unspecified" || record.basis === "company" || record.target.endDate !== actual.endDate || record.target.horizon !== actual.horizon || record.metric !== actual.metric || record.basis !== actual.basis || value.unit !== actual.unit || record.disclosedOn >= actual.endDate || actual.reportedOn <= record.disclosedOn || !Number.isFinite(actual.value)) return null;
  let outcome: GuidanceDelivery["outcome"] = "point";
  if (value.qualifier === "range") outcome = actual.value < value.low! ? "below" : actual.value > value.high! ? "above" : "within";
  else if (["atLeast", "above"].includes(value.qualifier)) outcome = (value.qualifier === "above" ? actual.value > value.low! : actual.value >= value.low!) ? "met" : "missed";
  else if (["atMost", "below"].includes(value.qualifier)) outcome = (value.qualifier === "below" ? actual.value < value.high! : actual.value <= value.high!) ? "met" : "missed";
  const mid = guidanceMidpoint(value);
  return { guidance: record, actual, outcome, midpointDelta: mid == null ? null : actual.value - mid };
}
export function buildGuidanceDeliveries(versions: GuidanceVersion[], actuals: GuidanceActual[]): GuidanceDelivery[] {
  const delivery: GuidanceDelivery[] = [];
  for (const actual of actuals) {
    // Build the version chain as it stood before the target period ended. This also applies
    // withdrawals and same-announcement conflicts without reviving a stale numeric value.
    const available = versions.filter(v => v.target.endDate === actual.endDate && v.disclosedOn < actual.endDate);
    for (const group of buildGuidanceSeries(available)) {
      const comparison = compareGuidanceActual(group.latest, actual);
      if (comparison) delivery.push(comparison);
    }
  }
  return delivery;
}
export function formatGuidanceValue(value: GuidanceValue | null): string {
  if (!value) return "待确认，查看原文";
  const format = (v: number) => value.unit === "USD" ? `${(v / (Math.abs(v) >= 1e9 ? 1e9 : 1e6)).toLocaleString("en-US", { maximumFractionDigits: 2 })}${Math.abs(v) >= 1e9 ? "B" : "M"}`
    : `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${value.unit === "percent" ? "%" : value.unit === "multiple" ? "×" : ""}`;
  if (value.qualifier === "range") return `${format(value.low!)}–${format(value.high!)}`;
  return `${({ point: "", approximate: "约 ", atLeast: "≥", atMost: "≤", above: ">", below: "<", range: "" })[value.qualifier]}${format(value.point ?? value.low ?? value.high!)}`;
}

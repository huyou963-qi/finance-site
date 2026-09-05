/**
 * 解析 ISM 官网月报 HTML 的 At a Glance 表 → 各分项最新值。
 *
 * 制造业：/pmi/{month}/ 表「MANUFACTURING AT A GLANCE」
 * 服务业：/services/{month}/ 对照表第一组数值列为服务业（后组是制造业对照，忽略）
 *
 * 观测期来自标题 "July 2026 ISM® … Report" → 月首 UTC。
 * 找不到锚点表、headline 缺失、日期无法解析 → throw。
 */
import type { ObservationPoint } from "../types";
import {
  ISM_OFFICIAL_MFG_SERIES,
  ISM_OFFICIAL_SVC_SERIES,
  type IsmOfficialReportKind,
  type IsmOfficialSeriesDef,
} from "./catalog";

export type IsmOfficialParsedReport = {
  kind: IsmOfficialReportKind;
  obsDate: Date;
  titleMonthText: string;
  pointsByCode: Map<string, ObservationPoint>;
};

const MONTH_ABBR: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export function isIsmReportUnavailable(html: string): boolean {
  return /content you are looking for is no longer available/i.test(html);
}

export function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeLabel(raw: string): string {
  return raw
    .replace(/®/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseNumber(raw: string): number | null {
  const s = stripTags(raw).replace(/,/g, "").trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function extractTables(html: string): string[] {
  const out: string[] = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[0]!);
  return out;
}

export function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tableHtml))) {
    const cells = [...m[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) =>
      stripTags(x[1] ?? ""),
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function parseIsmReportTitleMonth(html: string): { text: string; obsDate: Date } | null {
  const text = stripTags(html);
  const m =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s+ISM/i.exec(
      text,
    ) ??
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i.exec(
      text,
    );
  if (!m) return null;
  const month = MONTH_ABBR[m[1]!.toLowerCase()];
  if (month == null) return null;
  const year = Number(m[2]);
  return {
    text: `${m[1]} ${m[2]}`,
    obsDate: new Date(Date.UTC(year, month, 1)),
  };
}

function labelsFor(def: IsmOfficialSeriesDef): string[] {
  return [def.officialLabel, ...(def.officialLabelAliases ?? [])].map(normalizeLabel);
}

export function findSeries(
  defs: readonly IsmOfficialSeriesDef[],
  rowLabel: string,
): IsmOfficialSeriesDef | null {
  const key = normalizeLabel(rowLabel);
  if (!key || key.startsWith("overall") || key.endsWith("sector") || key === "index") {
    return null;
  }
  return defs.find((d) => labelsFor(d).includes(key)) ?? null;
}

export function firstNumericCell(cells: string[]): number | null {
  for (let i = 1; i < cells.length; i++) {
    const n = parseNumber(cells[i]!);
    if (n != null) return n;
  }
  return null;
}

function scoreGlanceTable(rows: string[][], kind: IsmOfficialReportKind): number {
  const blob = rows.map((r) => r.join(" ")).join(" | ").toLowerCase();
  if (kind === "manufacturing") {
    if (!blob.includes("manufacturing pmi")) return 0;
    if (!blob.includes("new orders")) return 0;
    return 2 + (blob.includes("customers") ? 1 : 0);
  }
  if (!blob.includes("services pmi")) return 0;
  if (!blob.includes("business activity")) return 0;
  return 2 + (blob.includes("inventory sentiment") ? 1 : 0);
}

function parseGlanceRows(
  rows: string[][],
  defs: readonly IsmOfficialSeriesDef[],
  obsDate: Date,
): Map<string, ObservationPoint> {
  const out = new Map<string, ObservationPoint>();
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const def = findSeries(defs, cells[0] ?? "");
    if (!def) continue;
    const value = firstNumericCell(cells);
    if (value == null) continue;
    if (value < 0 || value > 100) {
      throw new Error(`ISM 官网报告：${def.officialLabel} 值 ${value} 超出 [0,100]`);
    }
    out.set(def.code, { obsDate, value });
  }
  return out;
}

export function parseIsmOfficialReport(
  html: string,
  kind: IsmOfficialReportKind,
): IsmOfficialParsedReport {
  if (isIsmReportUnavailable(html)) {
    throw new Error("ISM 官网报告页不可用（content no longer available）");
  }

  const title = parseIsmReportTitleMonth(html);
  if (!title) {
    throw new Error("ISM 官网报告：无法从标题解析观测月份（页面结构可能已变）");
  }

  const now = new Date();
  const horizon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  if (title.obsDate.getTime() > horizon.getTime()) {
    throw new Error(`ISM 官网报告：观测期 ${title.text} 异常偏未来`);
  }

  const defs = kind === "manufacturing" ? ISM_OFFICIAL_MFG_SERIES : ISM_OFFICIAL_SVC_SERIES;
  let best: { score: number; rows: string[][] } | null = null;
  for (const table of extractTables(html)) {
    const rows = extractRows(table);
    const score = scoreGlanceTable(rows, kind);
    if (score > (best?.score ?? 0)) best = { score, rows };
  }
  if (!best || best.score < 2) {
    throw new Error(
      kind === "manufacturing"
        ? "ISM 官网制造业报告：未找到 At a Glance 表（缺 Manufacturing PMI / New Orders）"
        : "ISM 官网服务业报告：未找到 At a Glance 表（缺 Services PMI / Business Activity）",
    );
  }

  const pointsByCode = parseGlanceRows(best.rows, defs, title.obsDate);
  const headlineCode = defs[0]!.code;
  if (!pointsByCode.has(headlineCode)) {
    throw new Error(`ISM 官网报告：未解析到 headline（${defs[0]!.officialLabel}）`);
  }

  return {
    kind,
    obsDate: title.obsDate,
    titleMonthText: title.text,
    pointsByCode,
  };
}

export function pointForOfficialCode(
  parsed: IsmOfficialParsedReport,
  code: string,
): ObservationPoint | null {
  return parsed.pointsByCode.get(code) ?? null;
}

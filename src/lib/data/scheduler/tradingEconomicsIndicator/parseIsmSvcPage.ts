import {
  ISM_SVC_SECTOR_TO_TE_LABEL,
  TE_ISM_SVC_PAGE_URL,
} from "./ismSvcCatalog";
import type { TeIsmParsedPage, TeIsmSeriesPoint } from "./parseIsmPage";
import {
  parseIsmCalendarRows,
  referenceTextToObsDate,
} from "./parseIsmPage";

export type { TeIsmParsedPage, TeIsmSeriesPoint };

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/[,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function extractTableChunk(html: string, headerLabel: string): string | null {
  const marker = `>${headerLabel}</th>`;
  const headerIdx = html.indexOf(marker);
  if (headerIdx < 0) return null;
  const tableStart = html.lastIndexOf("<table", headerIdx);
  if (tableStart < 0) return null;
  const tableEnd = html.indexOf("</table>", headerIdx);
  if (tableEnd < 0) return null;
  return html.slice(tableStart, tableEnd + "</table>".length);
}

function parseDatatableRows(tableHtml: string): TeIsmSeriesPoint[] {
  const out: TeIsmSeriesPoint[] = [];
  const trRe =
    /<tr[^>]*class=['"]datatable-row[^'"]*['"][^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tableHtml))) {
    const row = m[1]!;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) =>
      stripTags(x[1] ?? ""),
    );
    if (tds.length < 5) continue;
    const label = tds[0]!;
    const value = parseNumber(tds[1] ?? "");
    if (value == null || !label) continue;
    const previous = parseNumber(tds[2] ?? "");
    const referenceText = tds[4] ?? tds[3] ?? "";
    const obsDate = referenceTextToObsDate(referenceText);
    if (!obsDate) continue;
    out.push({
      label,
      value,
      previous,
      referenceText,
      obsDate,
      releaseDate: null,
    });
  }
  return out;
}

function extractBlockText(html: string, id: string): string {
  const re = new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)<\\/h[23]>`, "i");
  const m = re.exec(html);
  return m ? stripTags(m[1] ?? "") : "";
}

/** 服务业页 Related 表不含 headline，从 Summary / meta 文本解析 */
function parseHeadlineFromNarrative(
  html: string,
  components: TeIsmSeriesPoint[],
): TeIsmSeriesPoint | null {
  const texts = [
    extractBlockText(html, "description"),
    extractBlockText(html, "stats"),
    stripTags(
      html.match(/name="description"\s+content="([^"]+)"/i)?.[1] ?? "",
    ),
  ].filter(Boolean);

  for (const text of texts) {
    const svc = /The ISM Services PMI (?:increased|decreased|rose|fell|inched down|inched up|was unchanged) to ([\d.]+) in ([A-Za-z]+ \d{4})/i.exec(
      text,
    );
    if (svc) {
      const value = parseNumber(svc[1]!);
      const obsDate = referenceTextToObsDate(svc[2]!);
      if (value != null && obsDate) {
        return {
          label: ISM_SVC_SECTOR_TO_TE_LABEL.headline!,
          value,
          previous: null,
          referenceText: svc[2]!,
          obsDate,
          releaseDate: null,
        };
      }
    }

    const stats =
      /Non Manufacturing PMI in the United States (?:increased|decreased|rose|fell) to ([\d.]+) points in ([A-Za-z]+) from [\d.]+ points in [A-Za-z]+ of (\d{4})/i.exec(
        text,
      );
    if (stats) {
      const value = parseNumber(stats[1]!);
      const refText = `${stats[2]!} ${stats[3]!}`;
      const obsDate = referenceTextToObsDate(refText);
      if (value != null && obsDate) {
        return {
          label: ISM_SVC_SECTOR_TO_TE_LABEL.headline!,
          value,
          previous: null,
          referenceText: refText,
          obsDate,
          releaseDate: null,
        };
      }
    }
  }

  const refFromComponent = components[0]?.referenceText;
  if (!refFromComponent) return null;

  for (const text of texts) {
    const m = /to ([\d.]+) in [A-Za-z]+ \d{4}/i.exec(text);
    if (!m) continue;
    const value = parseNumber(m[1]!);
    const obsDate = referenceTextToObsDate(refFromComponent);
    if (value == null || !obsDate) continue;
    return {
      label: ISM_SVC_SECTOR_TO_TE_LABEL.headline!,
      value,
      previous: null,
      referenceText: refFromComponent,
      obsDate,
      releaseDate: null,
    };
  }

  return null;
}

function parseCalendarTable(html: string): TeIsmParsedPage["latestCalendarRelease"] {
  const rows = parseIsmCalendarRows(html)
    .map((row) => {
      if (row.actual == null) return null;
      return {
        calendarDate: row.calendarDate,
        referenceText: row.referenceText,
        actual: row.actual,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (rows.length === 0) return null;
  rows.sort((a, b) => b.calendarDate.getTime() - a.calendarDate.getTime());
  return rows[0]!;
}

function pickHeadline(
  html: string,
  components: TeIsmSeriesPoint[],
  calendar: TeIsmParsedPage["latestCalendarRelease"],
): TeIsmSeriesPoint | null {
  const fromNarrative = parseHeadlineFromNarrative(html, components);
  if (fromNarrative) {
    if (calendar) {
      const obsDate =
        referenceTextToObsDate(calendar.referenceText, calendar.calendarDate) ??
        fromNarrative.obsDate;
      return {
        ...fromNarrative,
        value: calendar.actual ?? fromNarrative.value,
        referenceText: calendar.referenceText || fromNarrative.referenceText,
        obsDate,
        releaseDate: calendar.calendarDate,
      };
    }
    return fromNarrative;
  }

  if (calendar) {
    const obsDate = referenceTextToObsDate(calendar.referenceText, calendar.calendarDate);
    if (obsDate) {
      return {
        label: ISM_SVC_SECTOR_TO_TE_LABEL.headline!,
        value: calendar.actual,
        previous: null,
        referenceText: calendar.referenceText,
        obsDate,
        releaseDate: calendar.calendarDate,
      };
    }
  }

  return null;
}

/** 解析 TE non-manufacturing-pmi 页：headline + 4 个分项 */
export function parseTradingEconomicsIsmSvcPage(html: string): TeIsmParsedPage {
  const componentsChunk = extractTableChunk(html, "Components");
  const components = componentsChunk ? parseDatatableRows(componentsChunk) : [];
  const latestCalendarRelease = parseCalendarTable(html);
  const headline = pickHeadline(html, components, latestCalendarRelease);

  return {
    headline,
    components,
    latestCalendarRelease,
    fetchedAt: new Date().toISOString(),
  };
}

export function seriesPointForTeLabel(
  parsed: TeIsmParsedPage,
  teLabel: string,
): TeIsmSeriesPoint | null {
  if (teLabel === ISM_SVC_SECTOR_TO_TE_LABEL.headline) {
    return parsed.headline;
  }
  return parsed.components.find((c) => c.label === teLabel) ?? null;
}

export function seriesPointForSector(
  parsed: TeIsmParsedPage,
  sector: string,
): TeIsmSeriesPoint | null {
  const label = ISM_SVC_SECTOR_TO_TE_LABEL[sector];
  if (!label) return null;
  return seriesPointForTeLabel(parsed, label);
}

export const TE_ISM_SVC_PARSE_SOURCE_URL = TE_ISM_SVC_PAGE_URL;

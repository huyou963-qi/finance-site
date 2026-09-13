import { JP_METI_RETAIL_TITLE, jpMetiRetailEStatDownloadUrl } from "./catalog";

export type JpMetiRetailDiscoveredFile = {
  statInfId: string;
  surveyYear: number;
  releaseDate: string | null;
  downloadUrl: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
}

/** Locate the exact current long-series table, rather than pinning a statInfId
 * which e-Stat may replace when METI publishes the next confirmed workbook. */
export function parseJpMetiRetailFileList(html: string): JpMetiRetailDiscoveredFile {
  const normalized = decodeHtml(html).replace(/\s+/g, " ");
  const links = [...normalized.matchAll(/<a\b[^>]*href="([^"]*stat_infid=(\d{12})[^"]*)"[^>]*>(.*?)<\/a>/gi)];
  const matches = links.filter((match) => match[3].replace(/<[^>]+>/g, "").trim() === JP_METI_RETAIL_TITLE);
  if (matches.length !== 1) throw new Error(`METI commerce catalogue match count changed: ${matches.length}`);
  const statInfId = matches[0][2];
  const neighborhood = normalized.slice(Math.max(0, matches[0].index! - 1_000), matches[0].index! + matches[0][0].length + 1_000);
  const neighborhoodText = decodeHtml(neighborhood).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const yearMatch = /調査年月\s*(\d{4})年/.exec(neighborhoodText);
  const releaseMatch = /公開（更新）日\s*(\d{4}-\d{2}-\d{2})/.exec(neighborhoodText);
  if (!yearMatch) throw new Error("METI commerce catalogue survey year missing");
  return {
    statInfId,
    surveyYear: Number(yearMatch[1]),
    releaseDate: releaseMatch?.[1] ?? null,
    downloadUrl: jpMetiRetailEStatDownloadUrl(statInfId),
  };
}

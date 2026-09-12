import {
  JP_MHLW_MONTHLY_LABOUR_SERIES,
  jpMhlwMonthlyLabourDownloadUrl,
} from "./catalog";

export type JpMhlwDiscoveredFile = {
  instrumentCode: string;
  tableNo: string;
  statInfId: string;
  downloadUrl: string;
  surveyMonth: string;
  releaseCount: number;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * e-Stat can replace a statInfId when it republishes a table. Discover by the
 * exact Japanese table title and table number, then use the fileKind=4 report
 * link. Ambiguous/missing cards fail closed instead of silently selecting a
 * similarly named 30+ employee, manufacturing, or part-time table.
 */
export function parseJpMhlwMonthlyLabourFileList(html: string): JpMhlwDiscoveredFile[] {
  const articles = html.match(/<article\b[\s\S]*?<\/article>/gi) ?? [];
  const files = JP_MHLW_MONTHLY_LABOUR_SERIES.map((series) => {
    const matches = articles.filter((article) => decodeHtml(article).includes(decodeHtml(series.tableTitle)));
    if (matches.length !== 1) {
      throw new Error(`MHLW monthly labour table ${series.tableNo} discovery count=${matches.length}`);
    }
    const article = matches[0];
    const plain = decodeHtml(article);
    const tableNo = /表番号\s*([^\s]+)/.exec(plain)?.[1];
    const statInfIds = [
      ...article.matchAll(/file-download\?statInfId=(\d{12})&(?:amp;)?fileKind=4/gi),
    ].map((match) => match[1]);
    const uniqueIds = [...new Set(statInfIds)];
    const survey = /調査年月\s*(\d{4})年\s*(\d{1,2})月/.exec(plain);
    const releaseCountRaw = /data-release_count="(\d+)"/i.exec(article)?.[1];
    if (tableNo !== series.tableNo || uniqueIds.length !== 1 || !survey || !releaseCountRaw) {
      throw new Error(`MHLW monthly labour table ${series.tableNo} metadata changed`);
    }
    const month = Number(survey[2]);
    if (month < 1 || month > 12) throw new Error(`MHLW monthly labour invalid survey month: ${survey[0]}`);
    const statInfId = uniqueIds[0];
    return {
      instrumentCode: series.instrumentCode,
      tableNo,
      statInfId,
      downloadUrl: jpMhlwMonthlyLabourDownloadUrl(statInfId),
      surveyMonth: `${survey[1]}-${String(month).padStart(2, "0")}`,
      releaseCount: Number(releaseCountRaw),
    };
  });
  if (new Set(files.map((file) => file.statInfId)).size !== files.length) {
    throw new Error("MHLW monthly labour discovery returned duplicate statInfIds");
  }
  return files;
}

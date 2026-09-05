/**
 * 解析 TE `euro-area/composite-pmi` 页（S&P Global HCOB 欧元区综合 PMI）。
 *
 * 页面结构（2026-09 实测）：
 * - `hasCalendar = false`，无 `#calendar` 发布日程表；有 Components/Related 表，
 *   但均不含 Composite 本身（Components 只列 Manufacturing/Services 分项）；
 * - 最新值只出现在 `id="description"` 叙述段："The S&P Global Eurozone
 *   Composite PMI came in at 52.0 in August 2026, broadly in line with ..."；
 * - 观测月直接带年份（"August 2026"），无需从相邻月推算。
 *
 * 脆弱点：依赖上述叙述句式。TE 改版换措辞时应 throw 而非静默取错值。
 */
export type TeEuroCompositePmiPoint = {
  value: number;
  referenceText: string;
  obsDate: Date;
};

export type TeEuroCompositePmiParsedPage = {
  headline: TeEuroCompositePmiPoint;
  fetchedAt: string;
};

const MONTH_ABBR: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function referenceTextToObsDate(referenceText: string): Date | null {
  const m = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(referenceText.trim());
  if (!m) return null;
  const mon = MONTH_ABBR[m[1]!.slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(Number(m[2]), mon, 1));
}

function extractDescriptionText(html: string): string | null {
  const m = /id="description"[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  return m ? stripTags(m[1] ?? "") : null;
}

const TO_VERBS =
  "increased|decreased|rose|fell|climbed|dropped|slipped|edged up|edged down|inched up|inched down|jumped|surged|eased|declined|expanded|contracted";
const AT_VERBS =
  "remained unchanged|was unchanged|held steady|stayed unchanged|came in|stood";

function matchHeadline(text: string): TeEuroCompositePmiPoint | null {
  const toRe = new RegExp(
    `Composite PMI (?:${TO_VERBS}) to ([\\d.]+)(?:\\s*points)? in ([A-Za-z]+ \\d{4})`,
    "i",
  );
  const atRe = new RegExp(
    `Composite PMI (?:${AT_VERBS}) at ([\\d.]+)(?:\\s*points)? in ([A-Za-z]+ \\d{4})`,
    "i",
  );

  const m = toRe.exec(text) ?? atRe.exec(text);
  if (!m) return null;

  const value = Number(m[1]);
  const referenceText = m[2]!;
  const obsDate = referenceTextToObsDate(referenceText);
  if (!Number.isFinite(value) || !obsDate) return null;

  return { value, referenceText, obsDate };
}

/** 解析 TE 欧元区综合 PMI 页；找不到锚点句式时 throw。 */
export function parseTradingEconomicsEuroCompositePmiPage(
  html: string,
): TeEuroCompositePmiParsedPage {
  const text = extractDescriptionText(html);
  if (!text) {
    throw new Error("TE 欧元区综合 PMI 页缺 #description 叙述段（页面结构可能已变更）");
  }

  const headline = matchHeadline(text);
  if (!headline) {
    throw new Error(
      `TE 欧元区综合 PMI 页 #description 叙述句式未匹配（页面措辞可能已变更）：${text.slice(0, 160)}`,
    );
  }

  return { headline, fetchedAt: new Date().toISOString() };
}

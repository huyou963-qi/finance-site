/**
 * 解析 TE `china/manufacturing-pmi` 页（中国民间制造业 PMI，Caixin/RatingDog 冠名）。
 *
 * 页面结构（2026-09 实测）：
 * - `hasCalendar = false`，无 `#calendar` 发布日程表、无 Components 表；
 * - 最新值只出现在 `id="description"` 叙述段："The RatingDog China Manufacturing
 *   PMI increased to 51.5 in August 2026 from July's four-month low of 50.9, ..."；
 * - 观测月直接带年份（"August 2026"），无需从相邻月推算。
 *
 * 脆弱点：依赖上述叙述句式（动词 + to/at + 数值 + in + 月份年份）。TE 改版换措辞
 * 时应 throw 而非静默取错值——不做无锚点的兜底猜测。
 */
export type TeCaixinPmiPoint = {
  value: number;
  referenceText: string;
  obsDate: Date;
};

export type TeCaixinPmiParsedPage = {
  headline: TeCaixinPmiPoint;
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

function matchHeadline(text: string): TeCaixinPmiPoint | null {
  const toRe = new RegExp(
    `China (?:General )?Manufacturing PMI (?:${TO_VERBS}) to ([\\d.]+) in ([A-Za-z]+ \\d{4})`,
    "i",
  );
  const atRe = new RegExp(
    `China (?:General )?Manufacturing PMI (?:${AT_VERBS}) at ([\\d.]+) in ([A-Za-z]+ \\d{4})`,
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

/** 解析 TE 中国制造业 PMI（民间口径）页；找不到锚点句式时 throw。 */
export function parseTradingEconomicsCaixinPmiPage(html: string): TeCaixinPmiParsedPage {
  const text = extractDescriptionText(html);
  if (!text) {
    throw new Error("TE 中国制造业 PMI 页缺 #description 叙述段（页面结构可能已变更）");
  }

  const headline = matchHeadline(text);
  if (!headline) {
    throw new Error(
      `TE 中国制造业 PMI 页 #description 叙述句式未匹配（页面措辞可能已变更）：${text.slice(0, 160)}`,
    );
  }

  return { headline, fetchedAt: new Date().toISOString() };
}

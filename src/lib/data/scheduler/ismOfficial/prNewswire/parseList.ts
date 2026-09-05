/**
 * 解析 PR Newswire ISM 新闻列表页（https://www.prnewswire.com/news/institute-for-supply-management/），
 * 提取 manufacturing-pmi / services-pmi 新闻稿链接，推导月份/年份/报告类型用于历史回填。
 *
 * URL slug 形如：
 *   /news-releases/manufacturing-pmi-at-54-6-august-2026-ism-manufacturing-pmi-report-302865127.html
 *   /news-releases/services-pmi-at-55-4-august-2026-ism-services-pmi-report-302868046.html
 *
 * 脆弱点：slug 的 "<kind>-pmi-at-<value>-<month>-<year>-ism-<kind>-pmi-report-<id>" 结构。
 * 若结构变化（找不到任何候选链接，或候选链接均无法解析出月份/年份）→ throw，不静默漏月。
 */
import type { IsmOfficialReportKind } from "../catalog";

export type PrNewswireListEntry = {
  kind: IsmOfficialReportKind;
  year: number;
  month: number; // 1-12
  url: string;
};

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const LOOSE_CANDIDATE_RE = /manufacturing-pmi|services-pmi/i;

const SLUG_RE =
  /\/news-releases\/(manufacturing|services)-pmi-at-[a-z0-9-]+?-(january|february|march|april|may|june|july|august|september|october|november|december)-(\d{4})-ism-(?:manufacturing|services)-pmi-report-\d+\.html/i;

function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\s[^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]!);
  return out;
}

function toAbsoluteUrl(href: string): string {
  try {
    return new URL(href, "https://www.prnewswire.com").toString();
  } catch {
    return href;
  }
}

export function parsePrNewswireListPage(html: string): PrNewswireListEntry[] {
  const hrefs = extractHrefs(html);
  const loose = hrefs.filter((h) => LOOSE_CANDIDATE_RE.test(h));
  if (!loose.length) {
    throw new Error(
      "PR Newswire 新闻列表页：未找到任何 manufacturing-pmi/services-pmi 链接（页面结构可能已变）",
    );
  }

  const seen = new Set<string>();
  const entries: PrNewswireListEntry[] = [];
  for (const href of loose) {
    const abs = toAbsoluteUrl(href);
    const m = SLUG_RE.exec(abs);
    if (!m) continue;
    const kind = m[1]!.toLowerCase() as IsmOfficialReportKind;
    const month = MONTH_INDEX[m[2]!.toLowerCase()]!;
    const year = Number(m[3]);
    const key = `${kind}:${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ kind, year, month, url: abs.split("?", 1)[0]! });
  }

  if (!entries.length) {
    throw new Error(
      `PR Newswire 新闻列表页：找到 ${loose.length} 条候选链接但均无法解析月份/年份/报告类型（slug 结构可能已变）`,
    );
  }

  entries.sort((a, b) => (b.year - a.year) * 12 + (b.month - a.month));
  return entries;
}

export function latestPrNewswireEntry(
  entries: readonly PrNewswireListEntry[],
  kind: IsmOfficialReportKind,
): PrNewswireListEntry | null {
  return entries.find((e) => e.kind === kind) ?? null;
}

import { GACC_TABLE_TITLE, type TradeDirection } from "./catalog";

/**
 * 解析 GACC 英文站月报索引页 → 表(13)/(14) 每月详情页 URL。
 *
 * 结构（2026-09 fixture 核实，见 fixtures/gacc-monthly-index-2026-sample.html
 * 与 fixtures/gacc-monthly-index-2018-sample.html）：
 *   单个 <table>，表头 <th>Title</th><th>Month</th>；每行
 *   <td>（13）Major Export Commodities in Quantity and Value</td>
 *   <td><a href=http://english.customs.gov.cn/Statics/<uuid>.html> Jan.</a>…<span>Aug.</span></td>
 *   - 尚未发布的月份是 <span> 而非 <a>，只取 <a>；
 *   - href **不带引号**，且 2018 归档页在标签间有换行缩进 —— 正则须容忍两者；
 *   - 表号用全角括号（）；标题文本在不同年份大小写/空格略有出入，故按「表号 + 关键词」双条件匹配。
 *
 * 防御：找不到目标表行、0 个月份链接一律 throw，让调用方 FAILED 告警而不是静默少抓。
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type GaccMonthlyLink = { month: number; url: string };

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function rowCells(rowHtml: string): { text: string; html: string }[] {
  return [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => ({
    text: stripTags(m[1] ?? ""),
    html: m[1] ?? "",
  }));
}

/** 「（13）」/「(13)」都算命中；标题另需含关键词，避免表号变动时错抓邻表 */
function matchesTable(title: string, spec: { no: number; keyword: string }): boolean {
  const lower = title.toLowerCase();
  const hasNo = new RegExp(`[（(]\\s*${spec.no}\\s*[）)]`).test(title);
  return hasNo && lower.includes(spec.keyword);
}

export function parseGaccMonthlyIndex(html: string, direction: TradeDirection): GaccMonthlyLink[] {
  const spec = GACC_TABLE_TITLE[direction];
  let cellHtml: string | null = null;
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = rowCells(row[1] ?? "");
    if (cells.length >= 2 && matchesTable(cells[0]!.text, spec)) {
      cellHtml = cells[1]!.html;
      break;
    }
  }
  if (cellHtml === null) {
    throw new Error(
      `海关月报索引：未找到表(${spec.no}) ${direction} 所在行（索引页结构可能已变）`,
    );
  }

  const links: GaccMonthlyLink[] = [];
  const seen = new Set<number>();
  for (const a of cellHtml.matchAll(/<a\b[^>]*?href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = a[1]!.trim();
    const label = stripTags(a[2] ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const month = MONTHS[label.slice(0, 3)];
    if (!month || !/^https?:\/\//i.test(url)) continue;
    if (seen.has(month)) continue; // 同月重复挂链接时取首个
    seen.add(month);
    links.push({ month, url });
  }
  if (links.length === 0) {
    throw new Error(`海关月报索引：表(${spec.no}) 行内 0 个月份链接（结构可能已变）`);
  }
  links.sort((a, b) => a.month - b.month);
  return links;
}

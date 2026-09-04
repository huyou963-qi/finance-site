import type { ObservationPoint } from "../types";

/**
 * 解析 multpl.com Shiller CAPE 月度历史表 → 观测点。
 *
 * 结构（2026-09 fixture 核实，见 .data/shiller-cape-sample.html）：
 *   `<table id="datatable">` 下 `<tr class="odd|even">` 行，每行两个 `<td>`：
 *     - 第一列：观测日文本，如 "Sep 3, 2026" / "Jul 1, 2026" —— 当月第一次报价日，
 *       用其年月归一到月首 `obsDate = YYYY-MM-01`（与库内月频序列对齐）；
 *     - 第二列：CAPE 数值，前置一个 `&#x2002;`（figure space）实体 + 换行，如 "\n&#x2002;\n42.38\n"，
 *       需去除空白/实体噪声后 parseFloat。
 *   最新一行在最上面（数据倒序），故 sourceLatestObsDate 取遍历中的最大值而非首行。
 *
 * 防御：找不到 `id="datatable"` 锚点、0 有效行、日期/数值解析失败、CAPE 越出
 *      合理区间 [1, 200]（历史范围约 4.8～44）一律 throw 或跳过计入 skippedInvalid，
 *      绝不写入可疑值（源站改版时报错而非静默取错）。
 */

const TABLE_ANCHOR = 'id="datatable"';
const ROW_RE = /<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/g;
const CELL_RE = /<td>([\s\S]*?)<\/td>/g;

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type ParsedShillerCape = {
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

function parseDateCell(text: string): { y: number; m: number } | null {
  const t = text.trim();
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/.exec(t);
  if (!m) return null;
  const mon = MONTH_MAP[m[1]!.toLowerCase()];
  const year = Number(m[3]);
  if (!mon || !Number.isFinite(year)) return null;
  return { y: year, m: mon };
}

function parseValueCell(text: string): number | null {
  // 去除 &#x2002;（figure space）等 HTML 实体、逗号、空白
  const cleaned = text
    .replace(/&#x[0-9a-fA-F]+;/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/,/g, "")
    .trim();
  if (cleaned === "") return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

export function parseShillerCapePage(html: string): ParsedShillerCape {
  if (!html.includes(TABLE_ANCHOR)) {
    throw new Error(
      `Shiller CAPE：缺锚点 ${TABLE_ANCHOR}（页面结构可能已变，需重新抓 fixture 核对）`,
    );
  }
  const tableStart = html.indexOf(TABLE_ANCHOR);
  const tableEnd = html.indexOf("</table>", tableStart);
  const section = tableEnd === -1 ? html.slice(tableStart) : html.slice(tableStart, tableEnd);

  const points: ObservationPoint[] = [];
  let latest: Date | null = null;
  let skippedInvalid = 0;
  const seenMonths = new Set<string>();

  let rowMatch: RegExpExecArray | null;
  ROW_RE.lastIndex = 0;
  while ((rowMatch = ROW_RE.exec(section))) {
    const rowHtml = rowMatch[1]!;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    CELL_RE.lastIndex = 0;
    while ((cellMatch = CELL_RE.exec(rowHtml))) {
      cells.push(cellMatch[1]!);
    }
    if (cells.length < 2) continue; // 表头行（<th>）或异常行，正常跳过
    if (/Date/i.test(cells[0]!) && /Value/i.test(cells[1]!)) continue; // 表头文本行

    const ymd = parseDateCell(cells[0]!);
    const value = parseValueCell(cells[1]!);
    if (!ymd || value == null) {
      skippedInvalid += 1;
      continue;
    }
    if (value < 1 || value > 200) {
      skippedInvalid += 1;
      continue;
    }
    const key = `${ymd.y}-${ymd.m}`;
    if (seenMonths.has(key)) continue; // 同月多行（如首月首日+当月最新报价）只取先遇到的一条
    seenMonths.add(key);

    const obsDate = new Date(Date.UTC(ymd.y, ymd.m - 1, 1));
    const now = new Date();
    if (obsDate.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
      skippedInvalid += 1; // 未来日期异常，跳过而非静默写入
      continue;
    }
    points.push({ obsDate, value: Math.round(value * 100) / 100 });
    if (!latest || obsDate > latest) latest = obsDate;
  }

  if (points.length === 0) {
    throw new Error("Shiller CAPE：解析后 0 个有效点（结构或数值异常）");
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, latestObsDate: latest, skippedInvalid };
}

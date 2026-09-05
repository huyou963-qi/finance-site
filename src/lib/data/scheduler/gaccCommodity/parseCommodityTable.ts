/**
 * 解析 GACC 英文站表(13)/(14)「主要商品量值表」详情页 → 当月「数量 + 金额」行。
 *
 * 结构（2026-09 fixture 核实，见 fixtures/ 下各年样本）：
 *   页面最大的一个 <table>，行序：
 *     0  标题        （13）Major Export Commodities in Quantity and Value,1-7.2026
 *     1  金额单位     Unit:US$1,000
 *     2  表头        Commodity | Quantity Unit | 7 | 1to7 | Percentage Change
 *     3  子表头      Quantity | Value | Quantity | Value | Quantity | Value
 *     4+ 数据行      商品名 | 数量单位 | 当月数量 | 当月金额 | 累计数量 | 累计金额 | 同比量 | 同比值
 *
 * 源端在 2020-2026 这 7 年里出现过的全部坑（每一条都在真实页面上踩到过，勿删）：
 *   1. **1 月表少一个累计段**（子表头只有 2 组 Quantity/Value，数据行 6 列而非 8 列），
 *      所以绝不能按「倒数第 N 列」定位；当月数量/金额恒为紧跟数量单位的头两列。
 *   2. **单元格残留 Excel 导出错误 `*REF!`**（2026-07 出口表「新三样」整行），按空值处理。
 *   3. **汇总行数量列为 `-`**（Agriculture products* 等），只有金额没有数量，不出单价。
 *   4. **商品名带 `&nbsp;` 缩进表示层级**，须先反转义再 trim，否则
 *      「Meat(including  meat offal)」这类名字永远匹配不上目录。
 *   5. **1、2 月合并发布**（2020-02 表当月列写作 "1 to 2"，当年没有单独 1 月表）：
 *      合并期的「当月」是两个月之和，按 monthSpan>1 返回交调用方跳过，绝不能当单月值入库。
 *   6. **整张表多一个前导空列**（2022-01/02），Commodity 落在第 2 格 —— 按表头里
 *      Commodity 的实际位置算列偏移，不要写死 0。
 *   7. **金额单位换过币种**：2025 年全年的出口表是 `Unit:RMB￥10,000`（万元人民币），
 *      同年进口表仍是 `US$1,000`。币种与倍数一并解析出来交给调用方，
 *      非美元期只落数量（数量与币种无关），绝不按旧口径把人民币当美元入库。
 *   8. **同一商品混用全角/半角括号**（Motor vehicles（including…），行名统一走
 *      `gaccRowKey` 归一，否则同一条序列会平白少 15 期。
 *
 * 防御：期次解析不出、认不出金额单位、找不到表头、列序不符、0 条有效数据行一律 throw
 *      —— 源站改版时报错而非静默取错值。
 */

import { gaccRowKey } from "./catalog";

export type GaccValueUnit = {
  currency: "USD" | "CNY";
  /** 表内 1 个数值 = factor 个货币基本单位（US$1,000 → 1000；RMB￥10,000 → 10000） */
  factor: number;
  /** 原始单位文本，用于报错与记账 */
  raw: string;
};

export type GaccCommodityRow = {
  /** 原始商品名（折叠空白后） */
  name: string;
  /** 源数量计量单位 token，如 10000T / T / N / 100MN；无数量时为 "-" */
  qtyUnit: string;
  /** 当月数量（源单位），无值为 null */
  qty: number | null;
  /** 当月金额（表内原始数值，单位见 valueUnit），无值为 null */
  value: number | null;
};

export type ParsedGaccCommodityTable = {
  /** 观测期归一到月首 UTC */
  obsDate: Date;
  /**
   * 首个数据列组覆盖的月份数。1 = 正常「当月」；>1 = 该期把多个月合并发布，
   * 不能当当月值入库，由调用方跳过。
   */
  monthSpan: number;
  valueUnit: GaccValueUnit;
  /** key = gaccRowKey(商品名) */
  rows: Map<string, GaccCommodityRow>;
  /** 同名多行的商品 key（早年份表确有重名行，如 2018 出口表的 Fur garments） */
  duplicates: Set<string>;
  skippedInvalid: number;
};

const HEADER_TOKENS = new Set([
  "",
  "commodity",
  "unit",
  "quantity",
  "quantity unit",
  "value",
  "percentage change",
]);

function stripTags(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  for (const tr of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(tr[1] ?? "").matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) =>
      stripTags(c[1] ?? ""),
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function largestTable(html: string): string {
  let best = "";
  for (const t of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    if (t[0]!.length > best.length) best = t[0]!;
  }
  if (!best) throw new Error("海关主要商品量值表：页面无 <table>（结构可能已变）");
  return best;
}

/** "…,1-7.2026" / "…,7.2026" → 取最后一个月份 */
function parsePeriod(html: string): { year: number; month: number } {
  const m = /quantity\s+and\s+value\s*[,，]\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s*\.\s*(\d{4})/i.exec(
    stripTags(html.slice(0, 20_000)),
  );
  if (!m) {
    throw new Error("海关主要商品量值表：标题里解析不出期次（应形如 ',1-7.2026'）");
  }
  const month = Number(m[2] ?? m[1]);
  const year = Number(m[3]);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`海关主要商品量值表：期次月份异常 ${month}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getUTCFullYear() + 1) {
    throw new Error(`海关主要商品量值表：期次年份异常 ${year}`);
  }
  return { year, month };
}

/** `Unit:US$1,000` / `Unit:RMB￥10,000` / `Unit: USD1 Million` */
function parseValueUnit(html: string): GaccValueUnit {
  const text = stripTags(html.slice(0, 40_000));
  const m =
    /unit\s*[:：]\s*(rmb|cny|usd|us\$|\$|￥)?\s*[￥$]?\s*([\d,]+)\s*(million|thousand)?/i.exec(text);
  if (!m) {
    throw new Error("海关主要商品量值表：认不出金额单位（源结构可能已变，拒绝入库）");
  }
  const digits = Number(m[2]!.replace(/,/g, ""));
  if (!Number.isFinite(digits) || digits <= 0) {
    throw new Error(`海关主要商品量值表：金额单位倍数异常「${m[0]}」`);
  }
  const scale = /million/i.test(m[3] ?? "") ? 1_000_000 : 1;
  const tag = (m[1] ?? "").toLowerCase();
  const currency = tag === "rmb" || tag === "cny" || tag === "￥" ? "CNY" : "USD";
  return { currency, factor: digits * scale, raw: m[0]!.trim() };
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null; // "-"、""、"*REF!"
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * 语义化列序校验：三列组的表里第 2 组是「1 到本月累计」，累计金额必然 ≥ 当月金额。
 * 表头文字在个别年份不可靠（当月列表头留空），这条不变式才是真正挡得住列序调换的门。
 * 1 月两者相等，不做校验。
 */
function assertCumulativeAfterMonth(dataRows: string[][], month: number, offset: number): void {
  if (month <= 1) return;
  let checked = 0;
  let violated = 0;
  for (const cells of dataRows) {
    const monthValue = toNumber(cells[offset + 3] ?? "");
    const cumulativeValue = toNumber(cells[offset + 5] ?? "");
    if (monthValue === null || cumulativeValue === null || monthValue === 0) continue;
    checked += 1;
    if (cumulativeValue < monthValue) violated += 1;
  }
  if (checked >= 20 && violated / checked > 0.1) {
    throw new Error(
      `海关主要商品量值表：${violated}/${checked} 行的累计金额小于当月金额，` +
        "当月列与累计列可能已调换（拒绝入库）",
    );
  }
}

export function parseGaccCommodityTable(html: string): ParsedGaccCommodityTable {
  const valueUnit = parseValueUnit(html);
  const { year, month } = parsePeriod(html);
  const allRows = extractRows(largestTable(html));

  // 2022-01/02 的表整体多一个前导空列，Commodity 不在第 0 格 —— 用它的实际下标做列偏移。
  let headerIdx = -1;
  let offset = 0;
  for (const [index, cells] of allRows.entries()) {
    const at = cells.findIndex((c) => c.toLowerCase() === "commodity");
    if (at >= 0) {
      headerIdx = index;
      offset = at;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error("海关主要商品量值表：未找到含 Commodity 的表头行（结构可能已变）");
  }
  const header = allRows[headerIdx]!;
  const unitLabel = (header[offset + 1] ?? "").toLowerCase();
  if (!unitLabel.includes("quantity") || !unitLabel.includes("unit")) {
    throw new Error(
      `海关主要商品量值表：表头数量单位列是「${header[offset + 1]}」而非 Quantity Unit（列序可能已变）`,
    );
  }

  // 表头当月列可能是：数字（正常当月）、"1 to 2"（合并期）、或空（早年份）。
  // 只有「是数字且与标题期次不符」才算列序出错。
  const headerMonthCell = (header[offset + 2] ?? "").trim();
  const range = /^(\d{1,2})\s*(?:to|-|~|—)\s*(\d{1,2})$/i.exec(headerMonthCell);
  let monthSpan = 1;
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (to !== month) {
      throw new Error(
        `海关主要商品量值表：表头首列区间「${headerMonthCell}」的末月与标题期次 ${month} 月不一致`,
      );
    }
    monthSpan = to - from + 1;
  } else {
    const headerMonthRaw = headerMonthCell.replace(/[^\d]/g, "");
    if (headerMonthRaw && Number(headerMonthRaw) !== month) {
      throw new Error(
        `海关主要商品量值表：表头当月列「${headerMonthCell}」与标题期次 ${month} 月不一致（列序可能已变）`,
      );
    }
  }

  const subHeader = allRows[headerIdx + 1] ?? [];
  if (
    subHeader[offset]?.toLowerCase() !== "quantity" ||
    subHeader[offset + 1]?.toLowerCase() !== "value"
  ) {
    throw new Error(
      `海关主要商品量值表：子表头前两列是「${subHeader[offset]}/${subHeader[offset + 1]}」` +
        "而非 Quantity/Value（列序可能已变）",
    );
  }
  const pairs = Math.floor((subHeader.length - offset) / 2);
  if (pairs < 2 || pairs > 3) {
    throw new Error(`海关主要商品量值表：子表头列组数异常（${subHeader.length - offset} 列）`);
  }

  const rows = new Map<string, GaccCommodityRow>();
  const duplicates = new Set<string>();
  let skippedInvalid = 0;
  for (const cells of allRows.slice(headerIdx + 1)) {
    if (cells.length < offset + 4) continue; // 表尾 Note 等
    const name = cells[offset] ?? "";
    if (HEADER_TOKENS.has(name.toLowerCase())) continue; // 子表头
    const key = gaccRowKey(name);
    if (!key) continue;
    const qty = toNumber(cells[offset + 2] ?? "");
    const value = toNumber(cells[offset + 3] ?? "");
    // 分节行（早年表里的「Of which:」）当月两列全空且会重复出现 —— 先于查重丢弃，
    // 否则会被误判成商品名重复而中断整年回填。
    if (qty === null && value === null) continue;
    // 早年份表确有重名行（2018 出口表 Fur garments 两次，单位不同）。保留首行并记账，
    // 是否致命交给 toSeriesPoints：只有重名的正好是精选商品时才 throw。
    if (rows.has(key)) {
      duplicates.add(key);
      continue;
    }
    if ((qty !== null && qty < 0) || (value !== null && value < 0)) {
      skippedInvalid += 1;
      continue;
    }
    rows.set(key, { name, qtyUnit: cells[offset + 1] ?? "-", qty, value });
  }

  if (rows.size === 0) {
    throw new Error("海关主要商品量值表：解析后 0 条数据行（结构或内容异常）");
  }
  if (pairs === 3) assertCumulativeAfterMonth(allRows.slice(headerIdx + 2), month, offset);

  return {
    obsDate: new Date(Date.UTC(year, month - 1, 1)),
    monthSpan,
    valueUnit,
    rows,
    duplicates,
    skippedInvalid,
  };
}

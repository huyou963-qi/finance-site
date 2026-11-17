/**
 * 指标目录搜索：中文标签 / id / 路径 / 别名 / 英文字典 / 拼音全拼与首字母。
 * 纯函数，便于单测；不依赖当前界面语言。
 */

import { pinyin } from "pinyin-pro";
import enEquity from "@/i18n/text/en/equity.json";
import type { IndicatorDef } from "./types";

/** 常用别名：搜「毛利率」等也能命中；英文短码补全注册表未写的别名 */
export const INDICATOR_SEARCH_ALIASES: Record<string, string[]> = {
  "fs.grossMargin": ["毛利率", "gross margin", "gm"],
  "fs.opMargin": ["营业利润率", "operating margin", "opm"],
  "fs.netMargin": ["净利率", "net margin"],
  "fs.ebitda": ["息税折旧摊销前利润", "ebitda"],
  "fs.fcf": ["自由现金流", "free cash flow", "fcf"],
  "fs.revenue": ["营收", "revenue", "sales"],
  "fs.netIncome": ["净利润", "net income", "earnings"],
  "fs.eps": ["每股收益", "eps"],
  "ratio.currentRatio": ["流动比率", "current ratio"],
  "ratio.interestCoverage": ["利息保障", "interest coverage"],
  "ratio.roeTtm": ["净资产收益率", "roe"],
  "ratio.roaTtm": ["总资产收益率", "roa"],
  "val.pe": ["市盈率", "pe", "p/e"],
  "val.pb": ["市净率", "pb", "p/b"],
  "val.ps": ["市销率", "ps", "p/s"],
  "px.close": ["收盘价", "close", "price"],
  "px.rangeReturn": ["区间涨跌幅", "return", "range return"],
  "tech.rsi14": ["相对强弱", "rsi"],
};

const EN = enEquity as Record<string, string>;

function enOf(zh: string): string {
  return EN[zh] ?? "";
}

/** 全拼（无声调、无空格）与首字母串，供「yingye」「yysr」类输入 */
export function pinyinTokens(text: string): string[] {
  if (!text) return [];
  const full = pinyin(text, { toneType: "none", type: "array", nonZh: "consecutive" })
    .join("")
    .toLowerCase()
    .replace(/\s+/g, "");
  const initials = pinyin(text, { pattern: "first", toneType: "none", type: "array", nonZh: "consecutive" })
    .join("")
    .toLowerCase()
    .replace(/\s+/g, "");
  return [...new Set([full, initials].filter(Boolean))];
}

function haystack(d: IndicatorDef): string[] {
  const aliases = INDICATOR_SEARCH_ALIASES[d.id] ?? [];
  return [
    d.id,
    d.label,
    ...d.path,
    enOf(d.label),
    ...d.path.map(enOf),
    ...aliases,
    ...pinyinTokens(d.label),
    ...d.path.flatMap(pinyinTokens),
  ]
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
}

/** 查询串是否命中该指标（大小写不敏感；空串视为全匹配） */
export function matchesIndicatorQuery(d: IndicatorDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack(d).some((h) => h.includes(q) || q.includes(h));
}

export function filterIndicators(indicators: readonly IndicatorDef[], query: string): IndicatorDef[] {
  const q = query.trim();
  if (!q) return [...indicators];
  return indicators.filter((d) => matchesIndicatorQuery(d, q));
}

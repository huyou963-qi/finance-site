/** 「股票数据」查询请求的校验（纯函数，前后端共用） */

import { getIndicator, normalizeParams } from "./indicatorRegistry";
import { MAX_COLUMNS, MAX_SYMBOLS, type Basis, type ColumnParams, type ColumnSpec, type PeriodSpec } from "./types";

export class StockDataRequestError extends Error {}

/** 美股代码形状：字母开头，可带一段类别后缀（BRK-B / BRK.B）。只判形状，是否真实存在由服务端查目录 */
const US_TICKER = /^[A-Z][A-Z0-9]{0,9}(?:[.-][A-Z0-9]{1,3})?$/;

export function normalizeUsTicker(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/^(?:NASDAQ|NYSE|AMEX):/, "").replace(".", "-");
  return US_TICKER.test(s) ? s : null;
}

function parsePeriod(v: unknown): PeriodSpec | undefined {
  if (v == null) return undefined;
  if (typeof v !== "object") throw new StockDataRequestError("报告期格式不正确");
  const o = v as Record<string, unknown>;
  const year = Number(o.year);
  const okYear = Number.isInteger(year) && year >= 1990 && year <= 2100;
  switch (o.kind) {
    case "latestFY": return { kind: "latestFY" };
    case "latestQ": return { kind: "latestQ" };
    case "FY":
      if (!okYear) throw new StockDataRequestError("报告期年份不正确");
      return { kind: "FY", year };
    case "FQ": {
      const q = Number(o.q);
      if (!okYear || ![1, 2, 3, 4].includes(q)) throw new StockDataRequestError("报告期年份或季度不正确");
      return { kind: "FQ", year, q: q as 1 | 2 | 3 | 4 };
    }
    default:
      throw new StockDataRequestError("报告期格式不正确");
  }
}

function parseBasis(v: unknown): Basis | undefined {
  if (v == null) return undefined;
  if (v === "single" || v === "ttm") return v;
  throw new StockDataRequestError("口径格式不正确");
}

export function parseColumns(input: unknown): ColumnSpec[] {
  if (!Array.isArray(input) || !input.length) throw new StockDataRequestError("请至少选择一个指标");
  if (input.length > MAX_COLUMNS) throw new StockDataRequestError(`单次最多 ${MAX_COLUMNS} 列，当前 ${input.length} 列`);
  const keys = new Set<string>();
  return input.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.slice(0, 40) : "";
    if (!key || keys.has(key)) throw new StockDataRequestError("列标识缺失或重复");
    keys.add(key);
    const def = typeof o.indicatorId === "string" ? getIndicator(o.indicatorId) : undefined;
    if (!def) throw new StockDataRequestError("包含未知指标，请刷新页面后重试");
    const p = (o.params ?? {}) as Record<string, unknown>;
    const params: ColumnParams = normalizeParams(def, { period: parsePeriod(p.period), basis: parseBasis(p.basis) });
    return { key, indicatorId: def.id, params };
  });
}

/** 去重、规范化；形状不像美股的代码放进 ignored（不报错，由页面提示） */
export function parseSymbols(input: unknown): { symbols: string[]; ignored: string[] } {
  if (!Array.isArray(input) || !input.length) throw new StockDataRequestError("请至少选择一只股票");
  const symbols: string[] = [];
  const ignored: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const s = normalizeUsTicker(raw);
    if (!s) { if (raw.trim()) ignored.push(raw.trim().slice(0, 32)); continue; }
    if (!symbols.includes(s)) symbols.push(s);
  }
  if (symbols.length > MAX_SYMBOLS) throw new StockDataRequestError(`单次最多 ${MAX_SYMBOLS} 只股票，当前 ${symbols.length} 只`);
  return { symbols, ignored };
}

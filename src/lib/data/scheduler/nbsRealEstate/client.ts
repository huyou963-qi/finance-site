import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { fetchChinaOfficial } from "../chinaOfficialProxy";
import {
  NBS_REAL_ESTATE_INDEX_URL,
  NBS_REAL_ESTATE_PRICE_CATEGORY,
  NBS_REAL_ESTATE_PROPERTY_CATEGORY,
} from "./catalog";

export type NbsRealEstateSeries = {
  code: string;
  key: string;
  label: string;
  category: string;
  unit: string;
  points: ObservationPoint[];
};
export type NbsRealEstateHistory = Map<string, NbsRealEstateSeries>;

type Publication = { url: string; kind: "property" | "price" };
type Options = { historical?: boolean; archivePageLimit?: number; indexUrl?: string; fetchText?: (url: string) => Promise<string>; fetchBinary?: (url: string) => Promise<Buffer> };

const USER_AGENT = "finance-site-data-scheduler/1.0";
const LATEST_PAGE_COUNT = 3;
const MAX_INDEX_PAGES = 67;
const cache = new Map<string, { at: number; values: NbsRealEstateHistory }>();

function compact(value: unknown): string {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value: unknown): number | null {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw || raw === "-" || raw === "—") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(10)) : null;
}

function codeFor(key: string): string {
  return `nbs_cn_realestate_${createHash("sha1").update(key).digest("hex").slice(0, 18)}`;
}

function monthFromText(value: string): Date | null {
  const text = compact(value);
  const match = /(20\d{2})年\s*(?:1\s*[—-]\s*)?(\d{1,2})月(?:份)?/.exec(text);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? new Date(Date.UTC(year, month - 1, 1)) : null;
  }
  const year = Number(/(20\d{2})年/.exec(text)?.[1]);
  const month = /一季度/.test(text) ? 3 : /上半年|二季度/.test(text) ? 6 : /前三季度|三季度/.test(text) ? 9 : /全年|年末|四季度/.test(text) ? 12 : 0;
  return month >= 1 && month <= 12 ? new Date(Date.UTC(year, month - 1, 1)) : null;
}

function anchors(html: string, pageUrl: string): { url: string; label: string }[] {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ url: new URL(match[1]!, pageUrl).toString(), label: compact(match[2]) }));
}

function htmlTables(html: string): string[][][] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((table) =>
    [...table[1]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => compact(cell[1])),
    ),
  );
}

function addSeries(target: NbsRealEstateHistory, base: Omit<NbsRealEstateSeries, "code" | "points">, point: ObservationPoint) {
  const code = codeFor(base.key);
  const previous = target.get(code);
  if (!previous) {
    target.set(code, { code, ...base, points: [point] });
    return;
  }
  const index = previous.points.findIndex((item) => item.obsDate.getTime() === point.obsDate.getTime());
  if (index >= 0) previous.points[index] = point;
  else previous.points.push(point);
}

/** Parses the official attachment “表1 全国房地产开发和销售情况”. */
export function parseNbsPropertyWorkbook(workbook: XLSX.WorkBook, sourceText: string): NbsRealEstateHistory {
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("国家统计局房地产月报：缺少表1");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const obsDate = monthFromText(sourceText) ?? monthFromText(compact(rows[0]?.[0]));
  if (!obsDate) throw new Error("国家统计局房地产月报：无法从标题或表1识别统计月份");
  const header = rows.findIndex((row) => compact(row[0]) === "指标" && /绝对量/.test(compact(row[1])) && /(同比|比上年)/.test(compact(row[2])));
  if (header < 0) throw new Error("国家统计局房地产月报：表1列头已变化");
  const output: NbsRealEstateHistory = new Map();
  let parent = "";
  let parentUnit = "原表单位";
  for (const row of rows.slice(header + 1)) {
    const rawLabel = compact(row[0]);
    const amount = number(row[1]);
    const yoy = number(row[2]);
    if (!rawLabel || (amount === null && yoy === null)) continue;
    const child = /其中：/.test(rawLabel);
    const display = rawLabel.replace(/^其中：/, "").trim();
    if (!child) {
      parent = rawLabel.replace(/（[^）]+）/g, "").trim();
      parentUnit = /（([^）]+)）/.exec(rawLabel)?.[1] ?? "原表单位";
    }
    const subject = child ? `${parent}：${display}` : parent;
    const unit = child ? parentUnit : /（([^）]+)）/.exec(rawLabel)?.[1] ?? "原表单位";
    const isStock = /施工面积|待售面积/.test(subject);
    if (amount !== null) addSeries(output, {
      key: `property|${subject}|amount`,
      label: `房地产：${subject}${isStock ? "原值" : "累计值"}`,
      category: NBS_REAL_ESTATE_PROPERTY_CATEGORY,
      unit,
    }, { obsDate, value: amount });
    if (yoy !== null) addSeries(output, {
      key: `property|${subject}|yoy`,
      label: `房地产：${subject}同比增长`,
      category: NBS_REAL_ESTATE_PROPERTY_CATEGORY,
      unit: "%",
    }, { obsDate, value: yoy });
  }
  if (!output.size) throw new Error("国家统计局房地产月报：表1未解析出有效序列");
  return output;
}

function parsePriceTable(table: string[][], market: "新建商品住宅" | "二手住宅", obsDate: Date, output: NbsRealEstateHistory) {
  const thirdMeasure = /定基|2020年\s*=\s*100/.test(table[1]?.join(" ") ?? "")
    ? ["base_index", "定基指数（2020年=100）"] as const
    : ["ytd_average_index", "年内平均指数（上年同期=100）"] as const;
  for (const row of table.slice(2)) {
    // Every official price table has two city/value blocks in each data row.
    for (const offset of [0, 4]) {
      const city = compact(row[offset]);
      if (!city) continue;
      const values = [number(row[offset + 1]), number(row[offset + 2]), number(row[offset + 3])];
      const measures = [
        ["mom_index", "环比指数（上月=100）"],
        ["yoy_index", "同比指数（上年同月=100）"],
        thirdMeasure,
      ] as const;
      for (let index = 0; index < measures.length; index++) {
        if (values[index] === null) continue;
        const [measure, label] = measures[index]!;
        addSeries(output, {
          key: `price|${market}|${city}|${measure}`,
          label: `70城房价：${market}：${city}：${label}`,
          category: NBS_REAL_ESTATE_PRICE_CATEGORY,
          unit: "指数",
        }, { obsDate, value: values[index]! });
      }
    }
  }
}

/** Parses tables 1 and 2 only: city-level headline new-home and existing-home indices. */
export function parseNbs70CityPriceArticle(html: string): NbsRealEstateHistory {
  const obsDate = monthFromText(html);
  if (!obsDate) throw new Error("国家统计局70城房价月报：无法从标题识别统计月份");
  const tables = htmlTables(html).filter((table) => table.length > 2 && /城市/.test(table[0]?.join(" ") ?? ""));
  if (tables.length < 2) throw new Error("国家统计局70城房价月报：缺少表1或表2");
  const output: NbsRealEstateHistory = new Map();
  parsePriceTable(tables[0]!, "新建商品住宅", obsDate, output);
  parsePriceTable(tables[1]!, "二手住宅", obsDate, output);
  if (output.size < 300) throw new Error(`国家统计局70城房价月报：有效序列不足（${output.size}）`);
  return output;
}

function merge(target: NbsRealEstateHistory, incoming: NbsRealEstateHistory) {
  for (const item of incoming.values()) for (const point of item.points) addSeries(target, item, point);
}

let lastRequestAt = 0;
async function politeDelay(): Promise<void> {
  // Public release pages are archived static documents. Keep the one-time
  // backfill deliberately gentle and never apply this delay to offline tests.
  const wait = Math.max(0, 5_000 - (Date.now() - lastRequestAt));
  if (wait) await new Promise<void>((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function defaultText(url: string): Promise<string> {
  await politeDelay();
  const response = await fetchChinaOfficial(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`国家统计局页面 HTTP ${response.status}: ${url}`);
  return response.text();
}

async function defaultBinary(url: string): Promise<Buffer> {
  await politeDelay();
  const response = await fetchChinaOfficial(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*" }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`国家统计局房地产数据表 HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function publications(options: Options): Promise<Publication[]> {
  const text = options.fetchText ?? defaultText;
  const indexUrl = options.indexUrl ?? NBS_REAL_ESTATE_INDEX_URL;
  const first = await text(indexUrl);
  const count = Math.min(Number(/createPageHTML\((\d+)/.exec(first)?.[1] ?? 1), MAX_INDEX_PAGES);
  const pages = Math.min(options.historical ? count : LATEST_PAGE_COUNT, options.archivePageLimit ?? count);
  const output = new Map<string, Publication>();
  for (let page = 0; page < pages; page++) {
    if (options.historical) console.log(`[nbs-realestate] 扫描发布归档页 ${page + 1}/${pages}`);
    const html = page === 0 ? first : await text(new URL(`index_${page}.html`, indexUrl).toString());
    for (const link of anchors(html, page === 0 ? indexUrl : new URL(`index_${page}.html`, indexUrl).toString())) {
      const kind = /全国房地产市场基本情况/.test(link.label) ? "property" : /70个大中城市商品住宅销售价格变动情况/.test(link.label) ? "price" : null;
      if (kind) output.set(link.url, { url: link.url, kind });
    }
  }
  return [...output.values()].sort((a, b) => a.url.localeCompare(b.url));
}

/**
 * Fetches only public National Bureau of Statistics release pages. A full
 * backfill walks the public release archive (currently 2021 onward); routine
 * worker calls inspect only the newest three archive pages.
 */
export async function fetchNbsRealEstateHistory(options: Options = {}): Promise<NbsRealEstateHistory> {
  const key = options.historical ? "history" : "latest";
  const saved = !options.fetchText && !options.fetchBinary ? cache.get(key) : undefined;
  if (saved && Date.now() - saved.at < 24 * 60 * 60 * 1000) return saved.values;
  const text = options.fetchText ?? defaultText;
  const binary = options.fetchBinary ?? defaultBinary;
  const output: NbsRealEstateHistory = new Map();
  const docs = await publications(options);
  for (const [index, publication] of docs.entries()) {
    if (options.historical) console.log(`[nbs-realestate] ${index + 1}/${docs.length} ${publication.kind}`);
    const html = await text(publication.url);
    if (publication.kind === "price") {
      try {
        merge(output, parseNbs70CityPriceArticle(html));
      } catch (error) {
        // A few archived publications are interpretation-only pages which
        // link no complete city table. Keep the valid monthly archive moving;
        // a later complete official table for the same month will still merge.
        console.warn(`[nbs-realestate] 跳过无完整70城表的发布页 ${publication.url}；${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }
    const attachment = anchors(html, publication.url).find((link) => /\.xlsx?(?:$|[?#])/i.test(link.url));
    if (!attachment) throw new Error(`国家统计局房地产月报缺少相关数据表：${publication.url}`);
    const book = XLSX.read(await binary(attachment.url), { type: "buffer", cellDates: false });
    try {
      merge(output, parseNbsPropertyWorkbook(book, html));
    } catch (error) {
      throw new Error(`国家统计局房地产月报解析失败：${publication.url}；${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const item of output.values()) item.points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  if (!output.size) throw new Error(`国家统计局房地产公开月报未解析出任何时间序列（候选发布页=${docs.length}）`);
  if (!options.fetchText && !options.fetchBinary) cache.set(key, { at: Date.now(), values: output });
  return output;
}

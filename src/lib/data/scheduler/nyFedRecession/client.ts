import * as XLSX from "xlsx";
import fs from "node:fs";

/**
 * NY Fed 收益率曲线衰退概率 —— 数据源。
 * 官方以 Excel（allmonth.xls，sheet "rec_prob"）分发全历史 + 12 个月前瞻预测；
 * 该模型（Estrella-Mishkin 收益率曲线）的 Rec_prob 序列不在 FRED。
 * robots.txt 允许 /research/capital_markets/ 下载（2026-07 核实）。
 */
export const NYFED_RECESSION_XLS_URL =
  "https://www.newyorkfed.org/medialibrary/media/research/capital_markets/allmonth.xls";
export const NYFED_RECESSION_PAGE_URL =
  "https://www.newyorkfed.org/research/capital_markets/ycfaq";

let cache: { at: number; wb: XLSX.WorkBook } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）NY Fed 衰退概率工作簿；同轮 worker 60s 内复用，避免重复请求源站 */
export async function fetchNyFedRecessionWorkbook(opts?: {
  fixturePath?: string;
  url?: string;
}): Promise<XLSX.WorkBook> {
  if (opts?.fixturePath) {
    return XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" });
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.wb;

  const url = opts?.url ?? NYFED_RECESSION_XLS_URL;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.NYFED_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "application/vnd.ms-excel,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`NY Fed 抓取 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  cache = { at: Date.now(), wb };
  return wb;
}

export function clearNyFedRecessionCache(): void {
  cache = null;
}

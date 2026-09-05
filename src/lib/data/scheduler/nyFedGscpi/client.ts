import * as XLSX from "xlsx";
import fs from "node:fs";

/**
 * 全球供应链压力指数（Global Supply Chain Pressure Index，GSCPI）—— 数据源。
 * 纽约联储自研指数（运输成本 + 制造业指标 PCA 合成），不在 FRED
 * （搜索 "global supply chain pressure index" 零命中，2026-09 核实）。
 * 官方以 Excel 分发月度全历史：`gscpi_data.xlsx`，sheet "GSCPI Monthly Data"。
 * `.xlsx` 后缀不一定是真 xlsx——本文件实为 OLE2/CFB 容器（`D0CF11E0`），xlsx 库可直接读。
 * robots.txt 未 Disallow `/research/policy/gscpi`（2026-09 核实）。
 */
export const NYFED_GSCPI_XLS_URL =
  "https://www.newyorkfed.org/medialibrary/research/interactives/gscpi/downloads/gscpi_data.xlsx";
export const NYFED_GSCPI_PAGE_URL = "https://www.newyorkfed.org/research/policy/gscpi";

let cache: { at: number; wb: XLSX.WorkBook } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）GSCPI 工作簿；同轮 worker 60s 内复用，避免重复请求源站 */
export async function fetchNyFedGscpiWorkbook(opts?: {
  fixturePath?: string;
  url?: string;
}): Promise<XLSX.WorkBook> {
  if (opts?.fixturePath) {
    return XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" });
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.wb;

  const url = opts?.url ?? NYFED_GSCPI_XLS_URL;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.NYFED_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "application/vnd.ms-excel,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`NY Fed GSCPI 抓取 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  cache = { at: Date.now(), wb };
  return wb;
}

export function clearNyFedGscpiCache(): void {
  cache = null;
}

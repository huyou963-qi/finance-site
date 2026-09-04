import * as XLSX from "xlsx";
import fs from "node:fs";

/**
 * Damodaran 隐含股权风险溢价（Implied ERP）—— 数据源。
 * NYU Stern 教授 Aswath Damodaran 个人网站，年度更新（每年 1 月），
 * 是学术界公认的免费权威 ERP 序列，不在 FRED。
 * robots.txt 仅禁止 /~tang/aboutus/recruiters/，与本页无关（2026-09 核实）。
 * 直链经 stern.nyu.edu → people.stern.nyu.edu → pages.stern.nyu.edu 跳转，
 * 但目标 URL 稳定，Content-Type: application/vnd.ms-excel，真实 OLE2 xls（非伪装 HTML）。
 */
export const DAMODARAN_ERP_XLS_URL =
  "https://www.stern.nyu.edu/~adamodar/pc/datasets/histimpl.xls";
export const DAMODARAN_ERP_PAGE_URL =
  "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histimpl.html";

let cache: { at: number; wb: XLSX.WorkBook } | null = null;
const CACHE_TTL_MS = 60_000;

/** 抓取（或读 fixture）Damodaran histimpl.xls 工作簿；同轮 worker 60s 内复用 */
export async function fetchDamodaranErpWorkbook(opts?: {
  fixturePath?: string;
  url?: string;
}): Promise<XLSX.WorkBook> {
  if (opts?.fixturePath) {
    return XLSX.read(fs.readFileSync(opts.fixturePath), { type: "buffer" });
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.wb;

  const url = opts?.url ?? DAMODARAN_ERP_XLS_URL;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.DAMODARAN_USER_AGENT?.trim() || "finance-site-data-scheduler/1.0",
      Accept: "application/vnd.ms-excel,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Damodaran ERP 抓取 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  cache = { at: Date.now(), wb };
  return wb;
}

export function clearDamodaranErpCache(): void {
  cache = null;
}

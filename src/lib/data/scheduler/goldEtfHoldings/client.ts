import { readFile } from "node:fs/promises";

export const SPDR_GLD_ARCHIVE_URL =
  "https://api.spdrgoldshares.com/api/v1/historical-archive?exchange=NYSE&lang=en&product=gld";
export const ISHARES_IAU_PAGE_URL =
  "https://www.ishares.com/us/products/239561/ishares-gold-trust/1467271812596.ajax?fileType=csv&fileName=IAU_holdings&dataType=fund";
export const GLOBAL_X_GOLD_NAV_URL =
  "https://files.globalxetfs.com.au/GOLD_NAV_Data_20260821.xlsx";
export const GLOBAL_X_METAL_ENTITLEMENT_URL =
  "https://files.globalxetfs.com.au/Metal_Entitlement_GX_d89e28b5e1.xlsx";
export const GLOBAL_X_GOLD_PAGE_URL = "https://www.globalxetfs.com.au/funds/gold/";
export const WISDOMTREE_GBS_BARLIST_URL =
  "https://dataspanapi.wisdomtree.com/pdr/documents/METALBAR/GBS/UK/EN-GB/GB00B00FHZ82/";
export const WISDOMTREE_SGBS_BARLIST_URL =
  "https://dataspanapi.wisdomtree.com/pdr/documents/METALBAR/MSL/UK/EN-GB/JE00B588CD74/";
export const WGC_GOLD_ETF_PAGE_URL =
  "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows";

const USER_AGENT = "finance-site gold-etf updater/1.0 (licensed project data ingestion)";

export async function fetchOfficialFile(url: string, fixturePath?: string): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const response = await fetch(url, {
    headers: { Accept: "application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html;q=0.9", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`黄金 ETF 官方文件下载失败 HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function fetchOfficialHtml(url: string, fixturePath?: string): Promise<string> {
  if (fixturePath) return readFile(fixturePath, "utf8");
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`黄金 ETF 官方页面下载失败 HTTP ${response.status}`);
  return response.text();
}

export async function discoverGlobalXGoldFiles(pageUrl = GLOBAL_X_GOLD_PAGE_URL): Promise<{
  navUrl: string;
  entitlementUrl: string;
}> {
  const html = await fetchOfficialHtml(pageUrl);
  const navUrl = html.match(/https:\/\/files\.globalxetfs\.com\.au\/GOLD_NAV_Data_\d{8}\.xlsx/)?.[0];
  const entitlementUrl = html.match(/https:\/\/files\.globalxetfs\.com\.au\/Metal_Entitlement_GX_[a-z0-9]+\.xlsx/)?.[0];
  if (!navUrl || !entitlementUrl) throw new Error("Global X GOLD 页面缺少 NAV/Metal Entitlement 文件 URL");
  return { navUrl, entitlementUrl };
}

function wgcHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html;q=0.9",
    "User-Agent": USER_AGENT,
  };
  const cookie = process.env.WGC_GOLDHUB_COOKIE?.trim();
  const host = new URL(url).hostname.toLowerCase();
  if (cookie && (host === "gold.org" || host.endsWith(".gold.org"))) headers.Cookie = cookie;
  return headers;
}

async function fetchWgc(url: string): Promise<Response> {
  return fetch(url, { headers: wgcHeaders(url), signal: AbortSignal.timeout(30_000) });
}

/** Discover the current licensed monthly workbook; an explicit deployment URL wins. */
export async function discoverWgcGoldEtfXlsxUrl(
  pageUrl = WGC_GOLD_ETF_PAGE_URL,
): Promise<string> {
  const override = process.env.WGC_GOLD_ETF_XLSX_URL?.trim();
  if (override) return new URL(override).href;
  if (!process.env.WGC_GOLDHUB_COOKIE?.trim()) {
    throw new Error("WGC Goldhub 下载需要 WGC_GOLDHUB_COOKIE 或 WGC_GOLD_ETF_XLSX_URL");
  }
  const response = await fetchWgc(pageUrl);
  if (!response.ok) throw new Error(`WGC Goldhub 页面访问失败 HTTP ${response.status}`);
  const html = await response.text();
  const path = html.match(/\/download\/file\/\d+\/ETF_Flows_[^"'<>]+\.xlsx/i)?.[0];
  if (!path) throw new Error("WGC Goldhub 页面缺少当前 ETF Flows XLSX URL");
  return new URL(path, pageUrl).href;
}

export async function fetchWgcGoldEtfWorkbook(
  pageUrl = WGC_GOLD_ETF_PAGE_URL,
  fixturePath?: string,
): Promise<Buffer> {
  if (fixturePath) return readFile(fixturePath);
  const url = await discoverWgcGoldEtfXlsxUrl(pageUrl);
  const response = await fetchWgc(url);
  if (!response.ok) throw new Error(`WGC Gold ETF 月表下载失败 HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("WGC Gold ETF 月表响应不是 XLSX 文件");
  }
  return buffer;
}

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  JP_JTA_ACCOMMODATION_PAGE_URL,
  JP_JTA_INBOUND_CONSUMPTION_PAGE_URL,
} from "./catalog";
import { discoverInboundConsumptionResultPdfs } from "./parser";

const USER_AGENT = "finance-site-data-scheduler/1.0 (official JTA statistics; low-frequency)";
let lastRequestAt = 0;
async function officialFetch(url: string, accept: string) {
  const wait = Math.max(0, 1_000 - (Date.now() - lastRequestAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  const response = await fetch(url, { headers: { Accept: accept, "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`JTA official source HTTP ${response.status}: ${url}`);
  return response;
}

export async function pdfText(buffer: Buffer): Promise<string> {
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      pages.push((await page.getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" | "));
    }
    return pages.join(" | ");
  } finally { await document.destroy(); }
}

function discoverTransitionWorkbookUrl(html: string): string {
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ href: match[1], text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") }))
    .filter(({ href, text }) => /\.xlsx(?:\?|$)/i.test(href) && /推移表/.test(text));
  if (links.length !== 1) throw new Error(`JTA accommodation expected one transition workbook; found ${links.length}`);
  return new URL(links[0].href, JP_JTA_ACCOMMODATION_PAGE_URL).toString();
}

export async function fetchJpTourismCore(fixtureDir?: string): Promise<{ consumptionTexts: Array<{ text: string; label?: string }>; accommodationWorkbook: Buffer }> {
  if (fixtureDir) return {
    consumptionTexts: [{ text: await readFile(path.join(fixtureDir, "inbound-consumption-summary.txt"), "utf8") }],
    accommodationWorkbook: await readFile(path.join(fixtureDir, "accommodation-transition.xlsx")),
  };
  const consumptionPage = await (await officialFetch(JP_JTA_INBOUND_CONSUMPTION_PAGE_URL, "text/html")).text();
  const pdfUrls = discoverInboundConsumptionResultPdfs(consumptionPage, JP_JTA_INBOUND_CONSUMPTION_PAGE_URL);
  const consumptionTexts: Array<{ text: string; label: string }> = [];
  for (const pdf of pdfUrls) consumptionTexts.push({ text: await pdfText(Buffer.from(await (await officialFetch(pdf.url, "application/pdf")).arrayBuffer())), label: pdf.label });
  const accommodationPage = await (await officialFetch(JP_JTA_ACCOMMODATION_PAGE_URL, "text/html")).text();
  const workbookUrl = discoverTransitionWorkbookUrl(accommodationPage);
  const accommodationWorkbook = Buffer.from(await (await officialFetch(workbookUrl, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).arrayBuffer());
  if (accommodationWorkbook.subarray(0, 2).toString() !== "PK") throw new Error("JTA accommodation transition response is not XLSX");
  const snapshotDir = path.join(process.cwd(), ".data", "jp-tourism-core", "snapshots");
  await mkdir(snapshotDir, { recursive: true });
  const sha256 = createHash("sha256").update(accommodationWorkbook).digest("hex");
  await writeFile(path.join(snapshotDir, `${sha256}.xlsx`), accommodationWorkbook, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
  return { consumptionTexts, accommodationWorkbook };
}

import * as XLSX from "xlsx";
import { NYFED_HHDC_PAGE } from "./catalog";
import { discoverHhdcWorkbook } from "./parser";

let cached: { at: number; value: Promise<{ workbook: XLSX.WorkBook; url: string }> } | undefined;
export function fetchHhdcWorkbook() {
  if (cached && Date.now() - cached.at < 300_000) return cached.value;
  const value = (async () => {
    const page = await fetch(NYFED_HHDC_PAGE, { signal: AbortSignal.timeout(30_000) });
    if (!page.ok) throw new Error(`HHDC page HTTP ${page.status}`);
    const url = discoverHhdcWorkbook(await page.text());
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HHDC workbook HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data[0] !== 0x50 && data[0] !== 0xd0) throw new Error("HHDC response is not an Excel workbook");
    return { workbook: XLSX.read(data, { type: "buffer" }), url };
  })();
  cached = { at: Date.now(), value };
  void value.catch(() => { if (cached?.value === value) cached = undefined; });
  return value;
}

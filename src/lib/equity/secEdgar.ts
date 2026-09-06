/** Shared EDGAR transport and submissions discovery. All SEC consumers reuse this boundary. */
let tail: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
export async function fetchSecText(url: string, timeoutMs = 30000): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !["www.sec.gov", "data.sec.gov"].includes(u.hostname)) throw new Error("非法 SEC 地址");
  const run = tail.catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(r => setTimeout(r, Math.max(0, 250 - (Date.now() - lastRequest))));
      lastRequest = Date.now();
      const response = await fetch(url, { headers: {
        "User-Agent": process.env.SEC_USER_AGENT?.trim() || "hblook.com ownership-research admin@hblook.com",
        Accept: "application/json, application/xml, text/html",
      }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      if (response.ok) return response.text();
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) throw new Error(`SEC HTTP ${response.status}`);
      const retry = Number(response.headers.get("retry-after"));
      await new Promise(r => setTimeout(r, Math.min(10000, Math.max(1000 * 2 ** attempt, Number.isFinite(retry) ? retry * 1000 : 0))));
    }
    throw new Error("SEC 重试失败");
  });
  tail = run;
  return run;
}
export async function fetchSecJson<T>(url: string, timeoutMs?: number): Promise<T> {
  return JSON.parse(await fetchSecText(url, timeoutMs)) as T;
}
export type SecIndexRow = { accession: string; form: string; filedAt: string; primaryDocument: string | null; items: string | null; description: string | null };
type IndexColumns = { accessionNumber?: string[]; form?: string[]; filingDate?: string[]; primaryDocument?: string[]; items?: string[]; primaryDocDescription?: string[] };
export function secIndexRows(data: IndexColumns): SecIndexRow[] {
  return (data.accessionNumber ?? []).flatMap((accession, i) => {
    const form = data.form?.[i], filedAt = data.filingDate?.[i];
    return form && filedAt ? [{ accession, form, filedAt, primaryDocument: data.primaryDocument?.[i] || null, items: data.items?.[i] || null, description: data.primaryDocDescription?.[i] || null }] : [];
  });
}
export function secDocumentUrl(cik: string, accession: string, document: string | null, rawXml = false) {
  const filename = rawXml ? document?.split("/").pop() : document;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${filename || `${accession}-index.htm`}`;
}
/** Failure of any historical page fails discovery, never marks a partial history complete. */
export async function discoverSecFilings(cik: string, since: string, history = false): Promise<SecIndexRow[]> {
  const padded = cik.replace(/\D/g, "").padStart(10, "0");
  const data = await fetchSecJson<{ filings?: { recent?: IndexColumns; files?: { name: string; filingTo: string }[] } }>(`https://data.sec.gov/submissions/CIK${padded}.json`);
  if (!data.filings?.recent) throw new Error("SEC submissions 缺少索引");
  const rows = secIndexRows(data.filings.recent);
  if (history) for (const file of data.filings.files ?? []) {
    if (file.filingTo < since) continue;
    if (!/^CIK\d+-submissions-\d+\.json$/.test(file.name)) throw new Error("未知 SEC 历史索引名称");
    rows.push(...secIndexRows(await fetchSecJson<IndexColumns>(`https://data.sec.gov/submissions/${file.name}`)));
  }
  return [...new Map(rows.filter(r => r.filedAt >= since).map(r => [r.accession, r])).values()].sort((a,b) => a.filedAt.localeCompare(b.filedAt) || a.accession.localeCompare(b.accession));
}

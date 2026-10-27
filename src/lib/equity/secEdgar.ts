import sanitizeHtml from "sanitize-html";
import { parseSecDailyIndex } from "./dailyDisclosurePolicy";
import { easternParts, parseSecAcceptanceTime } from "./disclosureTiming";

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
export type SecIndexRow = { accession: string; form: string; filedAt: string; primaryDocument: string | null; items: string | null; description: string | null; reportDate?: string | null; acceptanceReportedAt?: string | null };
type IndexColumns = { accessionNumber?: string[]; form?: string[]; filingDate?: string[]; primaryDocument?: string[]; items?: string[]; primaryDocDescription?: string[]; reportDate?: string[]; acceptanceDateTime?: string[] };
export function secIndexRows(data: IndexColumns): SecIndexRow[] {
  return (data.accessionNumber ?? []).flatMap((accession, i) => {
    const form = data.form?.[i], filedAt = data.filingDate?.[i];
    return form && filedAt ? [{ accession, form, filedAt, primaryDocument: data.primaryDocument?.[i] || null, items: data.items?.[i] || null, description: data.primaryDocDescription?.[i] || null, reportDate: data.reportDate?.[i] || null, acceptanceReportedAt: data.acceptanceDateTime?.[i] || null }] : [];
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

/** Daily discovery is one shared index request per date, never one request per security. */
export async function fetchSecDailyIndex(day: string) {
  const quarter = Math.ceil(Number(day.slice(5, 7)) / 3);
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${day.slice(0, 4)}/QTR${quarter}/master.${day.replace(/-/g, "")}.idx`;
  return parseSecDailyIndex(await fetchSecText(url, 60_000));
}

export type SecReleaseAttachment = { filename: string; url: string; text: string };
/** Keep attachment evidence separate from standardized GAAP metrics. Never render source HTML. */
export function parseSecReleaseAttachments(source: string, cik: string, accession: string): SecReleaseAttachment[] {
  const attachments: SecReleaseAttachment[] = [];
  for (const match of source.matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi)) {
    const document = match[1];
    const type = document.match(/<TYPE>\s*([^\r\n<]+)/i)?.[1]?.trim();
    const filename = document.match(/<FILENAME>\s*([^\r\n<]+)/i)?.[1]?.trim();
    if (!type?.match(/^EX-99(?:\.\d+)?$/i) || !filename || !/^[\w.-]+\.html?$/i.test(filename)) continue;
    const body = document.match(/<TEXT>([\s\S]*?)(?:<\/TEXT>|$)/i)?.[1] ?? "";
    const plain = sanitizeHtml(body.replace(/<\/(?:td|th)>/gi, " | ")
      .replace(/<\/(?:p|div|tr|h[1-6])>|<br\s*\/?\s*>/gi, "\n"), {
      allowedTags: [], allowedAttributes: {},
    }).replace(/&#(x[\da-f]+|\d+);/gi, (encoded, code: string) => {
      const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : encoded;
    }).replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, name: string) =>
      ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[name.toLowerCase()] ?? _))
      .replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
    attachments.push({ filename, url: secDocumentUrl(cik, accession, filename), text: plain.slice(0, 20_000) });
    if (attachments.length === 5) break;
  }
  return attachments;
}

export async function fetchSecReleaseAttachments(cik: string, accession: string) {
  return (await fetchSecReleaseEvidence(cik, accession)).attachments;
}

export type ReleasePublication = { at: string | null; date: string; sourceUrl: string; evidence: string };
/** Only explicit publication metadata with a timezone/date precision is accepted. */
export function parseReleasePublication(source: string, url: string, filedAt: string): ReleasePublication | null {
  const matches: string[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record["@graph"]) collect(record["@graph"]);
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.some(type => typeof type === "string" && /^(?:NewsArticle|Article|PressRelease|Report|FinancialReport)$/.test(type)) && typeof record.datePublished === "string") matches.push(record.datePublished);
  };
  for (const script of source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collect(JSON.parse(script[1].slice(0, 100_000))); } catch { /* Malformed metadata does not become a publication time. */ }
  }
  if (new Set(matches).size !== 1) return null;
  const raw = matches[0];
  const precise = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (!precise && !dateOnly) return null;
  const calendarDate = new Date(raw.slice(0, 10));
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  const day = precise ? easternParts(date).date : raw;
  const lag = new Date(filedAt).getTime() - new Date(day).getTime();
  if (lag < -86_400_000 || lag > 14 * 86_400_000) return null;
  return { at: precise ? date.toISOString() : null, date: day, sourceUrl: url, evidence: `datePublished: ${raw}` };
}

export function parseSecReleaseEvidence(source: string, cik: string, accession: string, filedAt: string) {
  const attachments = parseSecReleaseAttachments(source, cik, accession);
  const publications: ReleasePublication[] = [];
  for (const document of source.matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi)) {
    const filename = document[1].match(/<FILENAME>\s*([^\r\n<]+)/i)?.[1]?.trim();
    const attachment = attachments.find(item => item.filename === filename);
    if (!attachment) continue;
    const publication = parseReleasePublication(document[1], attachment.url, filedAt);
    if (publication) publications.push(publication);
  }
  const unique = new Set(publications.map(publication => publication.at ?? publication.date));
  return { attachments, publication: unique.size === 1 ? publications[0] : null,
    acceptedAt: parseSecAcceptanceTime(source), acceptedAtSource: secAcceptanceUrl(cik, accession) };
}
export function secAcceptanceUrl(cik: string, accession: string) {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${accession}-index-headers.html`;
}
export async function fetchSecAcceptanceEvidence(cik: string, accession: string) {
  const sourceUrl = secAcceptanceUrl(cik, accession);
  const acceptedAt = parseSecAcceptanceTime(await fetchSecText(sourceUrl));
  if (!acceptedAt) throw new Error("SEC 接收时刻无法从 SGML 头可靠核验");
  return { acceptedAt, sourceUrl };
}
export async function fetchSecReleaseEvidence(cik: string, accession: string, filedAt = new Date().toISOString().slice(0, 10)) {
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${accession}.txt`;
  return parseSecReleaseEvidence(await fetchSecText(url, 60_000), cik, accession, filedAt);
}

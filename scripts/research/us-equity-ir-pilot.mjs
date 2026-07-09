/**
 * Phase R3: IR page structure & disclosure frequency pilot (10–20 tickers).
 * Usage: node scripts/research/us-equity-ir-pilot.mjs
 * Output: scripts/data/research/us-equity-industry/ir_pilot_report.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "scripts/data/research/us-equity-industry");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const FMP_KEY = process.env.FMP_API_KEY?.trim() ?? "";
const UA = "finance-site-research/1.0 (contact: research@local; IR pilot only)";

/** 跨 GICS sector 代表股 + 已知 IR 结构差异 */
const PILOT_TICKERS = [
  { symbol: "AAPL", sectorHint: "Technology" },
  { symbol: "MSFT", sectorHint: "Technology" },
  { symbol: "NVDA", sectorHint: "Technology" },
  { symbol: "AMZN", sectorHint: "Consumer Discretionary" },
  { symbol: "COST", sectorHint: "Consumer Staples" },
  { symbol: "CAT", sectorHint: "Industrials" },
  { symbol: "XOM", sectorHint: "Energy" },
  { symbol: "JPM", sectorHint: "Financials" },
  { symbol: "UNH", sectorHint: "Health Care" },
  { symbol: "PG", sectorHint: "Consumer Staples" },
  { symbol: "META", sectorHint: "Communication Services" },
  { symbol: "LLY", sectorHint: "Health Care" },
  { symbol: "NEE", sectorHint: "Utilities" },
  { symbol: "PLD", sectorHint: "Real Estate" },
  { symbol: "LIN", sectorHint: "Materials" },
];

/** 常见 IR URL 模式（由 profile.website 推导 + 手工校正） */
const IR_URL_OVERRIDES = {
  AAPL: "https://investor.apple.com",
  MSFT: "https://www.microsoft.com/en-us/investor",
  NVDA: "https://investor.nvidia.com",
  AMZN: "https://ir.aboutamazon.com",
  COST: "https://investor.costco.com",
  CAT: "https://investors.caterpillar.com",
  XOM: "https://corporate.exxonmobil.com/investors",
  JPM: "https://www.jpmorganchase.com/ir",
  UNH: "https://www.unitedhealthgroup.com/investors.html",
  PG: "https://www.pginvestor.com",
  META: "https://investor.atmeta.com",
  LLY: "https://investor.lilly.com",
  NEE: "https://www.investor.nexteraenergy.com",
  PLD: "https://ir.prologis.com",
  LIN: "https://www.linde.com/investors",
};

async function fmpProfile(symbol) {
  if (!FMP_KEY) return null;
  const url = `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${FMP_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) ? body[0] : null;
}

async function fetchText(url, maxBytes = 120_000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, status: res.status, url };
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.slice(0, maxBytes),
    );
    return { ok: true, status: res.status, url: res.url, text, bytes: buf.byteLength };
  } catch (e) {
    return { ok: false, url, error: String(e) };
  }
}

function detectIrFeatures(html, baseUrl) {
  const lower = html.toLowerCase();
  const features = {
    hasNewsSection: /news|press release|newsroom/i.test(html),
    hasEvents: /events|webcast|conference/i.test(html),
    hasPresentations: /presentation|slide|investor day/i.test(html),
    hasSecFilings: /sec filing|10-k|10-q|8-k|edgar/i.test(html),
    hasRss: /rss|feed/i.test(html),
    hasQuarterlyResults: /quarterly|earnings|results/i.test(html),
    hasShareholderLetter: /shareholder letter|letter to shareholder/i.test(html),
    hasMonthlyUpdate: /monthly|month-end|operating update/i.test(html),
  };

  const rssLinks = [];
  for (const m of html.matchAll(/href=["']([^"']*(?:rss|feed)[^"']*)["']/gi)) {
    try {
      rssLinks.push(new URL(m[1], baseUrl).href);
    } catch {
      /* skip */
    }
  }

  const newsLinks = [];
  for (const m of html.matchAll(/href=["']([^"']*(?:news|press)[^"']*)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl).href;
      if (newsLinks.length < 8) newsLinks.push(u);
    } catch {
      /* skip */
    }
  }

  return { features, rssLinks: [...new Set(rssLinks)].slice(0, 5), newsLinks: [...new Set(newsLinks)].slice(0, 8) };
}

async function fetchSecSubmissions(cik) {
  const padded = String(cik).replace(/\D/g, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  const recent = data?.filings?.recent;
  if (!recent?.form || !recent?.filingDate) return { ok: true, filings: [] };

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const filings = [];
  for (let i = 0; i < recent.form.length && filings.length < 200; i++) {
    const form = recent.form[i];
    const date = recent.filingDate[i];
    if (date < cutoffStr) continue;
    if (!/^(8-K|10-Q|10-K|6-K)/.test(form)) continue;
    filings.push({
      form,
      date,
      accessionNumber: recent.accessionNumber?.[i],
      primaryDocument: recent.primaryDocument?.[i],
      items: recent.items?.[i] ?? null,
    });
  }
  return { ok: true, companyName: data.name, filings, totalRecent: recent.form.length };
}

function summarizeFilingFrequency(filings) {
  const byForm = {};
  const byMonth = {};
  for (const f of filings) {
    byForm[f.form] = (byForm[f.form] ?? 0) + 1;
    const month = f.date.slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + 1;
  }
  const monthsWithFilings = Object.keys(byMonth).length;
  const avgPerMonth = filings.length / Math.max(monthsWithFilings, 1);
  return { byForm, byMonth, monthsWithFilings, avgFilingsPerActiveMonth: avgPerMonth, total: filings.length };
}

async function probeTicker(entry) {
  const { symbol } = entry;
  const profile = await fmpProfile(symbol);
  await new Promise((r) => setTimeout(r, 350));

  const irUrl = IR_URL_OVERRIDES[symbol] ?? (profile?.website ? `${profile.website.replace(/\/$/, "")}/investor` : null);
  const irFetch = irUrl ? await fetchText(irUrl) : { ok: false, error: "no ir url" };
  const irAnalysis =
    irFetch.ok && irFetch.text
      ? detectIrFeatures(irFetch.text, irFetch.url ?? irUrl)
      : null;

  const cik = profile?.cik;
  const secData = cik ? await fetchSecSubmissions(cik) : { ok: false, error: "no cik" };
  await new Promise((r) => setTimeout(r, 200));

  const filingSummary = secData.ok ? summarizeFilingFrequency(secData.filings ?? []) : null;

  return {
    symbol,
    sectorHint: entry.sectorHint,
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    cik: profile?.cik ?? null,
    website: profile?.website ?? null,
    irUrl,
    irFetch: { ok: irFetch.ok, status: irFetch.status, finalUrl: irFetch.url, bytes: irFetch.bytes, error: irFetch.error },
    irFeatures: irAnalysis?.features ?? null,
    irRssLinks: irAnalysis?.rssLinks ?? [],
    irNewsLinksSample: irAnalysis?.newsLinks ?? [],
    secFilings12m: filingSummary,
    secSampleFilings: secData.filings?.slice(0, 15) ?? [],
    hasTrueMonthlyIr: irAnalysis?.features?.hasMonthlyUpdate ?? false,
    estimatedDisclosureCadence:
      filingSummary && filingSummary.byForm["8-K"]
        ? `8-K ~${filingSummary.byForm["8-K"]}/12mo; 10-Q ~${filingSummary.byForm["10-Q"] ?? 0}/12mo`
        : "unknown",
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const entry of PILOT_TICKERS) {
    console.log(`Probing IR: ${entry.symbol}...`);
    results.push(await probeTicker(entry));
  }

  const aggregate = {
    tickerCount: results.length,
    withIrPageOk: results.filter((r) => r.irFetch.ok).length,
    withRssHint: results.filter((r) => r.irRssLinks.length > 0).length,
    withMonthlyKeyword: results.filter((r) => r.hasTrueMonthlyIr).length,
    avg8KPerYear: results.reduce((s, r) => s + (r.secFilings12m?.byForm?.["8-K"] ?? 0), 0) / results.length,
    avg10QPerYear: results.reduce((s, r) => s + (r.secFilings12m?.byForm?.["10-Q"] ?? 0), 0) / results.length,
  };

  const catalogDraft = results.map((r) => ({
    ticker: r.symbol,
    cik: r.cik,
    gicsSector: r.sector,
    gicsIndustry: r.industry,
    irBaseUrl: r.irUrl,
    rssUrls: r.irRssLinks,
    scrapeStrategy: r.irRssLinks.length > 0 ? "rss_first" : r.irFetch.ok ? "html_news_list" : "manual",
    secFallback: true,
    notes: r.hasTrueMonthlyIr ? "页面含 monthly 关键词" : "无固定月度 IR 信迹象",
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    pilotTickers: PILOT_TICKERS.map((t) => t.symbol),
    aggregate,
    catalogDraft,
    tickers: results,
    conclusion:
      "多数公司 IR 以季度 earnings + 8-K 为主；页面含 'monthly' 关键词的极少。高频跟踪应定义为「IR/SEC 新披露捕获 + 月度 AI 汇总」，而非假设每家有月度 IR 信。",
  };

  const outPath = path.join(outDir, "ir_pilot_report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(aggregate, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

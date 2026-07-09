/**
 * Phase R1/R2 research probe: FMP GICS, constituents, sector performance, ETF holdings.
 * Usage: node scripts/research/us-equity-industry-research.mjs
 * Output: scripts/data/research/us-equity-industry/*.json (no secrets in output)
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
const BASE = "https://financialmodelingprep.com/stable";

/** GICS 11 Sector ↔ SPDR Select Sector ETF */
const GICS_SECTOR_ETF = {
  Energy: "XLE",
  Materials: "XLB",
  Industrials: "XLI",
  "Consumer Discretionary": "XLY",
  "Consumer Staples": "XLP",
  "Health Care": "XLV",
  Financials: "XLF",
  "Information Technology": "XLK",
  "Communication Services": "XLC",
  Utilities: "XLU",
  "Real Estate": "XLRE",
};

const MEGA_CAPS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"];

function redactUrl(url) {
  return url.replace(FMP_KEY, "REDACTED");
}

async function fmpGet(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE}${endpoint}${sep}apikey=${FMP_KEY}`;
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 400) };
  }
  return {
    ok: res.ok,
    status: res.status,
    endpoint,
    url: redactUrl(url),
    body,
  };
}

function summarize(name, result) {
  const { ok, status, body } = result;
  const entry = { name, ok, status };
  if (Array.isArray(body)) {
    entry.type = "array";
    entry.count = body.length;
    entry.fields = body[0] ? Object.keys(body[0]) : [];
    entry.sample = body.slice(0, 2);
  } else if (body && typeof body === "object") {
    entry.type = "object";
    entry.fields = Object.keys(body);
    entry.sample = body;
  } else {
    entry.type = typeof body;
    entry.sample = body;
  }
  return entry;
}

function writeJson(name, data) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  return p;
}

async function probeEndpoints() {
  const endpoints = [
    ["profile", "/profile?symbol=AAPL"],
    ["profile_msft", "/profile?symbol=MSFT"],
    ["sp500_constituent", "/sp500-constituent"],
    ["nasdaq_constituent", "/nasdaq-constituent"],
    ["dow_constituent", "/dowjones-constituent"],
    ["historical_sp500", "/historical-sp500-constituent"],
    ["historical_sector_perf", "/historical-sector-performance?sector=Technology&from=2024-01-01&to=2024-03-01"],
    ["sector_snapshot", "/sector-performance-snapshot?date=2024-03-01"],
    ["historical_industry_perf", "/historical-industry-performance?industry=Software%20-%20Infrastructure&from=2024-01-01&to=2024-03-01"],
    ["xlk_eod", "/historical-price-eod/full?symbol=XLK&from=2024-01-01&to=2024-01-31"],
    ["spy_eod", "/historical-price-eod/full?symbol=SPY&from=2024-01-01&to=2024-01-31"],
    ["spy_holdings", "/etf/holdings?symbol=SPY"],
    ["xlk_holdings", "/etf/holdings?symbol=XLK"],
    ["spy_portfolio_dates", "/etf/portfolio-dates?symbol=SPY"],
    ["stock_screener_tech", "/company-screener?sector=Technology&limit=10"],
    ["stock_screener_energy", "/company-screener?sector=Energy&limit=10"],
    ["available_sectors", "/available-sectors"],
    ["available_industries", "/available-industries"],
  ];

  const results = [];
  for (const [name, ep] of endpoints) {
    const r = await fmpGet(ep);
    results.push(summarize(name, r));
    writeJson(`raw_${name}`, { ok: r.ok, status: r.status, endpoint: ep, body: r.body });
    await new Promise((res) => setTimeout(res, 350));
  }
  return results;
}

function analyzeSp500Sectors(constituents) {
  if (!Array.isArray(constituents)) return null;
  const bySector = {};
  for (const row of constituents) {
    const s = row.sector ?? row.Sector ?? "Unknown";
    bySector[s] = (bySector[s] ?? 0) + 1;
  }
  return { total: constituents.length, bySector };
}

function analyzeSpyWeights(holdings) {
  if (!Array.isArray(holdings)) return null;
  const rows = holdings
    .map((h) => ({
      symbol: h.asset ?? h.symbol ?? h.ticker,
      name: h.name,
      weight: Number(h.weightPercentage ?? h.weight ?? h.pctVal ?? 0),
      shares: h.sharesNumber ?? h.shares,
      marketValue: h.marketValue,
    }))
    .filter((r) => r.symbol && Number.isFinite(r.weight))
    .sort((a, b) => b.weight - a.weight);
  const top10 = rows.slice(0, 10);
  const top10Sum = top10.reduce((s, r) => s + r.weight, 0);
  const mega = rows.filter((r) => MEGA_CAPS.includes(String(r.symbol).toUpperCase()));
  return { totalRows: rows.length, top10, top10Sum, megaCaps: mega };
}

function compareMegaCapWeights(spyWeights, sp500Constituents) {
  if (!spyWeights?.megaCaps || !Array.isArray(sp500Constituents)) return null;
  const sp500Set = new Set(
    sp500Constituents.map((c) => (c.symbol ?? c.Symbol ?? "").toUpperCase()),
  );
  return spyWeights.megaCaps.map((m) => ({
    symbol: m.symbol,
    spyWeightPct: m.weight,
    inSp500: sp500Set.has(String(m.symbol).toUpperCase()),
  }));
}

async function probeSectorEtfs() {
  const etfResults = [];
  for (const [sector, etf] of Object.entries(GICS_SECTOR_ETF)) {
    const eod = await fmpGet(
      `/historical-price-eod/full?symbol=${etf}&from=2024-06-01&to=2024-06-30`,
    );
    const arr = Array.isArray(eod.body) ? eod.body : eod.body?.historical ?? [];
    etfResults.push({
      sector,
      etf,
      ok: eod.ok,
      status: eod.status,
      barCount: Array.isArray(arr) ? arr.length : 0,
      sampleBar: Array.isArray(arr) && arr[0] ? arr[0] : null,
    });
    await new Promise((res) => setTimeout(res, 300));
  }
  return etfResults;
}

async function probeLegacyV3() {
  const V3 = "https://financialmodelingprep.com/api/v3";
  const endpoints = [
    ["v3_sp500", "/sp500_constituent"],
    ["v3_spy_etf_holder", "/etf-holder/SPY"],
    ["v3_xlk_eod", "/historical-price-full/XLK?from=2024-01-01&to=2024-01-31"],
    ["v3_sector_perf", "/historical-sectors-performance?limit=5"],
  ];
  const results = [];
  for (const [name, ep] of endpoints) {
    const url = `${V3}${ep}${ep.includes("?") ? "&" : "?"}apikey=${FMP_KEY}`;
    const res = await fetch(url);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 300) };
    }
    results.push(summarize(name, { ok: res.ok, status: res.status, body }));
    await new Promise((r) => setTimeout(r, 350));
  }
  return results;
}

async function fetchWikipediaSp500(retries = 3) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=text&format=json&origin=*";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "finance-site-research/1.0 (local research)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const html = data?.parse?.text?.["*"] ?? "";
      const rows = [];
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let m;
      while ((m = trRe.exec(html)) !== null) {
        const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
          c[1].replace(/<[^>]+>/g, "").trim(),
        );
        if (cells.length >= 4 && /^[A-Z]{1,5}$/.test(cells[0])) {
          rows.push({
            symbol: cells[0],
            name: cells[1],
            sector: cells[2],
            subIndustry: cells[3],
          });
        }
      }
      const bySector = {};
      for (const r of rows) {
        bySector[r.sector] = (bySector[r.sector] ?? 0) + 1;
      }
      return { ok: true, count: rows.length, bySector, sample: rows.slice(0, 5), rows };
    } catch (e) {
      if (attempt === retries) return { ok: false, error: String(e) };
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return { ok: false, error: "exhausted retries" };
}

async function approximateWeightsFromProfiles(symbols) {
  const profiles = [];
  for (const sym of symbols) {
    const r = await fmpGet(`/profile?symbol=${sym}`);
    const p = Array.isArray(r.body) ? r.body[0] : null;
    if (p?.marketCap) {
      profiles.push({
        symbol: sym,
        marketCap: Number(p.marketCap),
        sector: p.sector,
        industry: p.industry,
      });
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  const total = profiles.reduce((s, p) => s + p.marketCap, 0);
  return profiles
    .map((p) => ({
      ...p,
      approxWeightPct: total > 0 ? (p.marketCap / total) * 100 : 0,
    }))
    .sort((a, b) => b.approxWeightPct - a.approxWeightPct);
}

async function main() {
  if (!FMP_KEY) {
    console.error("FMP_API_KEY not set in .env.local");
    process.exit(1);
  }

  console.log("Probing FMP endpoints (R1)...");
  const endpointSummary = await probeEndpoints();

  console.log("Probing legacy v3 endpoints...");
  const legacySummary = await probeLegacyV3();
  writeJson("legacy_v3_summary", legacySummary);

  console.log("Fetching Wikipedia S&P 500 fallback...");
  const wikiSp500 = await fetchWikipediaSp500();
  if (wikiSp500.ok) {
    writeJson("wikipedia_sp500", {
      count: wikiSp500.count,
      bySector: wikiSp500.bySector,
      sample: wikiSp500.sample,
    });
    writeJson(
      "wikipedia_sp500_rows",
      wikiSp500.rows.map(({ symbol, name, sector, subIndustry }) => ({
        symbol,
        name,
        sector,
        subIndustry,
      })),
    );
  }

  console.log("Probing sector ETFs (R1)...");
  const sectorEtfSummary = await probeSectorEtfs();

  const sp500Raw = JSON.parse(
    fs.readFileSync(path.join(outDir, "raw_sp500_constituent.json"), "utf8"),
  );
  const spyHoldingsRaw = JSON.parse(
    fs.readFileSync(path.join(outDir, "raw_spy_holdings.json"), "utf8"),
  );

  const sp500Body = Array.isArray(sp500Raw.body) ? sp500Raw.body : wikiSp500.rows ?? null;
  const spyBody = spyHoldingsRaw.body;

  console.log("Approximating mega-cap weights from FMP profile marketCap (R2)...");
  const megaCapApprox = await approximateWeightsFromProfiles(MEGA_CAPS);

  /** S&P 500 官方 factsheet 近似权重（2024-06 公开资料，用于 R2 对照；非实时） */
  const SP500_PUBLISHED_WEIGHTS_REF = {
    source: "S&P Dow Jones Indices factsheet (approx Jun 2024, public)",
    asOf: "2024-06",
    weights: {
      AAPL: 7.0,
      MSFT: 7.1,
      NVDA: 6.8,
      AMZN: 3.8,
      GOOGL: 2.1,
    },
    note: "Float-adjusted market cap weights; rounded from public factsheet snapshots",
  };

  const weightBenchmark = megaCapApprox.map((m) => {
    const published = SP500_PUBLISHED_WEIGHTS_REF.weights[m.symbol];
    return {
      symbol: m.symbol,
      sector: m.sector,
      marketCap: m.marketCap,
      approxWeightAmongMegaCapsPct: m.approxWeightPct,
      publishedSp500WeightPct: published ?? null,
      deltaVsPublishedPct:
        published != null ? m.approxWeightPct - published : null,
    };
  });

  console.log("Analyzing weights (R2)...");
  const sp500Analysis = analyzeSp500Sectors(sp500Body);
  const wikiSp500Analysis = wikiSp500.ok
    ? { total: wikiSp500.count, bySector: wikiSp500.bySector }
    : null;
  const spyWeightAnalysis = analyzeSpyWeights(spyBody);
  const megaCompare = compareMegaCapWeights(spyWeightAnalysis, sp500Body);

  const report = {
    generatedAt: new Date().toISOString(),
    fmpBase: BASE,
    gicsSectorEtfMap: GICS_SECTOR_ETF,
    endpointSummary,
    legacySummary,
    sectorEtfSummary,
    wikiSp500Analysis,
    sp500Analysis,
    spyWeightAnalysis: spyWeightAnalysis
      ? {
          totalRows: spyWeightAnalysis.totalRows,
          top10: spyWeightAnalysis.top10,
          top10Sum: spyWeightAnalysis.top10Sum,
          megaCaps: spyWeightAnalysis.megaCaps,
        }
      : null,
    megaCapWeightCompare: megaCompare,
    megaCapApproxWeightBenchmark: {
      reference: SP500_PUBLISHED_WEIGHTS_REF,
      rows: weightBenchmark,
      caveat:
        "approxWeightAmongMegaCapsPct 仅为 MEGA_CAPS 子集内市值占比，非 S&P500 官方权重；与 published 对照时误差大属预期。全指数权重需 constituents + float-adjusted mcap 或 ETF holdings。",
    },
    planLimits: {
      note: "402/limit responses recorded in endpointSummary status fields",
      failedEndpoints: endpointSummary.filter((e) => !e.ok).map((e) => ({
        name: e.name,
        status: e.status,
      })),
      workingOnCurrentPlan: endpointSummary.filter((e) => e.ok).map((e) => e.name),
    },
  };

  const reportPath = writeJson("research_report_r1_r2", report);
  console.log(`Wrote ${reportPath}`);
  console.log(
    JSON.stringify(
      {
        endpointsOk: endpointSummary.filter((e) => e.ok).length,
        endpointsFail: endpointSummary.filter((e) => !e.ok).length,
        sp500Count: sp500Analysis?.total,
        spyHoldingsCount: spyWeightAnalysis?.totalRows,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

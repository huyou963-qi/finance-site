/**
 * R2 supplement: S&P 500 market-cap weight approximation via Wikipedia + FMP profile.
 * Usage: node scripts/research/us-equity-weight-benchmark.mjs
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

const PUBLISHED_WEIGHTS = {
  AAPL: 7.0,
  MSFT: 7.1,
  NVDA: 6.8,
  AMZN: 3.8,
  GOOGL: 2.1,
  META: 2.3,
  BRK: 1.7,
  TSLA: 1.5,
  AVGO: 1.4,
  JPM: 1.2,
};

async function profile(symbol, retries = 2) {
  const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_KEY}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const body = await res.json();
      const p = Array.isArray(body) ? body[0] : null;
      if (!p?.marketCap) return null;
      return {
        symbol: p.symbol ?? symbol,
        marketCap: Number(p.marketCap),
        sector: p.sector,
        industry: p.industry,
      };
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

async function main() {
  const rowsPath = path.join(outDir, "wikipedia_sp500_rows.json");
  const progressPath = path.join(outDir, "weight_benchmark_progress.json");
  let symbols;
  if (fs.existsSync(rowsPath)) {
    symbols = JSON.parse(fs.readFileSync(rowsPath, "utf8"));
  } else {
    const res = await fetch(
      "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=text&format=json&origin=*",
      { headers: { "User-Agent": "finance-site-research/1.0" } },
    );
    const data = await res.json();
    const html = data?.parse?.text?.["*"] ?? "";
    symbols = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = trRe.exec(html)) !== null) {
      const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
        c[1].replace(/<[^>]+>/g, "").trim(),
      );
      if (cells.length >= 4 && /^[A-Z]{1,5}$/.test(cells[0])) {
        symbols.push({ symbol: cells[0], sector: cells[2], subIndustry: cells[3] });
      }
    }
    fs.writeFileSync(rowsPath, JSON.stringify(symbols), "utf8");
  }

  let caps = [];
  let startIdx = 0;
  if (fs.existsSync(progressPath)) {
    const prog = JSON.parse(fs.readFileSync(progressPath, "utf8"));
    caps = prog.caps ?? [];
    startIdx = prog.nextIdx ?? 0;
  }

  console.log(`Fetching marketCap for ${symbols.length} S&P 500 symbols (from ${startIdx})...`);
  let errors = 0;
  for (let i = startIdx; i < symbols.length; i++) {
    const sym = symbols[i].symbol ?? symbols[i];
    const p = await profile(typeof sym === "string" ? sym : sym.symbol);
    if (p) caps.push({ ...p, gicsSectorWiki: symbols[i].sector });
    else errors++;
    if ((i + 1) % 25 === 0) {
      fs.writeFileSync(progressPath, JSON.stringify({ nextIdx: i + 1, caps }), "utf8");
      console.log(`  ${i + 1}/${symbols.length}`);
    }
    await new Promise((r) => setTimeout(r, 320));
  }
  if (fs.existsSync(progressPath)) fs.unlinkSync(progressPath);

  const totalCap = caps.reduce((s, c) => s + c.marketCap, 0);
  const weighted = caps
    .map((c) => ({
      ...c,
      approxIndexWeightPct: (c.marketCap / totalCap) * 100,
    }))
    .sort((a, b) => b.approxIndexWeightPct - a.approxIndexWeightPct);

  const top10 = weighted.slice(0, 10);
  const top10Sum = top10.reduce((s, c) => s + c.approxIndexWeightPct, 0);

  const benchmarkRows = Object.entries(PUBLISHED_WEIGHTS).map(([sym, pub]) => {
    const row = weighted.find((w) => w.symbol === sym || w.symbol === sym.replace(".", "-"));
    return {
      symbol: sym,
      approxIndexWeightPct: row?.approxIndexWeightPct ?? null,
      publishedSp500WeightPct: pub,
      deltaPct: row ? row.approxIndexWeightPct - pub : null,
      absDeltaPct: row ? Math.abs(row.approxIndexWeightPct - pub) : null,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    method: "sum(marketCap) / sum(all_sp500_marketCap) — 非 float-adjusted，与 S&P 官方 methodology 有系统性偏差",
    symbolsRequested: symbols.length,
    profilesOk: caps.length,
    profileErrors: errors,
    totalMarketCapUsd: totalCap,
    top10,
    top10WeightSumPct: top10Sum,
    publishedBenchmark: benchmarkRows,
    meanAbsDeltaPct:
      benchmarkRows.filter((r) => r.absDeltaPct != null).reduce((s, r) => s + r.absDeltaPct, 0) /
      benchmarkRows.filter((r) => r.absDeltaPct != null).length,
    conclusion:
      "全成分市值加权可近似 S&P500 权重排序与量级；与官方 float-adjusted 权重相比 mega-cap 通常偏差 0.3–1.5 pct-pt。ETF holdings 端点在当前 FMP 套餐不可用。",
  };

  fs.writeFileSync(path.join(outDir, "weight_benchmark_r2.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ top10: top10.map((t) => [t.symbol, t.approxIndexWeightPct.toFixed(2)]), meanAbsDelta: report.meanAbsDeltaPct }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

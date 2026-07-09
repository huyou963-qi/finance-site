/** Mega-cap weight sample for R2 (slow rate to avoid FMP limits). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "scripts/data/research/us-equity-industry");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
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

const SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "BRK-B", "TSLA",
  "AVGO", "JPM", "LLY", "UNH", "XOM", "JNJ", "WMT", "MA", "V", "PG", "HD",
];

const PUBLISHED = {
  AAPL: 7.0,
  MSFT: 7.1,
  NVDA: 6.8,
  AMZN: 3.8,
  GOOGL: 2.1,
  META: 2.3,
  "BRK-B": 1.7,
  TSLA: 1.5,
  AVGO: 1.4,
  JPM: 1.2,
};

async function main() {
  const caps = [];
  for (const sym of SYMBOLS) {
    const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${FMP_KEY}`;
    const res = await fetch(url);
    const body = await res.json();
    const p = Array.isArray(body) ? body[0] : null;
    caps.push(
      p?.marketCap
        ? { symbol: sym, marketCap: Number(p.marketCap), sector: p.sector, industry: p.industry, ok: true }
        : { symbol: sym, ok: false, status: res.status },
    );
    await new Promise((r) => setTimeout(r, 850));
  }

  const ok = caps.filter((c) => c.marketCap);
  const total = ok.reduce((s, c) => s + c.marketCap, 0);
  const rows = ok
    .map((c) => ({ ...c, sampleWeightPct: (c.marketCap / total) * 100 }))
    .sort((a, b) => b.sampleWeightPct - a.sampleWeightPct);

  const publishedReference = Object.entries(PUBLISHED).map(([symbol, publishedSp500WeightPct]) => {
    const row = rows.find((r) => r.symbol === symbol);
    return {
      symbol,
      sampleWeightPct: row?.sampleWeightPct ?? null,
      publishedSp500WeightPct,
      note: "sampleWeightPct 为 mega-cap 子集内占比；published 为 S&P500 官方近似权重（2024-06）",
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    method: "Top-20 mega-cap FMP profile marketCap share within sample (NOT full S&P 500 index weight)",
    profilesOk: ok.length,
    totalSampleCapUsd: total,
    rows,
    publishedReference,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "weight_benchmark_mega_sample.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ top5: rows.slice(0, 5).map((r) => [r.symbol, r.sampleWeightPct.toFixed(2)]) }, null, 2));
}

main();

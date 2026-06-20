/**
 * One-off research sampler for us-equity-bars data source report.
 * Usage: node scripts/research/fetch-equity-source-samples.mjs
 * Reads FMP_API_KEY / TIINGO_API_TOKEN from .env.local via dotenv-cli or manual export.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");
const outDir = path.join(root, "scripts/data/research");

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
const TIINGO = process.env.TIINGO_API_TOKEN?.trim() ?? "";

const WINDOWS = [
  { label: "aapl-split-2020", symbol: "AAPL", from: "2020-08-27", to: "2020-09-02" },
  { label: "nvda-split-2024", symbol: "NVDA", from: "2024-06-07", to: "2024-06-11" },
  { label: "aapl-div-2024", symbol: "AAPL", from: "2024-11-07", to: "2024-11-12" },
];

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, url: url.replace(FMP_KEY, "REDACTED").replace(TIINGO, "REDACTED"), body };
}

async function tiingoPrices(symbol, startDate, endDate) {
  if (!TIINGO) return { error: "TIINGO_API_TOKEN not set" };
  const url = `https://api.tiingo.com/tiingo/daily/${symbol}/prices?startDate=${startDate}&endDate=${endDate}&token=${TIINGO}`;
  return fetchJson(url, { "Content-Type": "application/json" });
}

async function fmpUnadj(symbol, from, to) {
  if (!FMP_KEY) return { error: "FMP_API_KEY not set" };
  const qs = new URLSearchParams({ symbol, from, to, apikey: FMP_KEY });
  return fetchJson(
    `https://financialmodelingprep.com/stable/historical-price-eod/non-split-adjusted?${qs}`,
  );
}

async function fmpFull(symbol, from, to) {
  if (!FMP_KEY) return { error: "FMP_API_KEY not set" };
  const qs = new URLSearchParams({ symbol, from, to, apikey: FMP_KEY });
  return fetchJson(
    `https://financialmodelingprep.com/stable/historical-price-eod/full?${qs}`,
  );
}

async function fmpSplits(symbol) {
  if (!FMP_KEY) return { error: "FMP_API_KEY not set" };
  const qs = new URLSearchParams({ symbol, apikey: FMP_KEY });
  return fetchJson(`https://financialmodelingprep.com/stable/splits?${qs}`);
}

async function fmpDividends(symbol) {
  if (!FMP_KEY) return { error: "FMP_API_KEY not set" };
  const qs = new URLSearchParams({ symbol, apikey: FMP_KEY });
  return fetchJson(`https://financialmodelingprep.com/stable/dividends?${qs}`);
}

function pickBars(arr, keys) {
  if (!Array.isArray(arr)) return arr;
  return arr.map((row) => {
    const o = {};
    for (const k of keys) if (row[k] != null) o[k] = row[k];
    return o;
  });
}

function summarizeSplitWindow(label, tiingo, fmpUn, fmpFull) {
  const rows = [];
  const tiBars = Array.isArray(tiingo?.body) ? tiingo.body : [];
  for (const b of tiBars) {
    rows.push({
      date: b.date?.slice?.(0, 10) ?? b.date,
      tiingo_close: b.close,
      tiingo_adjClose: b.adjClose,
      tiingo_splitFactor: b.splitFactor,
      tiingo_divCash: b.divCash,
    });
  }
  const fu = Array.isArray(fmpUn?.body)
    ? fmpUn.body
    : (fmpUn?.body?.historical ?? []);
  const ff = Array.isArray(fmpFull?.body)
    ? fmpFull.body
    : (fmpFull?.body?.historical ?? []);
  const fuMap = new Map(
    (Array.isArray(fu) ? fu : []).map((r) => [r.date, r]),
  );
  const ffMap = new Map(
    (Array.isArray(ff) ? ff : []).map((r) => [r.date, r]),
  );
  for (const r of rows) {
    const u = fuMap.get(r.date);
    const f = ffMap.get(r.date);
    if (u) {
      r.fmp_unadj_close = u.adjClose ?? u.close;
      r.fmp_unadj_open = u.adjOpen ?? u.open;
    }
    if (f) {
      r.fmp_full_close = f.close;
      r.fmp_full_adjClose = f.adjClose;
    }
    if (r.tiingo_close && r.tiingo_adjClose) {
      r.adj_over_raw = +(r.tiingo_adjClose / r.tiingo_close).toFixed(6);
    }
  }
  return { label, rows };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    env: {
      hasFmp: Boolean(FMP_KEY),
      hasTiingo: Boolean(TIINGO),
    },
    windows: [],
    fmpCorporate: {},
    errors: [],
  };

  for (const w of WINDOWS) {
    const [ti, fu, ff] = await Promise.all([
      tiingoPrices(w.symbol, w.from, w.to),
      fmpUnadj(w.symbol, w.from, w.to),
      fmpFull(w.symbol, w.from, w.to),
    ]);
    if (!ti.ok && ti.error !== "TIINGO_API_TOKEN not set")
      report.errors.push({ source: "tiingo", window: w.label, status: ti.status, body: ti.body });
    if (!fu.ok) report.errors.push({ source: "fmp-unadj", window: w.label, status: fu.status, body: fu.body });
    if (!ff.ok) report.errors.push({ source: "fmp-full", window: w.label, status: ff.status, body: ff.body });

    const summary = summarizeSplitWindow(w.label, ti, fu, ff);
    report.windows.push(summary);

    if (ti.ok && Array.isArray(ti.body)) {
      fs.writeFileSync(
        path.join(outDir, `tiingo-${w.label}.json`),
        JSON.stringify(
          pickBars(ti.body, [
            "date",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "adjClose",
            "splitFactor",
            "divCash",
          ]),
          null,
          2,
        ),
      );
    }
    if (fu.ok) {
      const hist = fu.body?.historical ?? fu.body;
      fs.writeFileSync(
        path.join(outDir, `fmp-unadj-${w.label}.json`),
        JSON.stringify(
          Array.isArray(hist)
            ? pickBars(hist, [
                "date",
                "adjOpen",
                "adjHigh",
                "adjLow",
                "adjClose",
                "volume",
              ])
            : fu.body,
          null,
          2,
        ),
      );
    }
    if (ff.ok) {
      const hist = ff.body?.historical ?? ff.body;
      fs.writeFileSync(
        path.join(outDir, `fmp-full-${w.label}.json`),
        JSON.stringify(
          Array.isArray(hist)
            ? pickBars(hist, ["date", "open", "high", "low", "close", "adjClose", "volume"])
            : ff.body,
          null,
          2,
        ),
      );
    }
  }

  for (const sym of ["AAPL", "NVDA"]) {
    const [sp, div] = await Promise.all([fmpSplits(sym), fmpDividends(sym)]);
    report.fmpCorporate[sym] = {
      splits: sp.ok
        ? (Array.isArray(sp.body) ? sp.body.slice(0, 8) : sp.body)
        : { error: sp.status, body: sp.body },
      dividends: div.ok
        ? (Array.isArray(div.body) ? div.body.slice(0, 5) : div.body)
        : { error: div.status, body: div.body },
    };
  }

  fs.writeFileSync(
    path.join(outDir, "research-summary.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

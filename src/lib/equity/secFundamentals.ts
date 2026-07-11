/**
 * SEC EDGAR XBRL companyfacts → 营收/EPS/利润率（免密钥）。
 * https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 */

export type SecFundamentalSnapshot = {
  period: string;
  asOf: string;
  revenue: number | null;
  revenueYoY: number | null;
  eps: number | null;
  epsYoY: number | null;
  grossMargin: number | null;
  opMargin: number | null;
};

type SecFactPoint = {
  end?: string;
  val?: number;
  form?: string;
  fp?: string;
  filed?: string;
  frame?: string;
};

type SecConcept = {
  units?: Record<string, SecFactPoint[]>;
};

const SEC_UA = "finance-site equity-fundamentals contact@localhost";

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function yoy(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return curr / prev - 1;
}

function pickUnitPoints(concept: SecConcept | undefined, unitKeys: string[]): SecFactPoint[] {
  if (!concept?.units) return [];
  for (const u of unitKeys) {
    const pts = concept.units[u];
    if (Array.isArray(pts) && pts.length) return pts;
  }
  // 任意单位兜底
  for (const pts of Object.values(concept.units)) {
    if (Array.isArray(pts) && pts.length) return pts;
  }
  return [];
}

function latestAnnual(points: SecFactPoint[]): SecFactPoint | null {
  const annual = points
    .filter((p) => p.form === "10-K" || p.fp === "FY")
    .filter((p) => typeof p.end === "string" && typeof p.val === "number")
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  return annual[0] ?? null;
}

function priorAnnual(points: SecFactPoint[], latestEnd: string): SecFactPoint | null {
  const annual = points
    .filter((p) => p.form === "10-K" || p.fp === "FY")
    .filter((p) => typeof p.end === "string" && typeof p.val === "number")
    .filter((p) => String(p.end) < latestEnd)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)));
  return annual[0] ?? null;
}

function periodFromEnd(end: string): string {
  const y = end.slice(0, 4);
  return `${y}FY`;
}

function firstConcept(
  gaap: Record<string, SecConcept>,
  names: string[],
): SecConcept | undefined {
  for (const n of names) {
    if (gaap[n]) return gaap[n];
  }
  return undefined;
}

export async function fetchSecCompanyFacts(cik: string): Promise<unknown> {
  const padded = padCik(cik);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": SEC_UA,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`SEC companyfacts CIK${padded} HTTP ${res.status}`);
  }
  return res.json();
}

/** 从 companyfacts 提取最近两个财年，算 YoY 与利润率 */
export function extractAnnualFundamentals(facts: unknown): SecFundamentalSnapshot | null {
  if (!facts || typeof facts !== "object") return null;
  const gaap = (facts as { facts?: { "us-gaap"?: Record<string, SecConcept> } }).facts?.[
    "us-gaap"
  ];
  if (!gaap) return null;

  const revenueConcept = firstConcept(gaap, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "Revenues",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ]);
  const epsConcept = firstConcept(gaap, ["EarningsPerShareDiluted", "EarningsPerShareBasic"]);
  const grossConcept = firstConcept(gaap, ["GrossProfit"]);
  const opConcept = firstConcept(gaap, ["OperatingIncomeLoss"]);

  const revenuePts = pickUnitPoints(revenueConcept, ["USD"]);
  const epsPts = pickUnitPoints(epsConcept, ["USD/shares", "pure"]);
  const grossPts = pickUnitPoints(grossConcept, ["USD"]);
  const opPts = pickUnitPoints(opConcept, ["USD"]);

  const revLatest = latestAnnual(revenuePts);
  if (!revLatest?.end || revLatest.val == null) return null;
  const revPrior = priorAnnual(revenuePts, revLatest.end);

  const epsLatest = latestAnnual(epsPts);
  const epsPrior = epsLatest?.end ? priorAnnual(epsPts, epsLatest.end) : null;

  const grossLatest = latestAnnual(grossPts);
  const opLatest = latestAnnual(opPts);

  const revenue = revLatest.val;
  const gross = grossLatest?.end === revLatest.end ? grossLatest.val ?? null : grossLatest?.val ?? null;
  const op = opLatest?.end === revLatest.end ? opLatest.val ?? null : opLatest?.val ?? null;

  return {
    period: periodFromEnd(revLatest.end),
    asOf: revLatest.end,
    revenue,
    revenueYoY: yoy(revenue, revPrior?.val ?? null),
    eps: epsLatest?.val ?? null,
    epsYoY: yoy(epsLatest?.val ?? null, epsPrior?.val ?? null),
    grossMargin: revenue && gross != null ? gross / revenue : null,
    opMargin: revenue && op != null ? op / revenue : null,
  };
}

/** SEC 全市场 ticker → CIK（约 1 次请求，可缓存） */
export async function fetchSecTickerCikMap(): Promise<Map<string, string>> {
  const url = "https://www.sec.gov/files/company_tickers.json";
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC tickers HTTP ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    { cik_str?: number | string; ticker?: string }
  >;
  const map = new Map<string, string>();
  for (const row of Object.values(json)) {
    const ticker = row.ticker?.trim().toUpperCase();
    if (!ticker || row.cik_str == null) continue;
    map.set(ticker, padCik(String(row.cik_str)));
  }
  return map;
}

export async function fetchYahooLastClose(symbol: string): Promise<number | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=5d`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; finance-site/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const px = result?.meta?.regularMarketPrice;
    if (typeof px === "number" && Number.isFinite(px)) return px;
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c)) return c;
    }
    return null;
  } catch {
    return null;
  }
}

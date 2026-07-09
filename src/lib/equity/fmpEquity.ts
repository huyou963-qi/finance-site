/**
 * FMP equity helpers（profile / sector performance / statements）。
 * 密钥仅服务端使用。
 */

const FMP_BASE = "https://financialmodelingprep.com/stable";

function fmpKey(): string {
  const key = process.env.FMP_API_KEY?.trim();
  if (!key) throw new Error("未配置 FMP_API_KEY");
  return key;
}

export function fmpQuarterlyLimit(): number {
  const raw = Number(process.env.FMP_QUARTERLY_LIMIT ?? 5);
  if (!Number.isFinite(raw) || raw < 1) return 5;
  return Math.min(5, Math.floor(raw));
}

async function fmpGetJson(endpoint: string, label: string): Promise<unknown> {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${FMP_BASE}${endpoint}${sep}apikey=${fmpKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`FMP ${label} 失败：HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`FMP ${label} 返回非 JSON：${text.slice(0, 120)}`);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type FmpProfile = {
  symbol: string;
  companyName?: string;
  cik?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  website?: string;
  irUrl?: string;
};

export async function fetchFmpProfile(symbol: string): Promise<FmpProfile | null> {
  const json = await fmpGetJson(`/profile?symbol=${encodeURIComponent(symbol)}`, "profile");
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const sym = typeof r.symbol === "string" ? r.symbol.trim().toUpperCase() : symbol;
  return {
    symbol: sym,
    companyName: typeof r.companyName === "string" ? r.companyName : undefined,
    cik: typeof r.cik === "string" ? r.cik.replace(/^0+/, "") || r.cik : undefined,
    sector: typeof r.sector === "string" ? r.sector : undefined,
    industry: typeof r.industry === "string" ? r.industry : undefined,
    marketCap: num(r.marketCap) ?? undefined,
    website: typeof r.website === "string" ? r.website : undefined,
    irUrl:
      (typeof r.investorRelationsPage === "string" ? r.investorRelationsPage : undefined) ??
      (typeof r.website === "string" ? r.website : undefined),
  };
}

export type FmpSectorPerfPoint = {
  date: string;
  sector: string;
  averageChange: number;
};

export async function fetchFmpSectorPerformance(opts: {
  sector: string;
  from?: string;
  to?: string;
}): Promise<FmpSectorPerfPoint[]> {
  const q = new URLSearchParams();
  q.set("sector", opts.sector);
  if (opts.from) q.set("from", opts.from);
  if (opts.to) q.set("to", opts.to);
  const json = await fmpGetJson(
    `/historical-sector-performance?${q.toString()}`,
    "historical-sector-performance",
  );
  if (!Array.isArray(json)) return [];
  const out: FmpSectorPerfPoint[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const date = typeof r.date === "string" ? r.date.slice(0, 10) : "";
    const sector = typeof r.sector === "string" ? r.sector : opts.sector;
    const averageChange = num(r.averageChange);
    if (!date || averageChange == null) continue;
    out.push({ date, sector, averageChange });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type FmpIncomeRow = {
  date: string;
  revenue: number | null;
  eps: number | null;
  grossProfitRatio: number | null;
  operatingIncomeRatio: number | null;
};

export async function fetchFmpIncomeStatement(
  symbol: string,
  limit = fmpQuarterlyLimit(),
): Promise<FmpIncomeRow[]> {
  const json = await fmpGetJson(
    `/income-statement?symbol=${encodeURIComponent(symbol)}&period=quarter&limit=${limit}`,
    "income-statement",
  );
  if (!Array.isArray(json)) return [];
  const out: FmpIncomeRow[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date ?? r.fillingDate;
    if (typeof dateRaw !== "string") continue;
    const date = dateRaw.slice(0, 10);
    out.push({
      date,
      revenue: num(r.revenue),
      eps: num(r.epsdiluted) ?? num(r.eps),
      grossProfitRatio: num(r.grossProfitRatio),
      operatingIncomeRatio: num(r.operatingIncomeRatio),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type FmpRatioRow = {
  date: string;
  pe: number | null;
};

export async function fetchFmpRatios(
  symbol: string,
  limit = fmpQuarterlyLimit(),
): Promise<FmpRatioRow[]> {
  const json = await fmpGetJson(
    `/ratios?symbol=${encodeURIComponent(symbol)}&period=quarter&limit=${limit}`,
    "ratios",
  );
  if (!Array.isArray(json)) return [];
  const out: FmpRatioRow[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date;
    if (typeof dateRaw !== "string") continue;
    out.push({
      date: dateRaw.slice(0, 10),
      pe:
        num(r.priceToEarningsRatio) ??
        num(r.peRatio) ??
        num(r.priceEarningsRatio),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 从季度日期推 period 标签，如 2024Q3 */
export function periodLabelFromDate(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return date.slice(0, 7);
  const q = Math.ceil(m / 3);
  return `${y}Q${q}`;
}

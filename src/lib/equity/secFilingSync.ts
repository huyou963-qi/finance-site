import { prisma } from "@/lib/prisma";

export const SEC_FINANCIAL_FORMS = new Set(["10-Q", "10-K", "10-Q/A", "10-K/A"]);
const SEC_EVENT_FORMS = new Set(["8-K", "8-K/A", ...SEC_FINANCIAL_FORMS]);

export type SecFilingSyncOptions = {
  symbols?: readonly string[];
  limit?: number;
  lookbackDays?: number;
  delayMs?: number;
  gicsOnly?: boolean;
};

export type SecFilingSyncResult = {
  symbols: number;
  upserted: number;
  failed: number;
  financialSymbols: string[];
};

type SecRecentFilings = {
  accessionNumber?: string[];
  form?: string[];
  filingDate?: string[];
  items?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padCik(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

function filingUrl(cik: string, accession: string, primaryDocument: string | null): string {
  const noDash = accession.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${noDash}`;
  return primaryDocument ? `${base}/${primaryDocument}` : `${base}/${accession}-index.htm`;
}

/**
 * 统一的 SEC submissions 增量入口。事件页与周度财报同步共同复用此 writer，
 * 不另建 filings 表或平行抓取器。
 */
export async function syncSecFilings(options: SecFilingSyncOptions = {}): Promise<SecFilingSyncResult> {
  const symbols = options.symbols?.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) ?? [];
  const cutoff = Date.now() - Math.max(1, options.lookbackDays ?? 30) * 86_400_000;
  const delayMs = Math.max(120, options.delayMs ?? 250);
  const securities = await prisma.equitySecurity.findMany({
    where: {
      cik: { not: null },
      ...(symbols.length ? { symbol: { in: symbols } } : {}),
      ...(options.gicsOnly ? { gicsSector: { not: null } } : {}),
    },
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    ...(options.limit ? { take: Math.max(1, options.limit) } : {}),
    select: { symbol: true, cik: true },
  });

  let upserted = 0;
  let failed = 0;
  const financialSymbols = new Set<string>();
  for (const [index, security] of securities.entries()) {
    const cik = security.cik!;
    const padded = padCik(cik);
    try {
      const response = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, {
        headers: {
          "User-Agent": process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-sync-sec admin@hblook.com",
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { filings?: { recent?: SecRecentFilings } };
      const recent = payload.filings?.recent;
      const accessions = recent?.accessionNumber ?? [];
      const forms = recent?.form ?? [];
      const dates = recent?.filingDate ?? [];
      const items = recent?.items ?? [];
      const primaryDocuments = recent?.primaryDocument ?? [];
      const descriptions = recent?.primaryDocDescription ?? [];
      const count = Math.min(accessions.length, forms.length, dates.length);

      for (let filingIndex = 0; filingIndex < count; filingIndex += 1) {
        const form = forms[filingIndex]!;
        if (!SEC_EVENT_FORMS.has(form)) continue;
        const filed = dates[filingIndex]!;
        const filedMs = Date.parse(`${filed}T00:00:00Z`);
        if (!Number.isFinite(filedMs) || filedMs < cutoff) continue;
        const accession = accessions[filingIndex]!;
        const primaryDocument = primaryDocuments[filingIndex]?.trim().slice(0, 256) || null;
        await prisma.secFiling.upsert({
          where: { cik_accession: { cik: padded, accession } },
          create: {
            cik: padded,
            symbol: security.symbol,
            accession,
            form,
            filedAt: new Date(`${filed}T00:00:00.000Z`),
            url: filingUrl(cik, accession, primaryDocument),
            items: items[filingIndex]?.trim().slice(0, 64) || null,
            primaryDocument,
            primaryDocDescription: descriptions[filingIndex]?.trim().slice(0, 256) || null,
          },
          update: {
            symbol: security.symbol,
            form,
            filedAt: new Date(`${filed}T00:00:00.000Z`),
            url: filingUrl(cik, accession, primaryDocument),
            items: items[filingIndex]?.trim().slice(0, 64) || null,
            primaryDocument,
            primaryDocDescription: descriptions[filingIndex]?.trim().slice(0, 256) || null,
          },
        });
        upserted += 1;
        if (SEC_FINANCIAL_FORMS.has(form)) financialSymbols.add(security.symbol);
      }
      console.log(`[SEC submissions ${index + 1}/${securities.length}] ${security.symbol}`);
    } catch (error) {
      failed += 1;
      console.warn(`SEC submissions ${security.symbol}:`, error instanceof Error ? error.message : error);
    }
    await sleep(delayMs);
  }

  return {
    symbols: securities.length,
    upserted,
    failed,
    financialSymbols: [...financialSymbols].sort(),
  };
}

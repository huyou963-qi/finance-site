import { prisma } from "@/lib/prisma";
import { discoverSecFilings, secDocumentUrl, type SecIndexRow } from "./secEdgar";

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

export async function writeSecFilingIndex(cik: string, symbol: string, row: SecIndexRow) {
  const data = { symbol, form: row.form, filedAt: new Date(`${row.filedAt}T00:00:00Z`),
    url: secDocumentUrl(cik, row.accession, row.primaryDocument), items: row.items,
    primaryDocument: row.primaryDocument, primaryDocDescription: row.description };
  return prisma.secFiling.upsert({ where: { cik_accession: { cik, accession: row.accession } },
    create: { cik, accession: row.accession, ...data }, update: data });
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
    const padded = cik.replace(/\D/g, "").padStart(10, "0");
    try {
      const rows = await discoverSecFilings(padded, new Date(cutoff).toISOString().slice(0, 10));
      for (const row of rows) {
        if (!SEC_EVENT_FORMS.has(row.form)) continue;
        await writeSecFilingIndex(padded, security.symbol, row);
        upserted += 1;
        if (SEC_FINANCIAL_FORMS.has(row.form)) financialSymbols.add(security.symbol);
      }
      console.log(`[SEC submissions ${index + 1}/${securities.length}] ${security.symbol}`);
    } catch (error) {
      failed += 1;
      console.warn(`SEC submissions ${security.symbol}:`, error instanceof Error ? error.message : error);
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return {
    symbols: securities.length,
    upserted,
    failed,
    financialSymbols: [...financialSymbols].sort(),
  };
}

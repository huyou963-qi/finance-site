/**
 * SEC EDGAR submissions 增量同步（8-K / 10-Q / 10-K）。
 * Usage: npm run equity:sync-sec -- --limit=50
 */
import { prisma } from "../../src/lib/prisma";

const FORMS = new Set(["8-K", "10-Q", "10-K", "8-K/A", "10-Q/A", "10-K/A"]);

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function padCik(cik: string): string {
  const digits = cik.replace(/\D/g, "");
  return digits.padStart(10, "0");
}

function accessionToUrl(cik: string, accession: string): string {
  const noDash = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${noDash}/${accession}-index.htm`;
}

async function main() {
  const limit = Math.max(1, Number(argValue("--limit") ?? 50) || 50);
  const delayMs = Math.max(200, Number(argValue("--delay-ms") ?? 250) || 250);
  const lookbackDays = Math.max(30, Number(argValue("--days") ?? 400) || 400);
  const cutoff = Date.now() - lookbackDays * 86400_000;

  const securities = await prisma.equitySecurity.findMany({
    where: { cik: { not: null } },
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    take: limit,
    select: { symbol: true, cik: true },
  });

  let upserted = 0;
  let fail = 0;

  for (const row of securities) {
    const cik = row.cik!;
    const padded = padCik(cik);
    try {
      const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
      const res = await fetch(url, {
        headers: {
          // SEC 公平访问要求真实域名联系邮箱（@localhost 会被 403）；可用 SEC_USER_AGENT 覆盖
          "User-Agent":
            process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-sync-sec admin@hblook.com",
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        filings?: {
          recent?: {
            accessionNumber?: string[];
            form?: string[];
            filingDate?: string[];
          };
        };
      };
      const recent = data.filings?.recent;
      const accessions = recent?.accessionNumber ?? [];
      const forms = recent?.form ?? [];
      const dates = recent?.filingDate ?? [];
      const n = Math.min(accessions.length, forms.length, dates.length);

      for (let i = 0; i < n; i++) {
        const form = forms[i]!;
        if (!FORMS.has(form)) continue;
        const filed = dates[i]!;
        const filedMs = Date.parse(`${filed}T00:00:00Z`);
        if (!Number.isFinite(filedMs) || filedMs < cutoff) continue;
        const accession = accessions[i]!;
        await prisma.secFiling.upsert({
          where: { cik_accession: { cik: padded, accession } },
          create: {
            cik: padded,
            symbol: row.symbol,
            accession,
            form,
            filedAt: new Date(`${filed}T00:00:00.000Z`),
            url: accessionToUrl(cik, accession),
          },
          update: {
            symbol: row.symbol,
            form,
            filedAt: new Date(`${filed}T00:00:00.000Z`),
            url: accessionToUrl(cik, accession),
          },
        });
        upserted += 1;
      }
      console.log(`ok ${row.symbol} CIK${padded}`);
    } catch (e) {
      fail += 1;
      console.warn(`fail ${row.symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(JSON.stringify({ symbols: securities.length, upserted, fail }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { prisma } from "@/lib/prisma";
import {
  extractQuarterlyFundamentals,
  type SecFactPoint,
  type SecQuarterlyFundamentals,
} from "@/lib/equity/secFundamentals";

export type SecPeriodicFiling = {
  accession: string;
  form: string;
  filedAt: string;
};

export type SecFundamentalVintage = SecQuarterlyFundamentals &
  SecPeriodicFiling & {
    checkpoint: boolean;
  };

type SecConceptShape = { units?: Record<string, SecFactPoint[]> };
type CompanyFactsShape = {
  facts?: Record<string, Record<string, SecConceptShape>>;
  [key: string]: unknown;
};

const SNAPSHOT_FIELDS: readonly (keyof SecQuarterlyFundamentals)[] = [
  "period",
  "fiscalDate",
  "fiscalQuarter",
  "revenue",
  "revenueYoY",
  "grossMargin",
  "opMargin",
  "netIncome",
  "eps",
  "epsYoY",
  "ocf",
  "capex",
  "dividendsPaid",
  "totalAssets",
  "totalLiabilities",
  "equity",
  "longTermDebt",
  "cash",
  "sharesOutstanding",
  "firstReportedAt",
];

function periodicForm(form: string | undefined): boolean {
  return Boolean(form && (form.startsWith("10-Q") || form.startsWith("10-K")));
}

function companyFactsShape(value: unknown): CompanyFactsShape | null {
  if (!value || typeof value !== "object") return null;
  const shape = value as CompanyFactsShape;
  return shape.facts && typeof shape.facts === "object" ? shape : null;
}

/** Company Facts 中 accn 是严格版本主键；缺 accn/filed 的点不会被偷偷纳入。 */
export function listSecPeriodicFilings(facts: unknown): SecPeriodicFiling[] {
  const shape = companyFactsShape(facts);
  if (!shape) return [];
  const byAccession = new Map<string, SecPeriodicFiling>();
  for (const namespace of Object.values(shape.facts ?? {})) {
    for (const concept of Object.values(namespace ?? {})) {
      for (const points of Object.values(concept.units ?? {})) {
        for (const point of points ?? []) {
          if (!point.accn || !point.filed || !periodicForm(point.form)) continue;
          const existing = byAccession.get(point.accn);
          const filing = {
            accession: point.accn,
            form: point.form!,
            filedAt: point.filed,
          };
          if (!existing || `${filing.filedAt}|${filing.form}` < `${existing.filedAt}|${existing.form}`) {
            byAccession.set(point.accn, filing);
          }
        }
      }
    }
  }
  return [...byAccession.values()].sort(
    (left, right) =>
      left.filedAt.localeCompare(right.filedAt) || left.accession.localeCompare(right.accession),
  );
}

function sameSnapshot(
  left: SecQuarterlyFundamentals | undefined,
  right: SecQuarterlyFundamentals,
): boolean {
  if (!left) return false;
  return SNAPSHOT_FIELDS.every((field) => Object.is(left[field], right[field]));
}

/**
 * 逐 accession 回放 Company Facts，再调用与生产快照完全相同的标准化器。
 * emitLastFilings 只控制落库窗口；窗口第一份 filing 会写完整 checkpoint，后续只写变化季度。
 */
export function buildSecFundamentalVintages(
  facts: unknown,
  opts: { maxQuarters?: number; emitLastFilings?: number } = {},
): SecFundamentalVintage[] {
  const shape = companyFactsShape(facts);
  if (!shape) return [];
  const filings = listSecPeriodicFilings(facts);
  if (!filings.length) return [];

  const progressive: CompanyFactsShape = { ...shape, facts: {} };
  const pointsByAccession = new Map<string, Array<{ target: SecFactPoint[]; point: SecFactPoint }>>();
  for (const [namespaceName, namespace] of Object.entries(shape.facts ?? {})) {
    const targetNamespace: Record<string, SecConceptShape> = {};
    progressive.facts![namespaceName] = targetNamespace;
    for (const [conceptName, concept] of Object.entries(namespace ?? {})) {
      const targetConcept: SecConceptShape = { units: {} };
      targetNamespace[conceptName] = targetConcept;
      for (const [unit, points] of Object.entries(concept.units ?? {})) {
        const target: SecFactPoint[] = [];
        targetConcept.units![unit] = target;
        for (const point of points ?? []) {
          if (!point.accn || !point.filed || !periodicForm(point.form)) continue;
          const list = pointsByAccession.get(point.accn) ?? [];
          list.push({ target, point });
          pointsByAccession.set(point.accn, list);
        }
      }
    }
  }

  const emitCount = Math.max(1, opts.emitLastFilings ?? filings.length);
  const emitFrom = Math.max(0, filings.length - emitCount);
  let previous = new Map<string, SecQuarterlyFundamentals>();
  const vintages: SecFundamentalVintage[] = [];

  filings.forEach((filing, filingIndex) => {
    for (const item of pointsByAccession.get(filing.accession) ?? []) {
      item.target.push(item.point);
    }
    const rows = extractQuarterlyFundamentals(progressive, {
      maxQuarters: opts.maxQuarters ?? 80,
    });
    const current = new Map(rows.map((row) => [row.period, row]));
    if (filingIndex >= emitFrom) {
      const checkpoint = filingIndex === emitFrom;
      for (const row of rows) {
        if (!checkpoint && sameSnapshot(previous.get(row.period), row)) continue;
        vintages.push({ ...row, ...filing, checkpoint });
      }
    }
    previous = current;
  });
  return vintages;
}

function date(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function upsertFundamentalVintages(
  symbolRaw: string,
  rows: readonly SecFundamentalVintage[],
): Promise<number> {
  const symbol = symbolRaw.trim().toUpperCase();
  for (const row of rows) {
    const data = {
      periodType: "Q",
      form: row.form,
      filedAt: date(row.filedAt)!,
      isAmendment: row.form.endsWith("/A"),
      fiscalDate: date(row.fiscalDate),
      fiscalQuarter: row.fiscalQuarter,
      revenue: row.revenue,
      revenueYoY: row.revenueYoY,
      eps: row.eps,
      epsYoY: row.epsYoY,
      grossMargin: row.grossMargin,
      opMargin: row.opMargin,
      netIncome: row.netIncome,
      ocf: row.ocf,
      capex: row.capex,
      totalAssets: row.totalAssets,
      totalLiabilities: row.totalLiabilities,
      equity: row.equity,
      longTermDebt: row.longTermDebt,
      cash: row.cash,
      sharesOutstanding: row.sharesOutstanding,
      dividendsPaid: row.dividendsPaid,
      firstReportedAt: date(row.firstReportedAt),
      source: "sec-companyfacts",
      metadata: { checkpoint: row.checkpoint, extractor: "quarterly-v2" },
    };
    await prisma.equityFundamentalVintage.upsert({
      where: {
        symbol_period_accession: { symbol, period: row.period, accession: row.accession },
      },
      create: { symbol, period: row.period, accession: row.accession, ...data },
      update: data,
    });
  }
  return rows.length;
}

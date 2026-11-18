import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { readReleaseAttachments } from "./stockDisclosures";
import { buildGuidanceSeries, buildGuidanceDeliveries, extractManagementGuidance, type GuidanceActual, type GuidanceDelivery, type GuidanceSeries, type GuidanceVersion } from "./managementGuidance";

export type ManagementGuidancePayload = {
  series: GuidanceSeries[]; delivery: GuidanceDelivery[]; asOf: string;
  coverage: { announcements: number; withAttachments: number; truncated: boolean };
};
/** Read only. Legacy announcements are projected using the same parser, with no per-visit network or writes. */
export async function loadManagementGuidance(symbol: string, cik: string | null): Promise<ManagementGuidancePayload> {
  const now = new Date();
  const identity = cik ? { cik: cik.replace(/\D/g, "").padStart(10, "0") } : { symbol };
  const filings = await prisma.secFiling.findMany({
    where: { ...identity, form: { in: ["8-K", "8-K/A", "6-K", "6-K/A"] }, filedAt: { lte: now }, earningsRelease: { not: Prisma.DbNull } },
    orderBy: [{ filedAt: "desc" }, { accession: "desc" }], take: 201,
    select: { accession: true, filedAt: true, publishedOn: true, earningsRelease: true },
  });
  const versions: GuidanceVersion[] = [];
  let withAttachments = 0;
  for (const filing of filings.slice(0, 200)) {
    const attachments = readReleaseAttachments(filing.earningsRelease);
    if (attachments.length) withAttachments++;
    const publication = filing.publishedOn && filing.publishedOn <= filing.filedAt ? filing.publishedOn : null;
    for (const [index, record] of extractManagementGuidance(attachments).entries()) {
      versions.push({ ...record, id: `${filing.accession}:${index}`, accession: filing.accession,
        disclosedOn: (publication ?? filing.filedAt).toISOString().slice(0, 10), dateBasis: publication ? "publication" : "filing" });
    }
  }
  const series = buildGuidanceSeries(versions);
  const dates = [...new Set(versions.map(v => v.target.endDate).filter((v): v is string => Boolean(v)))];
  const actuals: GuidanceActual[] = [];
  if (dates.length) {
    const vintages = await prisma.equityFundamentalVintage.findMany({
      where: { symbol, periodType: "Q", fiscalDate: { in: dates.map(d => new Date(d)) }, filedAt: { lte: now }, isAmendment: false },
      orderBy: [{ filedAt: "asc" }, { accession: "asc" }],
      select: { fiscalDate: true, filedAt: true, accession: true, revenue: true, grossMargin: true, ocf: true },
    });
    // Earliest verifiable stored value per field; never label today's restatement as the first release.
    const seen = new Set<string>();
    for (const vintage of vintages) {
      if (!vintage.fiscalDate || !cik) continue;
      const endDate = vintage.fiscalDate.toISOString().slice(0, 10);
      for (const metric of ["revenue", "grossMargin", "ocf"] as const) {
        const value = vintage[metric];
        const key = `${endDate}:${metric}`;
        if (value == null || !Number.isFinite(value) || seen.has(key)) continue;
        seen.add(key);
        actuals.push({ endDate, horizon: "quarter", metric, basis: "gaap", value: metric === "grossMargin" ? value * 100 : value,
          unit: metric === "grossMargin" ? "percent" : "USD", reportedOn: vintage.filedAt.toISOString().slice(0, 10),
          sourceUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${vintage.accession.replace(/-/g, "")}/${vintage.accession}-index.html` });
      }
    }
  }
  const delivery = buildGuidanceDeliveries(versions, actuals);
  return { series, delivery, asOf: now.toISOString(), coverage: { announcements: Math.min(filings.length, 200), withAttachments, truncated: filings.length > 200 } };
}

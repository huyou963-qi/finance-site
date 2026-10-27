import { prisma } from "@/lib/prisma";
import { DAILY_DISCLOSURE_FORMS } from "./dailyDisclosurePolicy";
import type { SecReleaseAttachment } from "./secEdgar";

/** Read-only projection: frontend visits never trigger SEC requests here. */
export async function loadStockDisclosures(symbol: string, cik?: string | null) {
  const identity = cik ? { cik: cik.replace(/\D/g, "").padStart(10, "0") } : { symbol };
  const recent = await prisma.secFiling.findMany({
    where: { ...identity, form: { in: [...DAILY_DISCLOSURE_FORMS] } },
    orderBy: [{ filedAt: "desc" }, { accession: "desc" }], take: 5,
    select: { accession: true, form: true, filedAt: true, url: true, createdAt: true,
      dailyStatus: true, dailyProcessedAt: true, earningsRelease: true, items: true },
  });
  const financial = await prisma.secFiling.findFirst({
    where: { ...identity, form: { in: ["10-Q", "10-Q/A", "10-K", "10-K/A"] } },
    orderBy: [{ filedAt: "desc" }, { accession: "desc" }],
    select: { form: true, filedAt: true, url: true, dailyStatus: true, dailyProcessedAt: true },
  });
  return {
    announcements: recent.map(row => ({
      accession: row.accession, form: row.form, date: row.filedAt.toISOString().slice(0, 10), url: row.url,
      collectedAt: row.createdAt.toISOString(),
      isEarnings: row.items?.split(",").some(item => item.trim() === "2.02") ?? false,
      attachments: readReleaseAttachments(row.earningsRelease),
    })),
    financial: financial ? {
      form: financial.form, date: financial.filedAt.toISOString().slice(0, 10), url: financial.url,
      status: financial.dailyStatus,
      processedAt: financial.dailyProcessedAt?.toISOString() ?? null,
    } : null,
  };
}

export function readReleaseAttachments(value: unknown): SecReleaseAttachment[] {
  if (!value || typeof value !== "object") return [];
  const attachments = (value as { attachments?: unknown }).attachments;
  if (!Array.isArray(attachments)) return [];
  return attachments.filter((row): row is SecReleaseAttachment => {
    if (!row || typeof row !== "object") return false;
    const candidate = row as SecReleaseAttachment;
    return typeof candidate.filename === "string" && typeof candidate.text === "string" &&
      typeof candidate.url === "string" && candidate.url.startsWith("https://www.sec.gov/Archives/");
  }).slice(0, 5);
}

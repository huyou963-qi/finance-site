import { prisma } from "@/lib/prisma";
import { disclosureHealth } from "./disclosureHealthPolicy";

export async function loadStockDisclosureHealth(symbol: string, cik?: string | null) {
  const normalized = cik?.replace(/\D/g, "").padStart(10, "0") ?? null;
  const batch = await prisma.equityDisclosureBatch.findFirst({
    where: { OR: [{ symbols: { isEmpty: true } }, { symbols: { has: symbol } }] },
    orderBy: [{ throughDay: "desc" }, { startedAt: "desc" }, { id: "desc" }],
  });
  const count = batch && normalized ? await prisma.secFiling.count({
    where: { cik: normalized, filedAt: batch.throughDay, form: { in: ["8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A"] } },
  }) : 0;
  return disclosureHealth(batch, normalized, count);
}

import type { PrismaClient } from "@prisma/client";
import { US_TRADE_COUNTRY_END_PERIODS } from "./lifecycle";

/** Offline definition migration; never depend on downloading a live workbook.
 * Preserve observations and vintages, including undated/uncertain old history. */
export async function retireReviewedCensusCountries(prisma: PrismaClient) {
  const codes = ["4350", "4610", "5080", "5160", "7370", "7740"].flatMap(id =>
    ["exports", "imports"].map(side => `census_us_trade_${side}_country_nsa_${id}`));
  const rows = await prisma.dataSubscription.findMany({
    where: { sourceId: "us-census-trade-detail", instrument: { code: { in: codes } } },
    include: { instrument: { select: { code: true, metadata: true } } },
  });
  for (const row of rows) {
    const previous = row.instrument.metadata && typeof row.instrument.metadata === "object" && !Array.isArray(row.instrument.metadata)
      ? row.instrument.metadata : {};
    const id = row.instrument.code.slice(-4), end = US_TRADE_COUNTRY_END_PERIODS[id] ?? null;
    const audit = ["4350", "4610"].includes(id) ? "2026-10-24" : "2026-10-23";
    const latest = await prisma.macroObservation.findFirst({ where: { instrumentId: row.instrumentId },
      orderBy: { obsDate: "desc" }, select: { obsDate: true } });
    const lastObsDate = latest?.obsDate ?? null;
    if (!row.enabled && row.nextRunAt === null && previous.lifecycleAudit === audit
      && String(row.lastObsDate) === String(lastObsDate)) continue;
    await prisma.$transaction([
      prisma.instrument.update({ where: { id: row.instrumentId }, data: { metadata: {
        ...previous, lifecycleAudit: audit, sourceLifecycle: {
          status: "historical", officialLastPeriod: end,
          currentClassificationUrl: "https://www.census.gov/foreign-trade/schedules/c/countrycodes.html",
          historyUrl: `https://www.census.gov/foreign-trade/balance/c${id}.html`,
          historyVerification: end ? "official_end_period_confirmed" : "exact_end_period_unconfirmed",
          successorSpliced: false,
        },
      } } }),
      prisma.dataSubscription.update({ where: { id: row.id }, data: { enabled: false, nextRunAt: null, lastObsDate } }),
      prisma.scheduleAuditEvent.create({ data: { subscriptionId: row.id, source: "catalog_seed",
        reason: "census_historical_identity_no_current_update_obligation", previousNextRunAt: row.nextRunAt,
        nextRunAt: null, metadata: { code: row.instrument.code, officialLastPeriod: end, observationsPreserved: true } } }),
    ]);
  }
}

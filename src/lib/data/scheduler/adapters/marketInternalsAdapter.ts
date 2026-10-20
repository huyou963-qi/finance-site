import { MARKET_INTERNALS_SERIES } from "../marketInternals/catalog";
import { loadDailyBreadth, loadDailyStyles } from "../marketInternals/client";
import type { FetchIncrementalResult } from "../types";
import { prisma } from "@/lib/prisma";

const dependencies = {
  loadBreadth: loadDailyBreadth,
  loadStyles: loadDailyStyles,
  lastStoredDate: async (code: string): Promise<Date | null> => (await prisma.macroObservation.findFirst({ where: { instrument: { code } }, orderBy: { obsDate: "desc" }, select: { obsDate: true } }))?.obsDate ?? null,
};

export async function fetchMarketInternalsIncremental(_metadata: unknown, code: string, from: string, deps = dependencies): Promise<FetchIncrementalResult> {
  const config = MARKET_INTERNALS_SERIES.find((row) => row.code === code);
  if (!config) throw new Error(`未知广度/风格序列: ${code}`);
  const dataset = config.source === "breadth" ? await deps.loadBreadth(from) : null;
  const rows = dataset?.rows ?? await deps.loadStyles();
  const available = rows.filter((row) => row.values[config.key] != null);
  const storedThrough = dataset ? (await deps.lastStoredDate(code))?.toISOString().slice(0, 10) ?? null : null;
  const points = available.filter((row) => row.date >= from && (!storedThrough || row.date > storedThrough)).map((row) => ({ obsDate: new Date(`${row.date}T00:00:00Z`), value: row.values[config.key]! }));
  return {
    points, sourceLatestObsDate: available.length ? new Date(`${available[available.length - 1].date}T00:00:00Z`) : null, skippedInvalid: 0,
    sourceMetadata: dataset ? { membershipAnchor: dataset.anchor, membershipSource: dataset.source, calendarThrough: dataset.calendarThrough, membershipCorroborated: dataset.membershipCorroborated, appendOnly: true, storedThrough, reconstructed: true, minimumCoverage: 0.95 } : { frequency: "daily", publisher: "Kenneth R. French", releaseCadence: "monthly", historicalVersionsMayBeRevised: true },
  };
}

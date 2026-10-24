import { MARKET_INTERNALS_SERIES } from "../marketInternals/catalog";
import { loadDailyBreadth, loadDailyStyles, loadDailyStyleProxies } from "../marketInternals/client";
import type { FetchIncrementalResult } from "../types";
import { prisma } from "@/lib/prisma";

const dependencies = {
  loadBreadth: loadDailyBreadth,
  loadStyles: loadDailyStyles,
  loadProxies: loadDailyStyleProxies,
  storedDates: async (code: string, from: string): Promise<Set<string>> => new Set((await prisma.macroObservation.findMany({ where: { instrument: { code }, obsDate: { gte: new Date(`${from}T00:00:00Z`) } }, select: { obsDate: true } })).map(row => row.obsDate.toISOString().slice(0, 10))),
};

export async function fetchMarketInternalsIncremental(_metadata: unknown, code: string, from: string, deps = dependencies): Promise<FetchIncrementalResult> {
  const config = MARKET_INTERNALS_SERIES.find((row) => row.code === code);
  if (!config) throw new Error(`未知广度/风格序列: ${code}`);
  const dataset = config.source === "breadth" ? await deps.loadBreadth(from) : null;
  const rows = dataset?.rows ?? await (config.source === "proxy" ? deps.loadProxies() : deps.loadStyles());
  const available = rows.filter((row) => row.values[config.key] != null);
  const storedDates = dataset ? await deps.storedDates(code, from) : new Set<string>();
  const points = available.filter((row) => row.date >= from && !storedDates.has(row.date)).map((row) => ({ obsDate: new Date(`${row.date}T00:00:00Z`), value: row.values[config.key]! }));
  return {
    points, sourceLatestObsDate: available.length ? new Date(`${available[available.length - 1].date}T00:00:00Z`) : null, skippedInvalid: 0,
    sourceMetadata: dataset ? { membershipAnchor: dataset.anchor, membershipSource: dataset.source, calendarThrough: dataset.calendarThrough, membershipCorroborated: dataset.membershipCorroborated, insertMissingOnly: true, existingDates: storedDates.size, reconstructed: true, minimumCoverage: 0.95 } : config.source === "proxy" ? { frequency: "daily", methodology: "ETF adjusted total return long minus short", publication: "closed trading days only", officialFrenchFactor: false } : { frequency: "daily", publisher: "Kenneth R. French", releaseCadence: "monthly", historicalVersionsMayBeRevised: true },
  };
}

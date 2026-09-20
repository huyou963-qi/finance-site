import type { FetchIncrementalResult } from "../types";
import { JP_TOURISM_CORE_PROVIDER } from "../jpTourismCore/catalog";
import { fetchJpTourismCore } from "../jpTourismCore/client";
import { parseForeignGuestNightsWorkbook, parseInboundConsumptionSummaryText } from "../jpTourismCore/parser";

export async function fetchJpTourismCoreIncremental(metadata: unknown, instrumentCode: string, obsStart: string): Promise<FetchIncrementalResult> {
  const scrape = (metadata as { scrape?: { provider?: string; fixtureDir?: string } } | null)?.scrape;
  if (scrape?.provider !== JP_TOURISM_CORE_PROVIDER) throw new Error(`JTA tourism-core invalid routing: ${instrumentCode}`);
  const fetched = await fetchJpTourismCore(scrape.fixtureDir);
  const points = instrumentCode === "jta_jp_inbound_travel_spending_total"
    ? [...new Map(fetched.consumptionTexts.flatMap(({ text, label }) => {
      try {
        const point = parseInboundConsumptionSummaryText(text, label);
        return [[point.obsDate.toISOString(), point] as const];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/no quarterly period anchor|no total-spending anchor|no total spending amount/.test(message)) return [];
        throw error;
      }
    })).values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime())
    : instrumentCode === "jta_jp_foreign_guest_nights_total"
      ? parseForeignGuestNightsWorkbook(fetched.accommodationWorkbook)
      : (() => { throw new Error(`JTA tourism-core unknown instrument: ${instrumentCode}`); })();
  const start = new Date(`${obsStart}T00:00:00Z`).getTime();
  const filtered = points.filter((point) => point.obsDate.getTime() >= start);
  return { points: filtered, sourceLatestObsDate: points.at(-1)?.obsDate ?? null, skippedInvalid: 0 };
}

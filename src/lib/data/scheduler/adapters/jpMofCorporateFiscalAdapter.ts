import type { FetchIncrementalResult } from "../types";
import {
  JP_MOF_CORPORATE_FISCAL_PROVIDER,
  jpMofCorporateFiscalSeriesByCode,
} from "../jpMofCorporateFiscal/catalog";
import {
  fetchJpMofCorporateResponse,
  fetchJpMofWorkbook,
} from "../jpMofCorporateFiscal/client";
import {
  parseJpMofCorporateResponse,
  parseJpMofDebtServiceWorkbook,
  parseJpMofDebtWorkbook,
  parseJpMofFiscalResultsWorkbook,
} from "../jpMofCorporateFiscal/parser";

export async function fetchJpMofCorporateFiscalIncremental(
  metadata: unknown,
  instrumentCode: string,
  _obsStart: string,
): Promise<FetchIncrementalResult> {
  const scrape = metadata && typeof metadata === "object"
    ? (metadata as { scrape?: { provider?: string; fixturePath?: string; fixtureDebtServicePath?: string } }).scrape
    : undefined;
  const series = jpMofCorporateFiscalSeriesByCode(instrumentCode);
  if (scrape?.provider !== JP_MOF_CORPORATE_FISCAL_PROVIDER || !series) {
    throw new Error(`MOF corporate/fiscal invalid routing: ${instrumentCode}`);
  }
  let points;
  if (series.dataset === "corporate") {
    points = parseJpMofCorporateResponse(
      await fetchJpMofCorporateResponse(series.itemCode, scrape.fixturePath),
      series,
    );
  } else if (series.dataset === "debt") {
    points = parseJpMofDebtWorkbook(await fetchJpMofWorkbook("debt", scrape.fixturePath));
  } else if (series.field === "debt_service") {
    points = parseJpMofDebtServiceWorkbook(
      await fetchJpMofWorkbook("debt_service", scrape.fixtureDebtServicePath ?? scrape.fixturePath),
    );
  } else {
    points = parseJpMofFiscalResultsWorkbook(
      await fetchJpMofWorkbook("fiscal_results", scrape.fixturePath),
    )[series.field];
  }
  return {
    points,
    sourceLatestObsDate: points.at(-1)?.obsDate ?? null,
    skippedInvalid: 0,
  };
}

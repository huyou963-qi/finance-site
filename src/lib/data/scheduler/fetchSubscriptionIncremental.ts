import { SourceAdapterKind, type DataSource } from "@prisma/client";
import { fetchBisIncremental } from "./adapters/bisAdapter";
import { fetchFredIncremental } from "./adapters/fredAdapter";
import {
  fetchOverviewIncremental,
  overviewTemplateForInstrument,
} from "./adapters/overviewXlsxAdapter";
import { fetchWorldBankIncremental } from "./adapters/worldbankAdapter";
import { fetchFredCompositeIncremental } from "./fredComposite";
import { fiscalCompositeSpec } from "./fiscalCompositeFred";
import { usovCompositeSpec } from "./usovCompositeFred";
import type { SubscriptionWithRelations } from "./runSubscription";
import type { FetchIncrementalResult } from "./types";

function minIntervalMs(source: DataSource): number {
  const rl = source.rateLimit as { minIntervalMs?: number } | null;
  return typeof rl?.minIntervalMs === "number" ? rl.minIntervalMs : 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readScrapeObject(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const scrape = (metadata as Record<string, unknown>).scrape;
  return scrape && typeof scrape === "object" ? (scrape as Record<string, unknown>) : null;
}

function readWorldBankOptions(metadata: unknown):
  | { annualObservationDate?: "year_start" | "year_end"; historyStartYear?: number }
  | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const wb = (metadata as Record<string, unknown>).worldbank;
  if (!wb || typeof wb !== "object") return undefined;
  const row = wb as Record<string, unknown>;
  return {
    annualObservationDate:
      row.annualObservationDate === "year_end" ? "year_end" : "year_start",
    historyStartYear:
      typeof row.historyStartYear === "number" && Number.isFinite(row.historyStartYear)
        ? row.historyStartYear
        : undefined,
  };
}

/** 按 DataSource / metadata 分发增量拉取（与 runSubscription 原逻辑一致） */
export async function fetchSubscriptionIncremental(
  sub: SubscriptionWithRelations,
  fetchStart: string,
): Promise<FetchIncrementalResult> {
  if (sub.source.adapterKind === SourceAdapterKind.FRED_API) {
    const apiKey = process.env.FRED_API_KEY?.trim();
    if (!apiKey) throw new Error("未配置 FRED_API_KEY");
    await sleep(minIntervalMs(sub.source));
    const composite =
      usovCompositeSpec(sub.instrument.code) ?? fiscalCompositeSpec(sub.instrument.code);
    if (composite) {
      return fetchFredCompositeIncremental(composite, apiKey, fetchStart);
    }
    return fetchFredIncremental(sub.sourceSeriesKey, apiKey, fetchStart);
  }

  if (sub.source.adapterKind === SourceAdapterKind.REST_API) {
    await sleep(minIntervalMs(sub.source));
    const scrapeObj = readScrapeObject(sub.instrument.metadata);
    if (scrapeObj) {
      if (scrapeObj.provider === "tradingeconomics_ism") {
        const { fetchTradingEconomicsIsmIncremental } = await import(
          "./adapters/tradingEconomicsIsmAdapter"
        );
        return fetchTradingEconomicsIsmIncremental(
          sub.instrument.metadata,
          sub.instrument.code,
          fetchStart,
        );
      }
      if (scrapeObj.provider === "tradingeconomics_ism_svc") {
        const { fetchTradingEconomicsIsmSvcIncremental } = await import(
          "./adapters/tradingEconomicsIsmSvcAdapter"
        );
        return fetchTradingEconomicsIsmSvcIncremental(
          sub.instrument.metadata,
          sub.instrument.code,
          fetchStart,
        );
      }
      if (scrapeObj.provider === "nyfed_recession") {
        const { fetchNyFedRecessionIncremental } = await import(
          "./adapters/nyFedRecessionAdapter"
        );
        return fetchNyFedRecessionIncremental(
          sub.instrument.metadata,
          sub.instrument.code,
          fetchStart,
        );
      }
      if (scrapeObj.provider === "nbs_pmi") {
        const { fetchNbsPmiIncremental } = await import("./adapters/nbsPmiAdapter");
        return fetchNbsPmiIncremental(
          sub.instrument.metadata,
          sub.instrument.code,
          fetchStart,
        );
      }
      if (scrapeObj.provider === "bls_ppi") {
        const { fetchBlsPpiIncremental } = await import("./adapters/blsPpiAdapter");
        return fetchBlsPpiIncremental(sub.instrument.metadata, fetchStart);
      }
      if (scrapeObj.provider === "nbs_cpi") {
        const { fetchNbsCpiIncremental } = await import("./adapters/nbsCpiAdapter");
        return fetchNbsCpiIncremental(
          sub.instrument.metadata,
          sub.instrument.code,
          fetchStart,
        );
      }
      if (scrapeObj.provider === "nbs_retail") {
        const { fetchNbsRetailIncremental } = await import("./adapters/nbsRetailAdapter");
        return fetchNbsRetailIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "nbs_ppi") {
        const { fetchNbsPpiIncremental } = await import("./adapters/nbsPpiAdapter");
        return fetchNbsPpiIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "nbs_industrial") {
        const { fetchNbsIndustrialIncremental } = await import("./adapters/nbsIndustrialAdapter");
        return fetchNbsIndustrialIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "nbs_gdp") {
        const { fetchNbsGdpIncremental } = await import("./adapters/nbsGdpAdapter");
        return fetchNbsGdpIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "nbs_fai") {
        const { fetchNbsFaiIncremental } = await import("./adapters/nbsFaiAdapter");
        return fetchNbsFaiIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "nbs_realestate") {
        const { fetchNbsRealEstateIncremental } = await import("./adapters/nbsRealEstateAdapter");
        return fetchNbsRealEstateIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "mof_fiscal") {
        const { fetchMofFiscalIncremental } = await import("./adapters/mofFiscalAdapter");
        return fetchMofFiscalIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "pbc_monetary") {
        const { fetchPbcMonetaryIncremental } = await import("./adapters/pbcMonetaryAdapter");
        return fetchPbcMonetaryIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "safe_external") {
        const { fetchSafeExternalIncremental } = await import("./adapters/safeExternalAdapter");
        return fetchSafeExternalIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      if (scrapeObj.provider === "mofcom_trade") {
        const { fetchMofcomTradeIncremental } = await import("./adapters/mofcomTradeAdapter");
        return fetchMofcomTradeIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
      }
      const { fetchWebScrapeIncremental } = await import("./adapters/webScrapeAdapter");
      return fetchWebScrapeIncremental(sub.instrument.metadata, sub.instrument.code, fetchStart);
    }
    if (sub.sourceId === "estat-jp") {
      const { fetchEStatIncremental } = await import("./adapters/eStatAdapter");
      return fetchEStatIncremental(sub.sourceSeriesKey, fetchStart);
    }
    if (sub.sourceId === "treasury-fiscal-data") {
      const { fiscalTreasuryCompositeSpec, fetchTreasuryCompositeIncremental } = await import(
        "./fiscalTreasuryComposite"
      );
      const treasuryComposite = fiscalTreasuryCompositeSpec(sub.instrument.code);
      if (treasuryComposite) {
        return fetchTreasuryCompositeIncremental(treasuryComposite, fetchStart);
      }
      const { fetchTreasuryFiscalIncremental } = await import(
        "./adapters/treasuryFiscalDataAdapter"
      );
      return fetchTreasuryFiscalIncremental(sub.sourceSeriesKey, fetchStart);
    }
    if (sub.sourceId === "cftc-cot") {
      const { fetchCftcCotIncremental } = await import("./adapters/cftcCotAdapter");
      return fetchCftcCotIncremental(sub.instrument.metadata, fetchStart);
    }
    return fetchBisIncremental(sub.sourceSeriesKey, fetchStart);
  }

  if (sub.source.adapterKind === SourceAdapterKind.WORLD_BANK_API) {
    await sleep(minIntervalMs(sub.source));
    return fetchWorldBankIncremental(
      sub.sourceSeriesKey,
      fetchStart,
      readWorldBankOptions(sub.instrument.metadata),
    );
  }

  if (sub.source.adapterKind === SourceAdapterKind.BULK_FILE) {
    const template = overviewTemplateForInstrument(sub.instrument.code);
    if (!template) {
      throw new Error(`BULK_FILE 未识别仪器 ${sub.instrument.code}`);
    }
    return fetchOverviewIncremental(template, sub.instrument.code, fetchStart);
  }

  if (sub.source.adapterKind === SourceAdapterKind.MANUAL) {
    throw new Error("MANUAL 订阅需人工更新或通过 sync_one --force 跳过");
  }

  throw new Error(`尚未实现适配器：${sub.source.adapterKind}`);
}

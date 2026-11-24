import { computeUsCpiNowcast, toPublicUsCpiPayload } from "@/lib/forecast/usCpi/service";
import { computeUsNfpNowcast, toPublicUsNfpPayload } from "@/lib/forecast/usNfp/service";
import { computeUsGdpNowcast, toPublicUsGdpPayload } from "@/lib/forecast/usGdp/service";
import { MarketError } from "@/lib/market/schema";
import { absoluteUrl } from "@/lib/seo/siteUrl";

export const forecastFeatures = {
  "us-cpi": "forecast-us-cpi",
  "us-nfp": "forecast-us-nfp",
  "us-gdp": "forecast-us-gdp",
} as const;

type Forecast = keyof typeof forecastFeatures;
const ttlMs = 30 * 60_000;
const dbOnly = { dbOnly: true };

async function computeSummary(key: Forecast) {
  const websiteUrl = absoluteUrl(`/forecast/${key}`);
  const now = new Date();
  if (key === "us-cpi") {
    const { generatedAt, targetMonth, latestCpiMonth, observedThrough, headline, core, hasFallback } =
      toPublicUsCpiPayload(await computeUsCpiNowcast(now, dbOnly));
    const read = ({ mom, low, high, yoy }: typeof headline) => ({ mom, low, high, yoy });
    return { forecast: key, generatedAt, targetMonth, latestCpiMonth, observedThrough,
      headline: read(headline), core: read(core), hasFallback, unit: "percent", websiteUrl };
  }
  if (key === "us-nfp") {
    const { generatedAt, targetMonth, latestNfpMonth, asOf, nowcast, low, high } =
      toPublicUsNfpPayload(await computeUsNfpNowcast(now, dbOnly));
    return { forecast: key, generatedAt, targetMonth, latestNfpMonth, asOf, nowcast, low, high, unit: "thousand_jobs", websiteUrl };
  }
  const { generatedAt, targetQuarter, latestQuarter, asOf, nowcast, low, high } =
    toPublicUsGdpPayload(await computeUsGdpNowcast(now, dbOnly));
  return { forecast: key, generatedAt, targetQuarter, latestQuarter, asOf, nowcast, low, high, unit: "real_percent_qoq_annualized", websiteUrl };
}

const cache = new Map<Forecast, { expiresAt: number; result: Awaited<ReturnType<typeof computeSummary>> | null }>();
const inFlight = new Map<Forecast, ReturnType<typeof computeSummary>>();

export async function getForecastSummary(key: Forecast) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    if (hit.result) return hit.result;
    throw new MarketError("FORECAST_UNAVAILABLE", "站内数据暂不足以生成预测摘要");
  }
  const pending = inFlight.get(key);
  if (pending) return pending;
  const work = computeSummary(key).then(result => {
    cache.set(key, { expiresAt: Date.now() + ttlMs, result });
    return result;
  }).catch(error => {
    console.error("[research-mcp] forecast unavailable", key, error);
    cache.set(key, { expiresAt: Date.now() + 60_000, result: null });
    throw new MarketError("FORECAST_UNAVAILABLE", "站内数据暂时无法生成预测摘要");
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

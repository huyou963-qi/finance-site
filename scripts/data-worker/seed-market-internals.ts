import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { MARKET_INTERNALS_SERIES, MARKET_INTERNALS_RULE, MARKET_INTERNALS_DAILY_RULE, FRENCH_URL, WIKI_URL, DAILY_STYLE_PROXY_URL } from "../../src/lib/data/scheduler/marketInternals/catalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  for (const family of ["french", "breadth", "proxy"] as const) {
    const agencyId = family === "french" ? "us-ken-french" : "us-gekkotech-market-research";
    const name = family === "french" ? "Kenneth R. French 数据库" : family === "breadth" ? "GekkoTech 美股市场广度计算" : "GekkoTech 日更风格代理";
    const url = family === "french" ? FRENCH_URL : family === "breadth" ? WIKI_URL : DAILY_STYLE_PROXY_URL;
    const sourceId = `market-internals-${family}`;
    await prisma.statisticalAgency.upsert({ where: { id: agencyId }, create: { id: agencyId, countryCode: "US", nameZh: family === "french" ? name : "GekkoTech 美股市场研究", nameEn: family === "french" ? name : "GekkoTech Market Research", websiteUrl: url }, update: { nameZh: family === "french" ? name : "GekkoTech 美股市场研究", websiteUrl: url } });
    await prisma.dataSource.upsert({ where: { id: sourceId }, create: { id: sourceId, agencyId, name, adapterKind: "REST_API", baseUrl: url, termsUrl: url, rateLimit: { minIntervalMs: 1000 } }, update: { agencyId, adapterKind: "REST_API", baseUrl: url } });
    for (const row of MARKET_INTERNALS_SERIES.filter((r) => r.source === family)) {
      const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
      const old = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata as Record<string, unknown> : {};
      const metadata = mergeFetchAcquisition({ ...old,
        sourceTag: "market-internals-daily", source: name, sourceUrl: url, officialUrl: url, bootstrapOnly: false,
        countryCode: "US", countryNameZh: "美国", displayName: row.name, catalogCategory: "利率与信用市场", catalogSubgroup: row.group,
        freqLabel: "日", unit: row.unit, sourceUpdateNote: `${row.note}；每${family === "french" ? 24 : 6}小时检查；${family === "french" ? "源方按月公布日频文件，历史可能修订" : "仅发布已收盘交易日；价格或名单不足不补值"}`,
        isDerived: family !== "french", methodology: family === "breadth" ? "public_historical_membership_isolated_price_windows_95pct_v2" : family === "proxy" ? "etf_adjusted_daily_return_spread_v1" : "official_french_daily_returns_v1",
        historicalStartRequested: "1995-01-01", scrape: { provider: "market_internals_daily" },
        attribution: family === "proxy" ? "Yahoo ETF adjusted closes; GekkoTech derived daily return spreads; fund mandates: iShares / State Street" : family === "french" ? "Copyright Eugene F. Fama and Kenneth R. French" : "Farrell J. Aultman/fja05680 SP500 history MIT; Wikipedia CC BY-SA; Yahoo prices; Quandl WIKI public-domain frozen archive; GekkoTech derived breadth",
      }, { status: "known", probedAt: new Date().toISOString(), method: "market_internals_daily", methodLabel: "每日自动检查：日频风格与市场广度", fetchUrl: url, officialUrl: url, message: row.note });
      const inst = await prisma.instrument.upsert({ where: { code: row.code }, create: { code: row.code, kind: "MACRO_SERIES", name: row.name, freqLabel: "日", unit: row.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${row.code}`, agencyId, sourceId } }, update: { name: row.name, freqLabel: "日", unit: row.unit, metadata: metadata as object } });
      await prisma.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, sourceId, sourceSeriesKey: row.code, fetchMethod: "API", granularity: "DAILY", releaseRule: family === "french" ? MARKET_INTERNALS_RULE : MARKET_INTERNALS_DAILY_RULE, nextRunAt: new Date(), enabled: true, priority: 8, revisionLookback: family !== "breadth" ? 1000 : 2 }, update: { sourceId, sourceSeriesKey: row.code, fetchMethod: "API", granularity: "DAILY", releaseRule: family === "french" ? MARKET_INTERNALS_RULE : MARKET_INTERNALS_DAILY_RULE, enabled: true, revisionLookback: family !== "breadth" ? 1000 : 2 } });
      console.log(`seed ${row.code} · 日频 · ${family === "french" ? 24 : 6}小时检查`);
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

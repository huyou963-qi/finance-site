import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { PBC_LPR_INDEX_URL, PBC_MONETARY_COMPONENTS, PBC_MONETARY_INDEX_URL, PBC_MONETARY_SOURCE, PBC_MONETARY_SYNC_SCRIPT, pbcMonetaryCode } from "../../src/lib/data/scheduler/pbcMonetary/catalog";

loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "cn-pbc" }, create: { id: "cn-pbc", countryCode: "CN", nameZh: "中国人民银行", nameEn: "People's Bank of China", websiteUrl: "https://www.pbc.gov.cn/" }, update: { countryCode: "CN", nameZh: "中国人民银行", nameEn: "People's Bank of China", websiteUrl: "https://www.pbc.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: PBC_MONETARY_SOURCE.id }, create: { ...PBC_MONETARY_SOURCE, adapterKind: SourceAdapterKind.REST_API, rateLimit: { requestsPerMinute: 4, minIntervalMs: 15_000 } }, update: { agencyId: "cn-pbc", name: PBC_MONETARY_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: PBC_MONETARY_SOURCE.baseUrl, termsUrl: PBC_MONETARY_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 4, minIntervalMs: 15_000 } } });
  const rule = { type: "probe_interval" as const, intervalHours: 24 }; const probedAt = new Date().toISOString();
  for (const component of PBC_MONETARY_COMPONENTS) {
    const code = pbcMonetaryCode(component.key); const previous = await prisma.instrument.findUnique({ where: { code }, select: { metadata: true } });
    const archiveUrl = component.group === "rate" ? PBC_LPR_INDEX_URL : PBC_MONETARY_INDEX_URL;
    const category = component.group === "rate" ? "利率与债券" : "银行与货币";
    const metadata = mergeFetchAcquisition({ ...(previous?.metadata as Record<string, unknown> ?? {}), sourceTag: "pbc-monetary-official-release", bootstrapOnly: false, source: "中国人民银行", providerNote: "People's Bank of China public statistics archive", sourceUrl: archiveUrl, officialUrl: archiveUrl, countryCode: "CN", countryNameZh: "中国", displayName: `货币与信用：${component.name}`, catalogCategory: category, freqLabel: "月", unit: component.unit, sourceUpdateNote: "人民银行按月发布金融统计、社会融资规模和 LPR 公告；仅保存公告直接披露的余额、同比、累计增量或利率，不推算环比或非官方频率。", scrape: { provider: "pbc_monetary", component: component.key, group: component.group, script: PBC_MONETARY_SYNC_SCRIPT } }, { status: "known", probedAt, method: "pbc_public_release_archive", methodLabel: PBC_MONETARY_SYNC_SCRIPT, fetchUrl: archiveUrl, officialUrl: archiveUrl, message: "人民银行公开归档页面；根据任务所有者授权，以低频、限速、无认证方式解析历史公告。" });
    const instrument = await prisma.instrument.upsert({ where: { code }, create: { code, kind: InstrumentKind.MACRO_SERIES, name: `中国：货币与信用：${component.name}`, shortName: component.name, description: `中国人民银行${component.name}`, freqLabel: "月", unit: component.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${code}`, agencyId: "cn-pbc", sourceId: PBC_MONETARY_SOURCE.id } }, update: { name: `中国：货币与信用：${component.name}`, shortName: component.name, description: `中国人民银行${component.name}`, freqLabel: "月", unit: component.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, sourceId: PBC_MONETARY_SOURCE.id, sourceSeriesKey: component.key, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: rule, nextRunAt: computeNextRunAt(rule), enabled: true, priority: 43 }, update: { sourceId: PBC_MONETARY_SOURCE.id, sourceSeriesKey: component.key, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: rule, nextRunAt: computeNextRunAt(rule), enabled: true, priority: 43 } });
  }
  console.log(`[data:seed-pbc-monetary] 完成：${PBC_MONETARY_COMPONENTS.length} 条人民银行订阅`);
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

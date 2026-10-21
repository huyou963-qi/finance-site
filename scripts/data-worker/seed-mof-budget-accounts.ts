import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { MOF_BUDGET_ACCOUNTS_INDEX_URL, MOF_BUDGET_ACCOUNTS_SERIES, MOF_BUDGET_ACCOUNTS_SOURCE, MOF_BUDGET_ACCOUNTS_SYNC_SCRIPT } from "../../src/lib/data/scheduler/mofBudgetAccounts/catalog";
import { fetchMofBudgetAccountsHistory, fetchMofBudgetAccountsTableCoverage } from "../../src/lib/data/scheduler/mofBudgetAccounts/client";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { join } from "node:path";
import { loadBudgetSeedInput } from "./mof-budget-accounts-seed-input";
import { budgetSubscriptionEnabled } from "../../src/lib/data/scheduler/mofBudgetAccounts/lifecycle";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  // Availability comes from parsed official history, not a guessed Cartesian product
  // of scopes and insurance types. Never register permanently empty subscriptions.
  const definitionsOnly = process.argv.includes("--definitions-only");
  const input = await loadBudgetSeedInput({
    definitionsOnly, writeCatalog: process.argv.includes("--write-catalog"),
    snapshotPath: join(process.cwd(), "data", "mof-budget-accounts-availability.json"),
    sourceUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL,
    loadLive: async () => {
      const history = await fetchMofBudgetAccountsHistory();
      const coverage = await fetchMofBudgetAccountsTableCoverage();
      const entries = MOF_BUDGET_ACCOUNTS_SERIES.flatMap(series => {
        const latest = history.get(series.key)?.at(-1);
        if (!latest) return [];
        const tableLatestYear = coverage.get(`${series.scope}_${series.table}`);
        if (tableLatestYear == null) throw new Error(`年度决算表覆盖缺失 ${series.key}`);
        return [{ key: series.key, lastYear: latest.obsDate.getUTCFullYear(), lastValue: latest.value, tableLatestYear }];
      });
      return { entries, history };
    },
  });
  const availability = new Map(input.entries.map(entry => [entry.key, entry]));
  for (const key of availability.keys()) if (!MOF_BUDGET_ACCOUNTS_SERIES.some(series => series.key === key)) throw new Error(`年度决算快照含未知指标 ${key}`);
  await prisma.statisticalAgency.upsert({ where: { id: "cn-mof" }, create: { id: "cn-mof", countryCode: "CN", nameZh: "财政部", nameEn: "Ministry of Finance of the People's Republic of China", websiteUrl: "https://www.mof.gov.cn/" }, update: {} });
  await prisma.dataSource.upsert({ where: { id: MOF_BUDGET_ACCOUNTS_SOURCE.id }, create: { ...MOF_BUDGET_ACCOUNTS_SOURCE, adapterKind: SourceAdapterKind.REST_API, rateLimit: { minIntervalMs: 500 } }, update: { adapterKind: SourceAdapterKind.REST_API, baseUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL, rateLimit: { minIntervalMs: 500 } } });
  let registered = 0;
  let pointsWritten = 0;
  for (const series of MOF_BUDGET_ACCOUNTS_SERIES) {
    const evidence = availability.get(series.key);
    if (!evidence) continue;
    const existing = await prisma.instrument.findUnique({ where: { code: series.code }, select: { metadata: true } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const tableLatestYear = evidence.tableLatestYear;
    const current = evidence.lastYear === tableLatestYear;
    const metadata = {
      ...previous, sourceTag: "mof-budget-accounts-final", source: "财政部预算司全国财政决算", countryCode: "CN", countryNameZh: "中国",
      catalogKey: `mds:${series.code}`, catalogCategory: "财政与公共债务", displayName: `${series.name}（年度决算）`,
      unit: "亿元", freqLabel: "年", seasonalAdjustment: "NSA", budgetStatus: "final_accounts", budgetAccount: series.account, budgetScope: series.scope,
      currentTableYear: tableLatestYear, historicalOnly: !current, archiveAfterBootstrap: !current,
      officialUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL, sourceUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL, bootstrapOnly: false,
      sourceUpdateNote: "财政部全国财政决算公开表；只读年度决算金额，年首代表财政年度。完整回读已公开历史捕获修订；不与月度累计、预算数、执行数混拼，不计算官方未公布的值。中央社保从2025年起部分行业统筹转地方，前后范围不可比；医保生育合并依原表。" + (current ? "" : "本分项在最新同口径表未公布金额，仅保留历史并停用独立探测；后续seed重新核验。"),
      scrape: { provider: "mof_budget_accounts", component: series.key, table: series.table, scope: series.scope, script: MOF_BUDGET_ACCOUNTS_SYNC_SCRIPT },
      fetchAcquisition: { status: "known", probedAt: input.capturedAt, method: "mof_official_final_accounts", methodLabel: MOF_BUDGET_ACCOUNTS_SYNC_SCRIPT, fetchUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL, officialUrl: MOF_BUDGET_ACCOUNTS_INDEX_URL, sampleObsDate: `${evidence.lastYear}-01-01`, sampleValue: evidence.lastValue },
      attribution: "来源：中华人民共和国财政部；中文指标按官方预算科目。",
    };
    const fields = { name: `中国：${series.name}（年度决算）`, shortName: series.name, freqLabel: "年", unit: "亿元", metadata, externalRefs: { catalogKey: `mds:${series.code}`, agencyId: "cn-mof", sourceId: MOF_BUDGET_ACCOUNTS_SOURCE.id } };
    const instrument = await prisma.instrument.upsert({ where: { code: series.code }, create: { code: series.code, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const hasHistory = Boolean(input.history?.get(series.key)?.length) || (await prisma.macroObservation.count({ where: { instrumentId: instrument.id } })) > 0;
    const subscription = { sourceId: MOF_BUDGET_ACCOUNTS_SOURCE.id, sourceSeriesKey: series.key, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.ANNUAL, timezone: "Asia/Shanghai", releaseRule: { type: "probe_interval", intervalHours: 168 }, revisionLookback: 1200, enabled: budgetSubscriptionEnabled(current, hasHistory), priority: 42 };
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date() }, update: subscription });
    if (input.history) pointsWritten += (await upsertMacroObservations(prisma, instrument.id, input.history.get(series.key) ?? [])).upserted;
    registered++;
  }
  if (!registered) throw new Error("财政决算未发现可用指标，未注册空订阅");
  console.log(`[seed-mof-budget-accounts] 模式=${definitionsOnly ? "definitions-only（离线）" : "live"}，可用指标=${registered}，新增/修订观测=${pointsWritten}；下一步 seed-release-packages 与 sync-mof-budget-accounts`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

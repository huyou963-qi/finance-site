import { loadEnvConfig } from "@next/env";
import { PrismaClient, InstrumentKind, SourceAdapterKind, DataFetchMethod } from "@prisma/client";
import { FISCAL_FRED_SERIES } from "../../src/lib/data/scheduler/fiscalFredSeedCatalog";
import { FISCAL_NATIVE_TREASURY, FISCAL_HOLDER_FRED, FISCAL_RAW_SUBSCRIPTIONS } from "../../src/lib/data/scheduler/usFiscalFoundation/catalog";
import { RELEASE_PACKAGE_CATALOG } from "../../src/lib/data/scheduler/releasePackageCatalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { fetchSubscriptionIncremental } from "../../src/lib/data/scheduler/fetchSubscriptionIncremental";
import { clearFredCatalogCache } from "../../src/lib/data/fredCatalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const frequency = { DAILY: "日", WEEKLY: "周", MONTHLY: "月", QUARTERLY: "季", ANNUAL: "年" };

async function main() {
  const syncOnly = process.argv.includes("--sync-only");
  const definitionsOnly = process.argv.includes("--definitions-only");
  const selected = process.argv.find(a => a.startsWith("--codes="))?.slice(8).split(",");
  const treasury = FISCAL_NATIVE_TREASURY.map(r => ({ ...r, key: r.code, sourceId: "treasury-fiscal-data", fredId: null as string|null, raw: false }));
  const fred = [
    ...FISCAL_FRED_SERIES.filter(r => ["GFDEBTN","FYGFDPUN","GFDEGDQ188S","FYGFGDQ188S"].includes(r.fredId)).map(r => ({code:r.code,fredId:r.fredId,name:r.displayName,unit:r.unit,granularity:r.granularity,note:r.sourceUpdateNote,
      packageId:"us.treasury.debt_levels",
      group: /GDP/.test(r.displayName) ? "可持续性比率" : /消费|NIPA/.test(r.displayName) ? "政府支出核算" : "债务存量"})),
    ...FISCAL_HOLDER_FRED.map(r => ({code:`sched_fred_${r.fredId}`,fredId:r.fredId,name:r.name,unit:"十亿美元",granularity:"QUARTERLY" as const,note:r.note,packageId:"us.treasury.holders",group:"债务持有人"})),
  ].map(r => ({...r,key:r.fredId,sourceId:"fred",raw:false}));
  const raw = FISCAL_RAW_SUBSCRIPTIONS.map(r => ({...r,sourceId:"treasury-fiscal-data",fredId:null as string|null,raw:true,unit:"原始记录",note:"原始明细单独保存于TreasurySourceSnapshot；不生成宏观合计值，不将抓取时点冒充历史首发时点。"}));
  const rows = [...treasury,...fred,...raw].filter(r => !selected || selected.includes(r.code));
  if (selected && rows.length !== selected.length) throw new Error("--codes含未知或重复指标");
  if (!syncOnly) {
    for (const [id,name] of [["us-treasury","美国财政部"],["us-frb","美国联邦储备委员会"]]) await prisma.statisticalAgency.upsert({where:{id},create:{id,countryCode:"US",nameZh:name},update:{}});
    for (const [id,agencyId,adapterKind,url] of [
      ["treasury-fiscal-data","us-treasury",SourceAdapterKind.REST_API,"https://api.fiscaldata.treasury.gov/services/api/fiscal_service"],
      ["fred","us-frb",SourceAdapterKind.FRED_API,"https://api.stlouisfed.org/fred"],
    ] as const) await prisma.dataSource.upsert({where:{id},create:{id,agencyId,name:id,adapterKind,baseUrl:url,rateLimit:{minIntervalMs:600}},update:{}});
    // 种子即绑定同一份权威发布包，避免seed后暂时失去自动更新；独立seed-release-packages仍幂等兼容。
    for (const id of new Set(rows.map(r => r.packageId))) {
      const def = RELEASE_PACKAGE_CATALOG.find(p => p.id===id);
      if (!def) throw new Error(`发布包缺失：${id}`);
      await prisma.releasePackage.upsert({where:{id},create:{id,labelZh:def.labelZh,countryCode:"US",agencyId:def.agencyId,granularity:def.granularity,calendarSpec:def.calendar as object,releaseTemplate:def.release as object,enabled:true},update:{labelZh:def.labelZh,releaseTemplate:def.release as object}});
    }
    for (const row of rows) {
      const existing = row.fredId ? await prisma.instrument.findUnique({where:{fredSeriesId:row.fredId}}) : await prisma.instrument.findUnique({where:{code:row.code}});
      const fetchUrl = row.fredId ? `https://api.stlouisfed.org/fred/series/observations?series_id=${row.fredId}`
        : "spec" in row ? `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/${row.spec.endpoint}`
          : `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/${row.key === "raw:mspd" ? "v1/debt/mspd/mspd_table_3_market" : "v1/accounting/od/treasury_securities_auctions_v2"}`;
      const metadata = { ...(existing?.metadata as object ?? {}),sourceTag:"us-fiscal-foundation",source:row.sourceId==="fred" ? "Treasury/BEA via FRED" : "U.S. Treasury Fiscal Data",
        countryCode:"US",countryNameZh:"美国",displayName:row.name,freqLabel:frequency[row.granularity],unit:row.unit,
        catalogCategory:"财政与公共债务",catalogSubgroup:row.group,catalogKey:row.fredId ? `fred:${row.fredId}` : `mds:${row.code}`,
        sourceUpdateNote:row.note,rawDataset:row.raw,officialUrl:row.fredId ? `https://fred.stlouisfed.org/series/${row.fredId}` : "https://fiscaldata.treasury.gov/",
        fetchAcquisition:{status:"known",probedAt:new Date().toISOString(),fetchUrl,method:row.sourceId==="fred" ? "fred_api" : row.raw ? "treasury_raw_snapshot" : "treasury_fiscal_data_api",methodLabel:"美国财政官方原始数据",message:row.note} };
      const data = {name:row.name,unit:row.unit,freqLabel:frequency[row.granularity],metadata,fredSeriesId:row.fredId};
      const inst = await prisma.instrument.upsert({where:{code:existing?.code ?? row.code},create:{code:row.code,kind:row.raw ? InstrumentKind.OTHER : InstrumentKind.MACRO_SERIES,...data},update:data});
      const def=RELEASE_PACKAGE_CATALOG.find(p=>p.id===row.packageId)!;
      await prisma.dataSubscription.upsert({where:{instrumentId:inst.id},create:{instrumentId:inst.id,sourceId:row.sourceId,sourceSeriesKey:row.key,granularity:row.granularity,fetchMethod:DataFetchMethod.API,enabled:true,priority:48,releaseRule:def.release as object,releasePackageId:row.packageId,revisionLookback:row.raw ? 36 : 24,nextRunAt:new Date()},
        update:{sourceId:row.sourceId,sourceSeriesKey:row.key,granularity:row.granularity,...(row.raw?{}:{enabled:true}),releaseRule:def.release as object,releasePackageId:row.packageId,revisionLookback:row.raw ? 36 : 24}});
      await prisma.releasePackageMember.upsert({where:{instrumentId:inst.id},create:{instrumentId:inst.id,packageId:row.packageId},update:{packageId:row.packageId}});
      console.log(`[seed-fiscal] ${inst.code} → ${row.packageId}`);
    }
  }
  if (definitionsOnly) return;
  let failures=0;
  for (const row of rows) {
    const sub=await prisma.dataSubscription.findFirst({where:{instrument:row.fredId ? {fredSeriesId:row.fredId} : {code:row.code}},include:{source:true,instrument:true,releasePackage:true}});
    if(!sub) throw new Error(`订阅缺失：${row.code}`);
    const result=await runDataSubscription(prisma,sub,{force:true,skipCalendarRefresh:true,
      ...(process.argv.includes("--full-history") ? {fetchIncremental:()=>fetchSubscriptionIncremental(sub,"1950-01-01")} : {})});
    console.log(`[sync-fiscal] ${sub.instrument.code} ${result.status} +${result.rowsUpserted} ${result.error??""}`);
    if(result.status==="failed" || result.status==="partial") failures++;
  }
  clearFredCatalogCache();
  if(failures) throw new Error(`美国财政${failures}条订阅失败；请检查日志后重试`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());

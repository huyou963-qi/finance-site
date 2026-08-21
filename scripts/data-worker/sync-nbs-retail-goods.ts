/** 一次性发现并回填限额以上单位商品零售的全部分类叶子指标。 */
import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient } from "@prisma/client";
import { fetchChinaOfficial } from "../../src/lib/data/scheduler/chinaOfficialProxy";
import { defaultEconomicCalendarRule, computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { nbsRetailMonthlyRange } from "../../src/lib/data/scheduler/nbsRetail/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const base = "https://data.stats.gov.cn/dg/website/publicrelease/web/external";
const rootId = "fc982599aa684be7969d7b90b1bd0e84";
const headers = { Referer: "https://data.stats.gov.cn/dg/website/page.html", "User-Agent": "finance-site-data-scheduler/1.0" };
const metricSuffix: Record<string, string> = { 当期值: "cur", 累计值: "cum", 同比增长: "yoy", 累计增长: "cyoy" };

type Leaf = { _id: string; name: string };
type Indicator = { _id: string; i_showname: string };
type Period = { code: string; values: Array<{ _id: string; value: string }> };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchChinaOfficial(url, { ...init, headers: { ...headers, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`国家数据商品零售 HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
}

async function main() {
  const tree = await json<{ data: Leaf[] }>(`${base}/new/queryIndexTreeAsync?pid=7c05740ff94c4ac3ba77a8d0abeecc21&code=1`);
  const rule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  let series = 0;

  for (const leaf of tree.data) {
    const indicators = await json<{ data: { list: Indicator[] } }>(`${base}/new/queryIndicatorsByCid?cid=${leaf._id}`);
    const wanted = indicators.data.list.filter((item) => /(?:当期值|累计值|同比增长|累计增长)/.test(item.i_showname));
    const byId = new Map(wanted.map((item) => [item._id, item.i_showname]));
    const payload = await json<{ data: Period[] }>(`${base}/stream/esData`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: leaf._id, indicatorIds: wanted.map((item) => item._id), das: [{ text: "全国", value: "000000000000" }], dts: [nbsRetailMonthlyRange()], showType: "1", rootId }),
    });

    for (const [indicatorId, label] of byId) {
      const metric = label.match(/当期值|累计值|同比增长|累计增长/)?.[0] ?? "";
      const suffix = metricSuffix[metric];
      if (!suffix) continue;
      const code = `nbs_cn_retail_goods_${leaf._id.slice(0, 8)}_${suffix}`;
      const unit = /增长/.test(metric) ? "%" : "亿元";
      const instrument = await prisma.instrument.upsert({
        where: { code },
        create: {
          code, kind: InstrumentKind.MACRO_SERIES, name: `中国：限上商品零售：${leaf.name}${metric}`,
          shortName: `社零：${leaf.name}${metric}`, freqLabel: "月", unit,
          metadata: { countryCode: "CN", catalogCategory: "国内贸易与消费", displayName: `限上商品零售：${leaf.name}${metric}`, scrape: { provider: "nbs_retail", cid: leaf._id, indicatorId }, fetchAcquisition: { status: "known", method: "nbs_public_data_api" }, source: "国家统计局" },
          externalRefs: { catalogKey: `mds:${code}`, agencyId: "cn-nbs", sourceId: "nbs-retail" },
        },
        update: {},
      });
      await prisma.dataSubscription.upsert({
        where: { instrumentId: instrument.id },
        create: { instrumentId: instrument.id, sourceId: "nbs-retail", sourceSeriesKey: `${leaf._id}:${indicatorId}`, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: rule as object, nextRunAt: computeNextRunAt(rule, new Date()), enabled: true, priority: 42 },
        update: { enabled: true },
      });
      const points = payload.data.flatMap((period) => {
        const match = /^(\d{4})(\d{2})MM$/.exec(period.code);
        const value = period.values.find((item) => item._id === indicatorId)?.value;
        return match && value != null && String(value).trim() !== "" ? [{ obsDate: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)), value: Number(value) }] : [];
      }).filter((point) => Number.isFinite(point.value));
      await upsertMacroObservations(prisma, instrument.id, points);
      series++;
    }
  }
  console.log(`[sync-nbs-retail-goods] series=${series}`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

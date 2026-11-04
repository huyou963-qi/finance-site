/**
 * GDP nowcast 输入装载：实际/名义 GDP 与月度指标的历次版本读统一版本账本
 * （mds.macro_observation_vintage，ALFRED 回填 + worker 入库时自动追加），复用非农的账本读取器。
 * 不新增抓取或事实表。
 */
import { loadLedger } from "../usNfp/inputs";
import { GDP_INDICATORS, GDP_NOMINAL_CODE, GDP_REAL_CODE } from "./indicators";
import { addDays, addMonths, addQuarters, latestGdpQuarter, type GdpModelInputs, type RevisionLedger } from "./model";

export type GdpFreshness = { key: string; label: string; seriesKey: string; latestDate: string | null };

export type LoadedGdpInputs = GdpModelInputs & {
  /** 最新已公布季度（首发日 ≤ 今天） */
  latestQuarter: string;
  /** nowcast 目标季度 = 最新已公布季度的下一季 */
  targetQuarter: string;
  freshness: GdpFreshness[];
};

/** 季度 GDP 无版本记录时：季末后 30 天视为首发 */
const quarterFallback = (q: string) => addDays(addQuarters(q, 1), 29);
const monthFallback = (lagDays: number) => (m: string) => addDays(addMonths(m, 1), lagDays - 1);

export async function loadUsGdpNowcastInputs(today: string): Promise<LoadedGdpInputs> {
  // 逐个读取：12 本账本并发会一次占用二十多个数据库连接
  const real = await loadLedger(GDP_REAL_CODE, quarterFallback);
  const nominal = await loadLedger(GDP_NOMINAL_CODE, quarterFallback);
  const monthly: Array<Awaited<ReturnType<typeof loadLedger>>> = [];
  for (const d of GDP_INDICATORS) monthly.push(await loadLedger(d.code, monthFallback(d.lagDays)));
  const latestQuarter = latestGdpQuarter(real.ledger, today);
  if (!latestQuarter) throw new Error("实际 GDP（GDPC1）无可用版本");
  const monthlyLedgers: Record<string, RevisionLedger> = {};
  GDP_INDICATORS.forEach((d, i) => (monthlyLedgers[d.key] = monthly[i]!.ledger));
  return {
    gdp: real.ledger,
    nominalGdp: nominal.ledger,
    monthly: monthlyLedgers,
    latestQuarter,
    targetQuarter: addQuarters(latestQuarter, 1),
    freshness: [
      { key: "GDPC1", label: "实际 GDP（首发与修订版本）", seriesKey: "fred:GDPC1", latestDate: real.latest },
      { key: "GDP", label: "名义 GDP（换算分母）", seriesKey: "fred:GDP", latestDate: nominal.latest },
      ...GDP_INDICATORS.map((d, i) => ({ key: d.key, label: d.label, seriesKey: d.seriesKey, latestDate: monthly[i]!.latest })),
    ],
  };
}

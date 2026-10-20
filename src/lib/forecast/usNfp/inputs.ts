/**
 * 非农 nowcast 输入装载：非农 / ADP 的历次版本读统一版本账本（mds.macro_observation_vintage，
 * ALFRED 回填 + worker 入库时自动追加），周度申领走 `loadFredObservationMapsDbFirst`。
 * 不新增抓取或事实表。
 */
import { prisma } from "@/lib/prisma";
import { loadFredObservationMapsDbFirst } from "@/lib/data/fredDbFirst";
import { addMonths, type NfpModelInputs, type RevisionLedger, type WeeklyObs } from "./model";

export const PAYEMS_CODE = "sched_fred_PAYEMS";
export const ADP_CODE = "sched_fred_ADPMNUSNERSA";

export type NfpFreshness = { key: string; label: string; seriesKey: string; latestDate: string | null };

export type LoadedNfpInputs = NfpModelInputs & {
  /** ADP 私营就业历次版本（人） */
  adp: RevisionLedger;
  /** 最新已公布非农月 */
  latestNfpMonth: string;
  /** nowcast 目标月 = 最新已公布非农月的下一个月 */
  targetMonth: string;
  freshness: NfpFreshness[];
};

/**
 * 读某 FRED 仪器的版本账本；账本缺失的月份用当前观测补一条（视为次月 7 日首次可见），
 * 保证本地库未回填 ALFRED 时模型仍能运行。
 */
async function loadLedger(code: string): Promise<{ ledger: RevisionLedger; latest: string | null }> {
  const inst = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
  if (!inst) throw new Error(`宏观序列不存在：${code}`);
  const [vintages, obs] = await Promise.all([
    prisma.macroObservationVintage.findMany({
      where: { instrumentId: inst.id },
      orderBy: [{ obsDate: "asc" }, { availableAt: "asc" }],
      select: { obsDate: true, availableAt: true, value: true },
    }),
    prisma.macroObservation.findMany({
      where: { instrumentId: inst.id },
      orderBy: { obsDate: "asc" },
      select: { obsDate: true, value: true },
    }),
  ]);
  const ledger: RevisionLedger = new Map();
  for (const v of vintages) {
    const m = v.obsDate.toISOString().slice(0, 10);
    const at = v.availableAt.toISOString().slice(0, 10);
    const list = ledger.get(m) ?? [];
    // 同一天多条（ALFRED + worker 抓取）只保留当天最后一个值
    if (list.length && list[list.length - 1]!.at === at) list[list.length - 1]!.value = v.value;
    else list.push({ at, value: v.value });
    ledger.set(m, list);
  }
  for (const o of obs) {
    const m = o.obsDate.toISOString().slice(0, 10);
    if (!ledger.has(m)) ledger.set(m, [{ at: addMonths(m, 1).slice(0, 8) + "07", value: o.value }]);
  }
  return { ledger, latest: obs.length ? obs[obs.length - 1]!.obsDate.toISOString().slice(0, 10) : null };
}

function weekly(map: Map<string, number | null> | undefined): WeeklyObs {
  return [...(map ?? new Map())]
    .filter((e): e is [string, number] => e[1] != null && Number.isFinite(e[1]))
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function loadUsNfpNowcastInputs(): Promise<LoadedNfpInputs> {
  const [payems, adp, fred] = await Promise.all([
    loadLedger(PAYEMS_CODE),
    loadLedger(ADP_CODE),
    loadFredObservationMapsDbFirst(["ICSA", "CCSA"]),
  ]);
  if (!payems.latest) throw new Error("非农 PAYEMS 无观测");
  const icsa = weekly(fred.maps.get("ICSA"));
  const ccsa = weekly(fred.maps.get("CCSA"));
  const latestNfpMonth = payems.latest;
  return {
    payems: payems.ledger,
    adp: adp.ledger,
    icsa,
    ccsa,
    latestNfpMonth,
    targetMonth: addMonths(latestNfpMonth, 1),
    freshness: [
      { key: "PAYEMS", label: "非农就业（首发与修订版本）", seriesKey: "fred:PAYEMS", latestDate: latestNfpMonth },
      { key: "ICSA", label: "初请失业金人数（周）", seriesKey: "fred:ICSA", latestDate: icsa.at(-1)?.date ?? null },
      { key: "CCSA", label: "续请失业金人数（周）", seriesKey: "fred:CCSA", latestDate: ccsa.at(-1)?.date ?? null },
      { key: "ADP", label: "ADP 私营就业（第三方对照）", seriesKey: "fred:ADPMNUSNERSA", latestDate: adp.latest },
    ],
  };
}

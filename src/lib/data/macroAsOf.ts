/**
 * 宏观观测的近似 PIT（point-in-time）读取（Phase 0 / WS4）。
 *
 * MacroObservation 只存最新修订值、无 vintage，因此这里用「典型发布滞后」近似：
 * 一期数据在其周期结束后 lagDays 天才对市场可见。lagDays 推导优先级：
 * 1. DataSubscription.releaseRule 为 economic_calendar 且带 calendarMatch.releaseAt 时，
 *    以「releaseAt − 其覆盖周期的期末」为该序列的典型滞后（假定发布覆盖最近一个完整周期）；
 * 2. 否则按 granularity 的保守默认值。
 *
 * 已知局限（升级路径 = ALFRED vintage，见 Phase 0 备忘）：
 * - 返回的是最新修订值，不是当时首次发布值（修订序列如 GDP 会有前视残留）；
 * - lagDays 是常数近似，历史上发布日的月内漂移（假日顺延等）不建模。
 *
 * obsDate 口径：本库 FRED 风格，周期起始日（月度存月初、季度存季初）。
 */

import { prisma } from "@/lib/prisma";
import type { DataGranularity } from "@prisma/client";
import { parseReleaseRule, type ReleaseRule } from "@/lib/data/scheduler/releaseRule";

const DAY_MS = 86_400_000;

/** granularity 兜底典型滞后（周期结束 → 发布，天） */
export const DEFAULT_LAG_DAYS: Record<DataGranularity, number> = {
  DAILY: 1,
  WEEKLY: 5,
  MONTHLY: 15, // CPI ~13 天、NFP ~7 天、零售 ~16 天；取中庸偏保守
  QUARTERLY: 45, // GDP 初值 ~30 天，修订更晚
  ANNUAL: 90,
  IRREGULAR: 15,
};

export type MacroAsOfResult = {
  instrumentId: string;
  /** 查询时点 T（ISO 日期） */
  asOf: string;
  /** T 时点市场可见的最新一期观测 */
  obsDate: string;
  value: number;
  /** 该期的估算发布日（periodEnd + lagDays） */
  estimatedReleaseDate: string;
  lagDays: number;
  lagSource: "calendar" | "default";
  granularity: DataGranularity;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 周期起始日（obsDate 口径）→ 周期结束日 */
export function periodEnd(obsStartIso: string, granularity: DataGranularity): string {
  const d = new Date(`${obsStartIso}T00:00:00.000Z`);
  switch (granularity) {
    case "MONTHLY": {
      const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      return isoDate(e);
    }
    case "QUARTERLY": {
      const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 0));
      return isoDate(e);
    }
    case "ANNUAL": {
      const e = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), 0));
      return isoDate(e);
    }
    case "WEEKLY":
      return isoDate(new Date(d.getTime() + 6 * DAY_MS));
    case "DAILY":
    case "IRREGULAR":
    default:
      return obsStartIso;
  }
}

/**
 * 由日历发布时刻推导典型滞后：
 * releaseAt 覆盖的周期 = releaseAt 之前最近的完整周期，lag = releaseAt − 该周期期末。
 * 推导值超出合理带（1–120 天）时视为不可用（可能覆盖的不是最近一期）。
 */
export function lagDaysFromReleaseAt(
  releaseAtIso: string,
  granularity: DataGranularity,
): number | null {
  const releaseAt = new Date(releaseAtIso);
  if (Number.isNaN(releaseAt.getTime())) return null;

  let coveredEnd: Date;
  const y = releaseAt.getUTCFullYear();
  const m = releaseAt.getUTCMonth();
  if (granularity === "MONTHLY") {
    coveredEnd = new Date(Date.UTC(y, m, 0)); // 上月末
  } else if (granularity === "QUARTERLY") {
    const qStartMonth = Math.floor(m / 3) * 3;
    coveredEnd = new Date(Date.UTC(y, qStartMonth, 0)); // 上季末
  } else if (granularity === "ANNUAL") {
    coveredEnd = new Date(Date.UTC(y, 0, 0)); // 上年末
  } else {
    return null;
  }
  const lag = Math.round((releaseAt.getTime() - coveredEnd.getTime()) / DAY_MS);
  return lag >= 1 && lag <= 120 ? lag : null;
}

/** 从订阅自身 releaseRule 或所属 ReleasePackage.scheduleState 取日历发布时刻 */
function releaseAtFromSubscription(sub: {
  releaseRule: unknown;
  releasePackage: { scheduleState: unknown } | null;
}): string | null {
  const rule: ReleaseRule = parseReleaseRule(sub.releaseRule);
  if (rule.type === "economic_calendar" && rule.calendarMatch?.releaseAt) {
    return rule.calendarMatch.releaseAt;
  }
  // 包对齐调度：calendarMatch 存在 ReleasePackage.scheduleState（包内指标共享）
  const state = sub.releasePackage?.scheduleState as
    | { calendarMatch?: { releaseAt?: unknown } }
    | null
    | undefined;
  const releaseAt = state?.calendarMatch?.releaseAt;
  return typeof releaseAt === "string" ? releaseAt : null;
}

/** 解析 instrument 的典型发布滞后（订阅/包日历优先，granularity 默认值兜底） */
export async function resolveLagDays(
  instrumentId: string,
): Promise<{ lagDays: number; lagSource: "calendar" | "default"; granularity: DataGranularity }> {
  const sub = await prisma.dataSubscription.findUnique({
    where: { instrumentId },
    select: {
      granularity: true,
      releaseRule: true,
      releasePackage: { select: { scheduleState: true } },
    },
  });
  const granularity: DataGranularity = sub?.granularity ?? "MONTHLY";
  if (sub) {
    const releaseAt = releaseAtFromSubscription(sub);
    const fromCalendar = releaseAt ? lagDaysFromReleaseAt(releaseAt, granularity) : null;
    if (fromCalendar != null) {
      return { lagDays: fromCalendar, lagSource: "calendar", granularity };
    }
  }
  return { lagDays: DEFAULT_LAG_DAYS[granularity], lagSource: "default", granularity };
}

/**
 * T 日市场可见的最新宏观观测（近似 PIT）。
 * 可见判据：periodEnd(obsDate) + lagDays ≤ T。无可见观测返回 null。
 */
export async function getMacroValueAsOf(
  instrumentId: string,
  date: Date | string,
): Promise<MacroAsOfResult | null> {
  const t = typeof date === "string" ? date : isoDate(date);
  const { lagDays, lagSource, granularity } = await resolveLagDays(instrumentId);

  // 候选窗口：obsDate ≤ T（发布必在期末之后，故 obsDate > T 的期不可能可见）；
  // 取最近几期在 JS 里按估算发布日过滤，避免在 SQL 里做日期算术
  const candidates = await prisma.macroObservation.findMany({
    where: { instrumentId, obsDate: { lte: new Date(`${t}T00:00:00.000Z`) } },
    orderBy: { obsDate: "desc" },
    take: 8,
  });
  for (const obs of candidates) {
    const obsIso = isoDate(obs.obsDate);
    const end = periodEnd(obsIso, granularity);
    const est = isoDate(new Date(new Date(`${end}T00:00:00.000Z`).getTime() + lagDays * DAY_MS));
    if (est <= t) {
      return {
        instrumentId,
        asOf: t,
        obsDate: obsIso,
        value: obs.value,
        estimatedReleaseDate: est,
        lagDays,
        lagSource,
        granularity,
      };
    }
  }
  return null;
}

/** 便捷入口：按 Instrument.code 查（如 sched_fred_cpi_yoy 一类目录码） */
export async function getMacroValueAsOfByCode(
  code: string,
  date: Date | string,
): Promise<MacroAsOfResult | null> {
  const inst = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
  if (!inst) return null;
  return getMacroValueAsOf(inst.id, date);
}

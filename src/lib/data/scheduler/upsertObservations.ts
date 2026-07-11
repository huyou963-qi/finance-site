import type { PrismaClient } from "@prisma/client";
import type { ObservationPoint } from "./types";

const BATCH = 200;

export type UpsertObservationsResult = {
  /** 实际写库的行数（新增 + 值发生变化），不含无变化的空转覆盖 */
  upserted: number;
  /** 新插入的观测（库里原本没有该 obsDate） */
  inserted: number;
  /** 已存在但值被改写（多为源端修订） */
  changed: number;
  /** 已存在且值相同，跳过写库 */
  unchanged: number;
  /** 值非有限数被丢弃 */
  skipped: number;
  /** 本次入参里最新的 obsDate（无论是否写库），用于日志/展示 */
  latestObsDate: Date | null;
  /** latestObsDate 对应的值 */
  latestValue: number | null;
};

export async function upsertMacroObservations(
  prisma: PrismaClient,
  instrumentId: string,
  points: ObservationPoint[],
): Promise<UpsertObservationsResult> {
  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let latestObsDate: Date | null = null;
  let latestValue: number | null = null;

  for (let i = 0; i < points.length; i += BATCH) {
    const chunk = points.slice(i, i + BATCH);

    const valid = chunk.filter((p) => {
      if (!Number.isFinite(p.value)) {
        skipped += 1;
        return false;
      }
      return true;
    });

    for (const p of valid) {
      if (!latestObsDate || p.obsDate > latestObsDate) {
        latestObsDate = p.obsDate;
        latestValue = p.value;
      }
    }

    if (valid.length === 0) continue;

    // 一次性读回当前批次已存在的值，用来区分「新增 / 修订 / 无变化」，
    // 避免把相同值反复空转覆盖后仍被计成一次「upsert」。
    const existing = await prisma.macroObservation.findMany({
      where: {
        instrumentId,
        obsDate: { in: valid.map((p) => p.obsDate) },
      },
      select: { obsDate: true, value: true },
    });
    const existingByTime = new Map<number, number>();
    for (const row of existing) {
      existingByTime.set(row.obsDate.getTime(), row.value);
    }

    const toInsert: ObservationPoint[] = [];
    for (const p of valid) {
      const prev = existingByTime.get(p.obsDate.getTime());
      if (prev === undefined) {
        toInsert.push(p);
      } else if (prev !== p.value) {
        await prisma.macroObservation.update({
          where: { instrumentId_obsDate: { instrumentId, obsDate: p.obsDate } },
          data: { value: p.value },
        });
        changed += 1;
      } else {
        unchanged += 1;
      }
    }

    if (toInsert.length > 0) {
      const res = await prisma.macroObservation.createMany({
        data: toInsert.map((p) => ({
          instrumentId,
          obsDate: p.obsDate,
          value: p.value,
        })),
        skipDuplicates: true,
      });
      inserted += res.count;
      // createMany 因并发去重可能少写；差额记为无变化，保证计数守恒
      unchanged += toInsert.length - res.count;
    }
  }

  return {
    upserted: inserted + changed,
    inserted,
    changed,
    unchanged,
    skipped,
    latestObsDate,
    latestValue,
  };
}

export function maxObsDate(points: ObservationPoint[]): Date | null {
  if (points.length === 0) return null;
  return points.reduce((a, b) => (a.obsDate > b.obsDate ? a : b)).obsDate;
}

/** 按 revisionLookback 月截断增量起点（写入库的下界） */
export function observationStartDate(
  lastObsDate: Date | null,
  revisionLookbackMonths: number,
): string {
  if (!lastObsDate) return "1950-01-01";
  const d = new Date(
    Date.UTC(
      lastObsDate.getUTCFullYear(),
      lastObsDate.getUTCMonth() - revisionLookbackMonths,
      lastObsDate.getUTCDate(),
    ),
  );
  return d.toISOString().slice(0, 10);
}

/** YoY 同比需多拉水平值窗口，否则增量切片算不出去年同期 */
const YOY_FETCH_EXTRA_MONTHS = 14;

export function observationWindowForFetch(
  lastObsDate: Date | null,
  revisionLookbackMonths: number,
  options?: { yoyTransform?: boolean },
): { fetchStart: string; persistStart: string } {
  const persistStart = observationStartDate(lastObsDate, revisionLookbackMonths);
  if (!options?.yoyTransform) {
    return { fetchStart: persistStart, persistStart };
  }
  const d = new Date(`${persistStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - YOY_FETCH_EXTRA_MONTHS);
  return { fetchStart: d.toISOString().slice(0, 10), persistStart };
}

export function filterPointsFrom(
  points: ObservationPoint[],
  persistStart: string,
): ObservationPoint[] {
  const min = new Date(`${persistStart}T00:00:00Z`).getTime();
  return points.filter((p) => p.obsDate.getTime() >= min);
}

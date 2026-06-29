import type { PrismaClient } from "@prisma/client";
import type { ObservationPoint } from "./types";

const BATCH = 200;

export async function upsertMacroObservations(
  prisma: PrismaClient,
  instrumentId: string,
  points: ObservationPoint[],
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0;
  let skipped = 0;

  for (let i = 0; i < points.length; i += BATCH) {
    const chunk = points.slice(i, i + BATCH);
    for (const p of chunk) {
      if (!Number.isFinite(p.value)) {
        skipped += 1;
        continue;
      }
      await prisma.macroObservation.upsert({
        where: {
          instrumentId_obsDate: {
            instrumentId,
            obsDate: p.obsDate,
          },
        },
        create: {
          instrumentId,
          obsDate: p.obsDate,
          value: p.value,
        },
        update: { value: p.value },
      });
      upserted += 1;
    }
  }

  return { upserted, skipped };
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

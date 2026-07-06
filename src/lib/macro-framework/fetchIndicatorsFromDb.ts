import { InstrumentKind } from "@prisma/client";
import { applyFredTransform } from "@/lib/data/scheduler/fredTransform";
import type { FredSeriesTransform } from "@/lib/data/scheduler/fredTransform";
import { prisma } from "@/lib/prisma";
import { INDICATORS } from "./data";
import {
  FRAMEWORK_INDICATOR_CATALOG_KEYS,
  FRAMEWORK_SPARKLINE_POINTS,
} from "./indicatorCatalogKeys";
import {
  FRAMEWORK_INDICATOR_TRANSFORMS,
  isPlausibleFrameworkValue,
  rawObservationTake,
} from "./indicatorTransforms";

export type FrameworkIndicatorSnapshot = {
  value: number | null;
  prevValue: number | null;
  asOfDate: string | null;
  sparkline: number[];
};

export type FrameworkIndicatorsPayload = {
  indicators: Record<string, FrameworkIndicatorSnapshot>;
  fetchedAt: string;
};

type CatalogRef =
  | { kind: "fred"; fredId: string }
  | { kind: "mds"; code: string };

const UNIT_BY_ID = Object.fromEntries(INDICATORS.map((ind) => [ind.id, ind.unit]));

function parseCatalogKey(key: string): CatalogRef | null {
  if (key.startsWith("fred:")) {
    const fredId = key.slice(5).trim();
    return fredId ? { kind: "fred", fredId: fredId.toUpperCase() } : null;
  }
  if (key.startsWith("mds:")) {
    const code = key.slice(4).trim();
    return code ? { kind: "mds", code } : null;
  }
  return null;
}

function formatObsDate(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  if (iso.endsWith("-01")) return iso.slice(0, 7);
  return iso;
}

function emptySnapshot(): FrameworkIndicatorSnapshot {
  return {
    value: null,
    prevValue: null,
    asOfDate: null,
    sparkline: [],
  };
}

function transformRawPoints(
  rawDesc: { obsDate: Date; value: number }[],
  transform: FredSeriesTransform,
): { obsDate: Date; value: number }[] {
  const asc = [...rawDesc].reverse();
  const transformed = applyFredTransform(asc, transform);
  return [...transformed]
    .sort((a, b) => b.obsDate.getTime() - a.obsDate.getTime())
    .slice(0, FRAMEWORK_SPARKLINE_POINTS);
}

function buildSnapshot(
  points: { obsDate: Date; value: number }[],
  unit: string,
): FrameworkIndicatorSnapshot {
  if (points.length === 0) return emptySnapshot();

  const latest = points[0]!;
  const previous = points[1];
  const sparkline = [...points]
    .reverse()
    .map((p) => p.value)
    .filter((v) => isPlausibleFrameworkValue(unit, v));

  const value = isPlausibleFrameworkValue(unit, latest.value) ? latest.value : null;
  const prevValue =
    previous && isPlausibleFrameworkValue(unit, previous.value) ? previous.value : null;

  if (value === null) return emptySnapshot();

  return {
    value,
    prevValue,
    asOfDate: formatObsDate(latest.obsDate),
    sparkline: sparkline.length > 0 ? sparkline : [],
  };
}

/** 批量从 mds.MacroObservation 读取宏观框架各指标最近若干期观测（仅本地库，不回退 FRED 实时）。 */
export async function fetchFrameworkIndicatorsFromDb(): Promise<FrameworkIndicatorsPayload> {
  const indicatorIds = Object.keys(FRAMEWORK_INDICATOR_CATALOG_KEYS);
  const refsByIndicator = new Map<string, CatalogRef>();
  const fredIds = new Set<string>();
  const mdsCodes = new Set<string>();

  for (const id of indicatorIds) {
    const ref = parseCatalogKey(FRAMEWORK_INDICATOR_CATALOG_KEYS[id] ?? "");
    if (!ref) continue;
    refsByIndicator.set(id, ref);
    if (ref.kind === "fred") fredIds.add(ref.fredId);
    else mdsCodes.add(ref.code);
  }

  const [fredInsts, mdsInsts] = await Promise.all([
    fredIds.size > 0
      ? prisma.instrument.findMany({
          where: {
            kind: InstrumentKind.MACRO_SERIES,
            fredSeriesId: { in: [...fredIds] },
          },
          select: { id: true, fredSeriesId: true },
        })
      : [],
    mdsCodes.size > 0
      ? prisma.instrument.findMany({
          where: {
            kind: InstrumentKind.MACRO_SERIES,
            code: { in: [...mdsCodes] },
          },
          select: { id: true, code: true },
        })
      : [],
  ]);

  const instIdByFred = new Map<string, string>();
  for (const inst of fredInsts) {
    const fid = inst.fredSeriesId?.trim().toUpperCase();
    if (fid && !instIdByFred.has(fid)) instIdByFred.set(fid, inst.id);
  }

  const instIdByMdsCode = new Map<string, string>();
  for (const inst of mdsInsts) {
    if (!instIdByMdsCode.has(inst.code)) instIdByMdsCode.set(inst.code, inst.id);
  }

  const indicatorInstId = new Map<string, string>();
  for (const [indicatorId, ref] of refsByIndicator) {
    const instId =
      ref.kind === "fred"
        ? instIdByFred.get(ref.fredId)
        : instIdByMdsCode.get(ref.code);
    if (instId) indicatorInstId.set(indicatorId, instId);
  }

  const indicators: Record<string, FrameworkIndicatorSnapshot> = {};

  await Promise.all(
    indicatorIds.map(async (id) => {
      const instId = indicatorInstId.get(id);
      if (!instId) {
        indicators[id] = emptySnapshot();
        return;
      }

      const transform = FRAMEWORK_INDICATOR_TRANSFORMS[id] ?? "none";
      const take = rawObservationTake(id, transform);
      const unit = UNIT_BY_ID[id] ?? "";

      const raw = await prisma.macroObservation.findMany({
        where: { instrumentId: instId },
        orderBy: { obsDate: "desc" },
        take,
        select: { obsDate: true, value: true },
      });

      const points = transform === "none" ? raw : transformRawPoints(raw, transform);
      indicators[id] = buildSnapshot(points, unit);
    }),
  );

  return {
    indicators,
    fetchedAt: new Date().toISOString(),
  };
}

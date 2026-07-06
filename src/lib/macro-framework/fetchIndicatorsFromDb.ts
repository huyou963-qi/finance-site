import { InstrumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  FRAMEWORK_INDICATOR_CATALOG_KEYS,
  FRAMEWORK_SPARKLINE_POINTS,
} from "./indicatorCatalogKeys";

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

function buildSnapshot(
  points: { obsDate: Date; value: number }[],
): FrameworkIndicatorSnapshot {
  if (points.length === 0) return emptySnapshot();

  const latest = points[0];
  const previous = points[1];
  const sparkline = [...points]
    .reverse()
    .map((p) => p.value);

  return {
    value: latest.value,
    prevValue: previous?.value ?? null,
    asOfDate: formatObsDate(latest.obsDate),
    sparkline,
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

  const instIds = [...new Set(indicatorInstId.values())];
  const obsByInst = new Map<string, { obsDate: Date; value: number }[]>();

  if (instIds.length > 0) {
    // 每个序列只取最近 N 期，避免全历史扫描（数十万行超时）导致页面全 N/A。
    const batches = await Promise.all(
      instIds.map((instrumentId) =>
        prisma.macroObservation.findMany({
          where: { instrumentId },
          orderBy: { obsDate: "desc" },
          take: FRAMEWORK_SPARKLINE_POINTS,
          select: { obsDate: true, value: true },
        }),
      ),
    );
    for (let i = 0; i < instIds.length; i++) {
      const rows = batches[i];
      if (rows.length > 0) obsByInst.set(instIds[i], rows);
    }
  }

  const indicators: Record<string, FrameworkIndicatorSnapshot> = {};
  for (const id of indicatorIds) {
    const instId = indicatorInstId.get(id);
    if (!instId) {
      indicators[id] = emptySnapshot();
      continue;
    }
    indicators[id] = buildSnapshot(obsByInst.get(instId) ?? []);
  }

  return {
    indicators,
    fetchedAt: new Date().toISOString(),
  };
}

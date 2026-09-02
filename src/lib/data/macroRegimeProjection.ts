import { prisma } from "@/lib/prisma";
import type { MacroPayload } from "@/lib/data/types";
import {
  MACRO_REGIME_CODES,
  MACRO_REGIME_SERIES,
  type MacroRegimeBand,
  type MacroRegimeKey,
} from "@/lib/data/macroRegimeBands";

type RegimeInputs = { growthZ?: unknown; inflationMomZ?: unknown };

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function fetchMacroRegimeProjection(
  requestedCodes: readonly string[],
): Promise<Pick<MacroPayload, "categories" | "series" | "attribution"> | null> {
  const codes = requestedCodes.filter((code) => MACRO_REGIME_CODES.has(code));
  if (codes.length === 0) return null;
  const rows = await prisma.macroRegime.findMany({
    orderBy: { date: "asc" },
    select: { date: true, inputs: true },
  });
  const categories = rows.map((row) => row.date.toISOString().slice(0, 10));
  const inputs = rows.map((row) => row.inputs as RegimeInputs);
  const defs = Object.values(MACRO_REGIME_SERIES);
  return {
    categories,
    series: codes.flatMap((code) => {
      const def = defs.find((item) => item.code === code);
      if (!def) return [];
      return [{
        name: def.label,
        key: def.key,
        data: inputs.map((item) =>
          code === MACRO_REGIME_SERIES.growthZ.code
            ? finite(item.growthZ)
            : finite(item.inflationMomZ),
        ),
      }];
    }),
    attribution: "PostgreSQL mds.MacroRegime（量化 Regime 同源）",
  };
}

function isRegimeKey(value: string | null): value is MacroRegimeKey {
  return value === "goldilocks" || value === "reflation" || value === "stagflation" || value === "deflation";
}

export async function listMacroRegimeBands(): Promise<MacroRegimeBand[]> {
  const rows = await prisma.macroRegime.findMany({
    where: { dalioRegime: { not: null } },
    orderBy: { date: "asc" },
    select: { date: true, dalioRegime: true },
  });
  const bands: MacroRegimeBand[] = [];
  for (const row of rows) {
    if (!isRegimeKey(row.dalioRegime)) continue;
    const label = row.date.toISOString().slice(0, 10);
    const y = row.date.getUTCFullYear();
    const m = row.date.getUTCMonth();
    const startMs = Date.UTC(y, m, 1);
    const endMs = Date.UTC(y, m + 1, 1) - 1;
    const previous = bands[bands.length - 1];
    if (previous?.regime === row.dalioRegime && startMs <= previous.endMs + 86_400_000) {
      previous.endMs = endMs;
      previous.endLabel = label;
      continue;
    }
    bands.push({ startMs, endMs, startLabel: label, endLabel: label, regime: row.dalioRegime });
  }
  return bands;
}

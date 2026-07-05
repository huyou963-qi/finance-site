import type { MacroPayload } from "./types";
import { InstrumentKind } from "@prisma/client";
import { fetchFredSeriesMultiple } from "./fred";
import { fetchFredSeriesMultipleDbFirst } from "./fredDbFirst";
import { fetchWorldBankSeries } from "./worldbank";
import { indicatorLabel, selectionKey, type MacroSelection } from "./macroCatalog";
import { prisma } from "@/lib/prisma";

/** 内置模板的 fred: 序列默认优先读本地库（缺失才实时）；MACRO_FRED_DB_FIRST=0 回退纯实时 */
function fredDbFirstEnabled(): boolean {
  return process.env.MACRO_FRED_DB_FIRST !== "0";
}

type UnifiedSourcePayload = Pick<MacroPayload, "categories" | "series" | "attribution">;

function parseTimeLabelToUtcMs(label: string): number | null {
  if (/^\d{4}$/.test(label)) return Date.UTC(Number(label), 0, 1);
  if (/^\d{4}-\d{2}$/.test(label)) {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7)) - 1;
    return Date.UTC(y, m, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7)) - 1;
    const d = Number(label.slice(8, 10));
    return Date.UTC(y, m, d);
  }
  const parsed = Date.parse(label);
  return Number.isFinite(parsed) ? parsed : null;
}

function mergePayloads(parts: UnifiedSourcePayload[]): Pick<MacroPayload, "categories" | "series"> {
  const timeSet = new Set<string>();
  for (const part of parts) {
    for (const t of part.categories) timeSet.add(t);
  }

  const categories = [...timeSet].sort((a, b) => {
    const ta = parseTimeLabelToUtcMs(a);
    const tb = parseTimeLabelToUtcMs(b);
    if (ta !== null && tb !== null) return ta - tb;
    if (ta !== null) return -1;
    if (tb !== null) return 1;
    return a.localeCompare(b);
  });

  const series = parts.flatMap((part) =>
    part.series.map((s) => {
      const valByTs = new Map<string, number | null>();
      part.categories.forEach((ts, idx) => {
        valByTs.set(ts, s.data[idx] ?? null);
      });
      return {
        ...s,
        data: categories.map((ts) => (valByTs.has(ts) ? (valByTs.get(ts) ?? null) : null)),
      };
    }),
  );

  return { categories, series };
}

/** 统一宏观：支持 FRED（高频）+ World Bank（多国年频） */
export async function fetchUnifiedMacro(
  selectionKeys: string[],
  allowlist?: Set<string>,
): Promise<MacroPayload> {
  const keys = selectionKeys.filter((k) => {
    if (allowlist && allowlist.size > 0) {
      if (k.startsWith("fred:")) {
        const base = k.slice(5).split("::")[0]?.trim();
        if (base && allowlist.has(`fred:${base}`)) return true;
      }
      return allowlist.has(k);
    }
    return k.startsWith("fred:") || k.startsWith("wb:") || k.startsWith("mds:");
  });

  const fredIds = new Set<string>();
  const wbSelections = new Map<string, MacroSelection>();
  const mdsCodes = new Set<string>();
  for (const key of keys) {
    if (key.startsWith("fred:")) {
      const id = key.slice(5).split("::")[0]?.trim();
      if (id) fredIds.add(id);
      continue;
    }
    if (key.startsWith("mds:")) {
      const code = key.slice(4).split("::")[0]?.trim();
      if (code) mdsCodes.add(code);
      continue;
    }
    if (!key.startsWith("wb:")) continue;
    const seg = key.split(":");
    if (seg.length < 3) continue;
    const country = seg[1]?.trim().toUpperCase();
    const indicator = seg.slice(2).join(":").trim();
    if (!country || !indicator) continue;
    wbSelections.set(selectionKey(country, indicator), { country, indicator });
  }

  if (fredIds.size === 0 && wbSelections.size === 0 && mdsCodes.size === 0) {
    throw new Error("至少选择一条宏观指标");
  }

  const parts: UnifiedSourcePayload[] = [];

  if (fredIds.size > 0) {
    const payload = fredDbFirstEnabled()
      ? await fetchFredSeriesMultipleDbFirst([...fredIds])
      : await fetchFredSeriesMultiple([...fredIds]);
    const seriesByFredId = new Map<string, (typeof payload.series)[number]>();
    for (const s of payload.series) {
      const m = /\(([A-Z0-9._-]+)\)\s*$/.exec(s.name);
      const id = m?.[1];
      if (id) seriesByFredId.set(id, { ...s, key: `fred:${id}` });
    }
    const virtualFredKeys = keys.filter((k) => k.startsWith("fred:"));
    const expandedSeries = virtualFredKeys
      .map((virtualKey) => {
        const baseId = virtualKey.slice(5).split("::")[0]?.trim();
        if (!baseId) return null;
        const base = seriesByFredId.get(baseId);
        if (!base) return null;
        return { ...base, key: virtualKey };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    parts.push({
      categories: payload.categories,
      series: expandedSeries.length > 0 ? expandedSeries : payload.series,
      attribution: "FRED（St. Louis Fed）",
    });
  }

  if (wbSelections.size > 0) {
    const payload = await fetchWorldBankSeries([...wbSelections.values()]);
    parts.push({
      categories: payload.categories,
      series: payload.series.map((s) => {
        const [country, ...rest] = (s.key ?? "").split(":");
        const indicator = rest.join(":");
        const key = country && indicator ? `wb:${country}:${indicator}` : s.key;
        return {
          ...s,
          key,
          name:
            country && indicator
              ? `${s.name.split(" — ")[0]} — ${indicatorLabel(indicator)}`
              : s.name,
        };
      }),
      attribution: "World Bank Open Data",
    });
  }

  if (mdsCodes.size > 0) {
    const insts = await prisma.instrument.findMany({
      where: {
        kind: InstrumentKind.MACRO_SERIES,
        code: { in: [...mdsCodes] },
      },
      select: { id: true, code: true, name: true, shortName: true, metadata: true },
    });
    if (insts.length > 0) {
      const obs = await prisma.macroObservation.findMany({
        where: { instrumentId: { in: insts.map((x) => x.id) } },
        orderBy: { obsDate: "asc" },
        select: { instrumentId: true, obsDate: true, value: true },
      });
      const dateSet = new Set<string>();
      const byInst = new Map<string, Map<string, number>>();
      for (const o of obs) {
        const d = o.obsDate.toISOString().slice(0, 10);
        dateSet.add(d);
        const m = byInst.get(o.instrumentId) ?? new Map<string, number>();
        m.set(d, o.value);
        byInst.set(o.instrumentId, m);
      }
      const categories = [...dateSet].sort();
      const codeByInst = new Map(insts.map((i) => [i.code, i]));
      const virtualMdsKeys = keys.filter((k) => k.startsWith("mds:"));
      parts.push({
        categories,
        series: virtualMdsKeys
          .map((virtualKey) => {
            const code = virtualKey.slice(4).split("::")[0]?.trim();
            if (!code) return null;
            const inst = codeByInst.get(code);
            if (!inst) return null;
            const m = byInst.get(inst.id) ?? new Map();
            const md =
              inst.metadata && typeof inst.metadata === "object"
                ? (inst.metadata as Record<string, unknown>)
                : {};
            const displayName =
              typeof md.displayName === "string" && md.displayName.trim()
                ? md.displayName.trim()
                : inst.shortName?.trim() || inst.name;
            return {
              name: displayName,
              key: virtualKey,
              data: categories.map((d) => (m.has(d) ? (m.get(d) ?? null) : null)),
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x)),
        attribution: "本机 PostgreSQL mds.MacroObservation",
      });
    }
  }

  const merged = mergePayloads(parts);
  const attribution = parts
    .map((p) => p.attribution)
    .filter((x): x is string => Boolean(x))
    .join(" + ");

  return {
    title: `宏观数据（${merged.series.length} 条）`,
    source: "unified",
    categories: merged.categories,
    series: merged.series,
    attribution: attribution ? `数据来源：${attribution}` : undefined,
  };
}

import { InstrumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchFredObservationsMap } from "./fred";
import { fredSeriesLabel } from "./macroCatalog";
import type { MacroPayload } from "./types";

/**
 * 「库优先」FRED 取数：内置模板（unified 路径）用。
 *
 * 每条 FRED 序列先查本地 `mds.MacroObservation`（由数据调度器持续更新）；库中已有观测的
 * 序列**完全不请求 FRED**，缺失的才实时回退。因为入库时 obsDate 由 `fredAdapter` 以
 * `Date.UTC` 保存 FRED 原始日期，`obsDate.toISOString().slice(0,10)` 与实时
 * `fetchFredObservationsMap` 的日期串逐字节一致，故两路径对同一序列产出等价的
 * `Map<dateStr, value>`，前端对齐/重采样逻辑无需改动。
 *
 * 开关：`MACRO_FRED_DB_FIRST=0` 可整体回退为纯实时（沿用 `fetchFredSeriesMultiple`）。
 */

export type FredDbFirstResult = {
  /** upper FRED id → (dateStr "YYYY-MM-DD" → value|null) */
  maps: Map<string, Map<string, number | null>>;
  /** upper FRED id → 该序列取自库还是实时 */
  sources: Map<string, "db" | "live">;
};

export async function loadFredObservationMapsDbFirst(
  idsRaw: string[],
): Promise<FredDbFirstResult> {
  const ids = [
    ...new Set(idsRaw.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const maps = new Map<string, Map<string, number | null>>();
  const sources = new Map<string, "db" | "live">();
  if (ids.length === 0) return { maps, sources };

  // 1) 批量查库：fredSeriesId 命中的 Instrument 及其观测
  const insts = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES, fredSeriesId: { in: ids } },
    select: { id: true, fredSeriesId: true },
  });
  const instIdByFred = new Map<string, string>();
  for (const inst of insts) {
    const fid = inst.fredSeriesId?.trim().toUpperCase();
    if (fid && !instIdByFred.has(fid)) instIdByFred.set(fid, inst.id);
  }

  const instIds = [...instIdByFred.values()];
  if (instIds.length > 0) {
    const obs = await prisma.macroObservation.findMany({
      where: { instrumentId: { in: instIds } },
      orderBy: { obsDate: "asc" },
      select: { instrumentId: true, obsDate: true, value: true },
    });
    const byInst = new Map<string, Map<string, number | null>>();
    for (const o of obs) {
      const d = o.obsDate.toISOString().slice(0, 10);
      let m = byInst.get(o.instrumentId);
      if (!m) {
        m = new Map<string, number | null>();
        byInst.set(o.instrumentId, m);
      }
      m.set(d, o.value);
    }
    for (const [fid, instId] of instIdByFred) {
      const m = byInst.get(instId);
      if (m && m.size > 0) {
        maps.set(fid, m);
        sources.set(fid, "db");
      }
    }
  }

  // 2) 库中无观测的序列 → 实时回退（保持与纯实时相同的错误语义）
  const missing = ids.filter((id) => !maps.has(id));
  if (missing.length > 0) {
    const apiKey = process.env.FRED_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        `未配置 FRED_API_KEY，且以下序列不在本地库中：${missing.join(", ")}`,
      );
    }
    await Promise.all(
      missing.map(async (id) => {
        if (!/^[A-Z0-9._-]+$/.test(id)) {
          throw new Error(`无效的 FRED series id：${id}`);
        }
        const m = await fetchFredObservationsMap(id, apiKey);
        maps.set(id, m);
        sources.set(id, "live");
      }),
    );
  }

  return { maps, sources };
}

/** 与 `fetchFredSeriesMultiple` 同结构的返回，但优先取本地库 */
export async function fetchFredSeriesMultipleDbFirst(
  idsRaw: string[],
): Promise<MacroPayload> {
  const { maps, sources } = await loadFredObservationMapsDbFirst(idsRaw);
  const unique = [...maps.keys()];
  if (unique.length === 0) {
    throw new Error("至少选择一条 FRED 序列");
  }

  const dateSet = new Set<string>();
  for (const m of maps.values()) {
    for (const d of m.keys()) dateSet.add(d);
  }
  const categories = [...dateSet].sort();

  const series = unique.map((id) => {
    const m = maps.get(id)!;
    return {
      name: `${fredSeriesLabel(id)} (${id})`,
      data: categories.map((d) => (m.has(d) ? (m.get(d) ?? null) : null)),
      key: `fred:${id}`,
    };
  });

  const dbCount = [...sources.values()].filter((s) => s === "db").length;
  const liveCount = unique.length - dbCount;
  const attributionParts: string[] = [];
  if (dbCount > 0) attributionParts.push(`本地库 ${dbCount} 条`);
  if (liveCount > 0) attributionParts.push(`FRED 实时 ${liveCount} 条`);

  return {
    title: `美联储 FRED（${unique.length} 条序列）`,
    source: "fred",
    categories,
    series,
    attribution: `FRED / St. Louis Fed（${attributionParts.join("，")}）`,
  };
}

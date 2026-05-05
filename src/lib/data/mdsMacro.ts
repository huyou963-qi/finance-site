import { prisma } from "@/lib/prisma";
import type { MacroPayload } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseIds(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s)),
    ),
  ].slice(0, 20);
}

/** 从 mds.MacroObservation 组装与 FRED 相同结构的 payload（按日期并集对齐）。 */
export async function fetchMdsMacroFromRequest(
  instrumentsParam: string | null,
): Promise<MacroPayload> {
  const ids = parseIds(instrumentsParam);
  if (ids.length === 0) {
    throw new Error("请提供有效的 instrumentId（UUID，多个用逗号分隔）");
  }

  const insts = await prisma.instrument.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, code: true },
  });
  if (insts.length === 0) {
    throw new Error("未找到任何标的，请检查 instrumentId");
  }

  const orderMap = new Map(ids.map((id, i) => [id, i]));
  insts.sort(
    (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
  );

  const obs = await prisma.macroObservation.findMany({
    where: { instrumentId: { in: insts.map((i) => i.id) } },
    orderBy: { obsDate: "asc" },
    select: { instrumentId: true, obsDate: true, value: true },
  });

  const dateSet = new Set<string>();
  const byInst = new Map<string, Map<string, number>>();
  for (const o of obs) {
    const d = o.obsDate.toISOString().slice(0, 10);
    dateSet.add(d);
    if (!byInst.has(o.instrumentId)) byInst.set(o.instrumentId, new Map());
    byInst.get(o.instrumentId)!.set(d, o.value);
  }

  const categories = [...dateSet].sort();

  const series = insts.map((inst) => {
    const m = byInst.get(inst.id) ?? new Map();
    return {
      name: inst.name,
      data: categories.map((d) => (m.has(d) ? m.get(d)! : null)),
      key: `mds:${inst.id}`,
    };
  });

  return {
    title: `本地宏观库（${insts.length} 条序列）`,
    source: "mds",
    categories,
    series,
    attribution: "数据来自本机 PostgreSQL mds.MacroObservation。",
  };
}

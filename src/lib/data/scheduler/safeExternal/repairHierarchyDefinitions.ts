import type { PrismaClient } from "@prisma/client";
import reviewed from "./reviewedHierarchyDefinitions.json";

/** Offline, atomic, bounded definition-only migration. No observation/schedule access. */
export async function repairSafeHierarchyDefinitions(prisma: PrismaClient) {
  return prisma.$transaction(async tx => {
    const rows = await tx.instrument.findMany({ where: { code: { in: reviewed.map(row => row.code) } },
      select: { id: true, code: true, name: true, shortName: true, metadata: true,
        dataSubscription: { select: { sourceId: true, sourceSeriesKey: true } } } });
    const planned = rows.map(old => {
      const definition = reviewed.find(row => row.code === old.code)!;
      const name = `中国：外汇与国际收支：${definition.displayName}`;
      const previous = old.metadata && typeof old.metadata === "object" && !Array.isArray(old.metadata) ? old.metadata : {};
      const scrape = previous.scrape && typeof previous.scrape === "object" && !Array.isArray(previous.scrape) ? previous.scrape : {};
      if (old.dataSubscription?.sourceId !== "safe-external" || old.dataSubscription.sourceSeriesKey !== definition.sourceSeriesKey)
        throw new Error(`SAFE 定义修复来源键变化：${old.code}`);
      if (![definition.previousName, name].includes(old.name)) throw new Error(`SAFE 定义修复名称已经另行更改：${old.code}`);
      if (typeof scrape.sourceRowPath === "string" && scrape.sourceRowPath !== definition.sourceRowPath)
        throw new Error(`SAFE 定义修复父级已经另行更改：${old.code}`);
      return { old, definition, name, previous, scrape };
    }); // Validate every existing member before any write; absent/retired members stay absent.
    let changed = 0;
    for (const { old, definition, name, previous, scrape } of planned) {
      if (old.name === name && old.shortName === definition.displayName && previous.displayName === definition.displayName
        && scrape.sourceRowPath === definition.sourceRowPath && previous.periodSemantics === definition.periodSemantics
        && previous.safeDefinitionAudit === "2026-10-30") continue;
      await tx.instrument.update({ where: { id: old.id }, data: {
        name, shortName: definition.displayName, description: `国家外汇管理局${definition.displayName}；保留官方披露值及修订，不推算未公布数值。`,
        metadata: { ...previous, displayName: definition.displayName, periodSemantics: definition.periodSemantics,
          scrape: { ...scrape, sourceRowPath: definition.sourceRowPath }, safeDefinitionAudit: "2026-10-30",
          safeDefinitionEvidence: { sourceUrl: definition.sourceUrl, rawSheet: definition.rawSheet, rawRow: definition.rawRow } },
      } });
      changed++;
    }
    return { reviewed: reviewed.length, existing: rows.length, changed, absent: reviewed.length - rows.length };
  }, { isolationLevel: "Serializable", timeout: 15_000 });
}

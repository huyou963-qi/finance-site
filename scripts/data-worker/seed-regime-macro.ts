import { InstrumentKind } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { MACRO_REGIME_CATALOG_ITEMS } from "../../src/lib/data/macroRegimeBands";

async function main() {
  for (const def of MACRO_REGIME_CATALOG_ITEMS) {
    const isOverlay = def.code === "quant_regime_quadrant_band";
    const description = isOverlay
      ? "宏观图表背景覆盖层；象限事实只存于 mds.macro_regime.dalio_regime。"
      : "量化 MacroRegime 的宏观图表只读投影；数值事实只存于 mds.macro_regime.inputs。";
    const metadata = {
      countryCode: "US",
      countryNameZh: "美国",
      displayName: def.label,
      catalogCategory: "国民经济",
      catalogKey: def.key,
      source: "mds.MacroRegime",
      sourceTag: "quant-macro-regime-projection",
      derivedFrom: isOverlay ? "mds.macro_regime.dalio_regime" : "mds.macro_regime.inputs",
      ...(isOverlay ? { overlayKind: "macro-regime-quadrant-band" } : {}),
      projectionOnly: true,
      rebuildCommand: "npm run quant:build-regime",
    };
    await prisma.instrument.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `美国：宏观 Regime：${def.label}`,
        shortName: def.label,
        description,
        freqLabel: "月",
        unit: def.unit,
        metadata,
        externalRefs: { catalogKey: def.key, sourceTable: "mds.macro_regime" },
      },
      update: {
        name: `美国：宏观 Regime：${def.label}`,
        shortName: def.label,
        description,
        freqLabel: "月",
        unit: def.unit,
        metadata,
        externalRefs: { catalogKey: def.key, sourceTable: "mds.macro_regime" },
      },
    });
  }
  console.log(`[data:seed-regime-macro] 完成：${MACRO_REGIME_CATALOG_ITEMS.length} 个只读目录投影/覆盖层`);
}

main().finally(() => prisma.$disconnect());

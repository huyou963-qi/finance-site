import { InstrumentKind } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { MACRO_REGIME_SERIES } from "../../src/lib/data/macroRegimeBands";

async function main() {
  for (const def of Object.values(MACRO_REGIME_SERIES)) {
    const metadata = {
      countryCode: "US",
      countryNameZh: "美国",
      displayName: def.label,
      catalogCategory: "国民经济",
      catalogKey: def.key,
      source: "mds.MacroRegime",
      sourceTag: "quant-macro-regime-projection",
      derivedFrom: "mds.macro_regime.inputs",
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
        description: "量化 MacroRegime 的宏观图表只读投影；数值事实只存于 mds.macro_regime。",
        freqLabel: "月",
        unit: "z",
        metadata,
        externalRefs: { catalogKey: def.key, sourceTable: "mds.macro_regime" },
      },
      update: {
        name: `美国：宏观 Regime：${def.label}`,
        shortName: def.label,
        description: "量化 MacroRegime 的宏观图表只读投影；数值事实只存于 mds.macro_regime。",
        freqLabel: "月",
        unit: "z",
        metadata,
        externalRefs: { catalogKey: def.key, sourceTable: "mds.macro_regime" },
      },
    });
  }
  console.log(`[data:seed-regime-macro] 完成：${Object.keys(MACRO_REGIME_SERIES).length} 个只读目录投影`);
}

main().finally(() => prisma.$disconnect());

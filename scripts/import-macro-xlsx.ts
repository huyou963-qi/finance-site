/**
 * 通用宏观 Excel 历史导入（唯一入口）
 *
 * 列头格式：{国家}:{指标名}:{子维度}，A 列为周期（指标名称）
 *
 * npm run db:import-macro-xlsx -- --file="C:/path/国家偿债能力.xlsx" --preset=debtcap
 * npm run db:import-macro-xlsx -- --file="..." --scope=custom --theme=自定义主题 --freq=季度 --unit=%
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { importMacroWorkbookSeries, planMacroWorkbookImport } from "../src/lib/data/xlsx/importMacroWorkbook";
import {
  DEFAULT_COUNTRY_CODE_BY_ZH,
  listImportPresetNames,
  resolveImportPreset,
} from "../src/lib/data/xlsx/importPresets";
import { readMacroWorkbookSeries } from "../src/lib/data/xlsx/macroWorkbookLayout";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  return hit?.split("=").slice(1).join("=");
}

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const file = argValue("file");
  if (!file) {
    console.error(
      "用法: npm run db:import-macro-xlsx -- --file=path.xlsx [--preset=debtcap|ism | --scope=... --theme=...] [--dry-run]",
    );
    process.exit(1);
  }

  const dryRun = argFlag("dry-run");
  const presetName = argValue("preset");
  const preset = presetName ? resolveImportPreset(presetName) : null;
  if (presetName && !preset) {
    console.error(
      `未知 preset：${presetName}（可用：${listImportPresetNames().join("、")}）`,
    );
    process.exit(1);
  }

  const scope = argValue("scope") ?? preset?.scope ?? "macro";
  const theme = argValue("theme") ?? preset?.categoryThemeName ?? scope;
  const sheet = argValue("sheet");
  const freqLabel = argValue("freq") ?? preset?.freqLabel ?? "季度";
  const unit = argValue("unit") ?? preset?.unit ?? "%";

  const { sheetName, series } = readMacroWorkbookSeries(file, sheet);
  const config = {
    scope,
    freqLabel,
    unit,
    sourceTag: `${scope}-xlsx`,
    categoryThemeName: theme,
    countryCodeByZh: preset?.countryCodeByZh ?? DEFAULT_COUNTRY_CODE_BY_ZH,
    metricCodeByZh: preset?.metricCodeByZh,
    sectorCodeByZh: preset?.sectorCodeByZh,
    catalogCategoryByMetricZh: preset?.catalogCategoryByMetricZh,
  };

  if (dryRun) {
    const plan = planMacroWorkbookImport(series, config);
    const active = plan.filter((r) => !r.skipped);
    const points = active.reduce((n, r) => n + r.pointCount, 0);
    console.info(`[dry-run] file=${file} sheet=${sheetName} theme=${theme}`);
    console.info(`[dry-run] 序列 ${active.length} 条（跳过 ${plan.length - active.length}），观测点 ${points} 个`);
    for (const row of plan) {
      if (row.skipped) {
        console.warn(`  [skip] ${row.header} — ${row.skipReason}`);
        continue;
      }
      console.info(
        `  ${row.code} | ${row.catalogCategory} | ${row.freqLabel} ${row.unit} | points=${row.pointCount} ${row.dateFrom ?? "—"}..${row.dateTo ?? "—"}`,
      );
      console.info(`         tree: ${row.treePath}`);
      if (row.nameEn) console.info(`         en: ${row.nameEn}`);
    }
    console.info("[dry-run] 未写入数据库。确认无误后去掉 --dry-run 再导入。");
    return;
  }

  const result = await importMacroWorkbookSeries(prisma, {
    xlsxPath: file,
    sheetName,
    series,
    config,
  });

  console.info(
    `[done] file=${file} sheet=${sheetName} theme=${theme} series=${result.importedSeries} points=${result.importedPoints}`,
  );
  console.info(`[tree] 国家宏观 → {国家} → ${theme} → {指标} → {子维度}`);
  console.warn(
    "[policy] Excel 仅导入历史观测。每条指标须另配 FRED/REST/WB 自动订阅并运行 npm run data:probe-sources；不可依赖重复导入 Excel 更新。",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

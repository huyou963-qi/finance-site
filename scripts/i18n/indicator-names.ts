/**
 * 宏观指标英文名（Instrument.nameEn）导出 / 回填。英文站目录与图表优先显示 nameEn。
 * 需要能连数据库（DATABASE_URL）。默认只预览，加 --apply 才写库；默认不覆盖已有英文名。
 *
 *   npx tsx scripts/i18n/indicator-names.ts --export=names.json          # 导出缺英文名的指标（code/name/displayName）
 *   npx tsx scripts/i18n/indicator-names.ts --from-dictionary [--apply]  # 用站内词典精确匹配中文名回填
 *   npx tsx scripts/i18n/indicator-names.ts --import=en.json [--apply] [--overwrite]  # 导入 { code: "English name" }
 *
 * 英文为 AI 初译 + 人工抽查（docs/I18N.md）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { InstrumentKind } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { loadEnglishText } from "../../src/i18n/text/en";
import {
  rowsMissingEnglish,
  updatesFromDictionary,
  updatesFromImport,
  type IndicatorNameRow,
  type NameUpdate,
} from "../../src/i18n/indicatorNames";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

async function loadRows(): Promise<IndicatorNameRow[]> {
  const rows = await prisma.instrument.findMany({
    where: { kind: InstrumentKind.MACRO_SERIES },
    select: { code: true, name: true, nameEn: true, metadata: true },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => {
    const md = r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {};
    return { code: r.code, name: r.name, nameEn: r.nameEn, displayName: typeof md.displayName === "string" ? md.displayName : null };
  });
}

async function apply(updates: NameUpdate[]) {
  if (!flag("apply")) {
    console.log(`预览：${updates.length} 条将写入 nameEn（加 --apply 写库）`);
    for (const u of updates.slice(0, 30)) console.log(`  ${u.code} → ${u.nameEn}`);
    return;
  }
  let done = 0;
  for (const u of updates) {
    await prisma.instrument.update({ where: { code: u.code }, data: { nameEn: u.nameEn } });
    done++;
  }
  console.log(`已写入 ${done} 条 nameEn`);
}

async function main() {
  const rows = await loadRows();
  const exportPath = arg("export");
  const importPath = arg("import");
  if (exportPath) {
    const missing = rowsMissingEnglish(rows);
    writeFileSync(exportPath, JSON.stringify(missing.map(({ code, name, displayName }) => ({ code, name, displayName })), null, 2));
    console.log(`共 ${rows.length} 条，缺英文名 ${missing.length} 条，已导出到 ${exportPath}`);
  } else if (flag("from-dictionary")) {
    await apply(updatesFromDictionary(rows, await loadEnglishText()));
  } else if (importPath) {
    const imported = JSON.parse(readFileSync(importPath, "utf8")) as Record<string, string>;
    await apply(updatesFromImport(rows, imported, { overwrite: flag("overwrite") }));
  } else {
    console.log("用法见文件头注释");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

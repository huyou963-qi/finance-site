import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "../../src/lib/prisma";
import {
  normalizeClassificationInput,
  upsertClassificationHistory,
} from "../../src/lib/equity/sectorClassificationHistory";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function readRows(file: string): Record<string, unknown>[] {
  if (path.extname(file).toLowerCase() === ".json") {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(value)) throw new Error("JSON 顶层必须是数组");
    return value;
  }
  const workbook = XLSX.readFile(file, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) throw new Error("文件没有 worksheet");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
}

async function main() {
  const file = arg("file") ?? process.argv.find((value) => !value.startsWith("--") && /\.(json|csv|xlsx?)$/i.test(value));
  if (!file) throw new Error("用法：npm run equity:import-sector-classifications -- --file=<csv|xlsx|json> [--source=...] [--dry-run]");
  const defaultSource = arg("source") ?? undefined;
  const rows = readRows(path.resolve(file)).map((row) => normalizeClassificationInput(row, defaultSource));
  if (!rows.length) throw new Error("导入文件没有数据行");
  const count = process.argv.includes("--dry-run") ? rows.length : await upsertClassificationHistory(rows);
  console.log(`${process.argv.includes("--dry-run") ? "验证" : "写入"} ${count} 条分类有效期记录`);
}

main().finally(() => prisma.$disconnect());

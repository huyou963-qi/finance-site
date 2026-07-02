import { roundMacroDisplayNumber } from "@/lib/formatMacroValue";
import { formatMacroPeriodDisplay } from "@/lib/macroPeriodLabel";

export type MacroExportColumn = { key: string; label: string };

export function buildMacroExportMatrix(
  categories: string[],
  columns: MacroExportColumn[],
  valueByKey: Map<string, (number | null)[]>,
  rowIndices: number[],
): (string | number | null)[][] {
  const header: (string | number | null)[] = ["时间", ...columns.map((c) => c.label)];
  const rows = rowIndices.map((idx) => {
    const time = formatMacroPeriodDisplay(categories[idx] ?? "", categories);
    const values = columns.map((col) => {
      const v = valueByKey.get(col.key)?.[idx];
      if (v == null || !Number.isFinite(v)) return null;
      return roundMacroDisplayNumber(v);
    });
    return [time, ...values];
  });
  return [header, ...rows];
}

function csvEscapeCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadMacroCsv(
  matrix: (string | number | null)[][],
  filename: string,
): void {
  const lines = matrix.map((row) => row.map(csvEscapeCell).join(","));
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadMacroXlsx(
  matrix: (string | number | null)[][],
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "数据");
  XLSX.writeFile(workbook, filename);
}

export function macroExportFilename(ext: "csv" | "xlsx"): string {
  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[:-]/g, "")
    .replace("T", "-");
  return `macro-data-${stamp}.${ext}`;
}

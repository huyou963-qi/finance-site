import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { NBS_PMI_INSTRUMENTS } from "./catalog";

/**
 * 解析国家统计局 PMI「相关数据表」Excel。
 *
 * 结构（.data/nbs-pmi-sample.xls，2026-07 发布包）：
 * - sheets: 制造业 / 非制造业；
 * - 第一个指标表的表头含 PMI 或商务活动及全部分项；
 * - 首列为 Excel 日期序列，随后连续 13 个月；后面的行业表不属于本 catalog。
 *
 * 防御：sheet、列、日期、值域、连续历史任一异常即 throw，避免源站改版后静默错列。
 */

export type ParsedNbsPmi = {
  pointsByInstrument: Map<string, ObservationPoint[]>;
  sourceLatestObsDate: Date;
};

function normalizeLabel(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .trim();
}

function excelMonth(value: unknown): Date | null {
  const serial = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed?.y || !parsed.m) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, 1));
}

function assertMonthly(points: ObservationPoint[], sheetName: string): void {
  if (points.length < 12) {
    throw new Error(`国家统计局 PMI：${sheetName} 仅解析 ${points.length} 个月（预期至少 12）`);
  }
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!.obsDate;
    const expected = new Date(
      Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1),
    );
    if (points[i]!.obsDate.getTime() !== expected.getTime()) {
      throw new Error(
        `国家统计局 PMI：${sheetName} 月份不连续 ${previous.toISOString().slice(0, 10)} → ${points[i]!.obsDate.toISOString().slice(0, 10)}`,
      );
    }
  }
}

export function parseNbsPmiWorkbook(workbook: XLSX.WorkBook): ParsedNbsPmi {
  const pointsByInstrument = new Map<string, ObservationPoint[]>();
  let latest: Date | null = null;

  for (const sheetName of ["制造业", "非制造业"] as const) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(
        `国家统计局 PMI：缺 sheet「${sheetName}」（实际：${workbook.SheetNames.join(", ")}）`,
      );
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    const definitions = NBS_PMI_INSTRUMENTS.filter((row) => row.sheetName === sheetName);
    const expected = new Set(definitions.map((row) => normalizeLabel(row.sourceLabel)));
    const headerIndex = rows.findIndex((row) => {
      const labels = new Set(row.map(normalizeLabel));
      return [...expected].every((label) => labels.has(label));
    });
    if (headerIndex < 0) {
      throw new Error(`国家统计局 PMI：${sheetName} 未找到包含全部分项的表头`);
    }

    const header = rows[headerIndex]!.map(normalizeLabel);
    const columnByCode = new Map<string, number>();
    for (const definition of definitions) {
      const column = header.indexOf(normalizeLabel(definition.sourceLabel));
      if (column <= 0) {
        throw new Error(
          `国家统计局 PMI：${sheetName} 缺列「${definition.sourceLabel}」`,
        );
      }
      columnByCode.set(definition.code, column);
      pointsByInstrument.set(definition.code, []);
    }

    let started = false;
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex]!;
      const obsDate = excelMonth(row[0]);
      if (!obsDate) {
        if (started) break;
        continue;
      }
      started = true;
      const currentMonth = new Date();
      const futureLimit = Date.UTC(
        currentMonth.getUTCFullYear(),
        currentMonth.getUTCMonth() + 1,
        1,
      );
      if (obsDate.getTime() > futureLimit) {
        throw new Error(
          `国家统计局 PMI：${sheetName} 出现异常未来月份 ${obsDate.toISOString().slice(0, 10)}`,
        );
      }

      for (const definition of definitions) {
        const raw = row[columnByCode.get(definition.code)!];
        const value = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          throw new Error(
            `国家统计局 PMI：${sheetName}/${definition.sourceLabel} ${obsDate.toISOString().slice(0, 7)} 数值异常：${String(raw)}`,
          );
        }
        pointsByInstrument.get(definition.code)!.push({ obsDate, value });
      }
      if (!latest || obsDate > latest) latest = obsDate;
    }

    const sample = pointsByInstrument.get(definitions[0]!.code)!;
    assertMonthly(sample, sheetName);
    for (const definition of definitions) {
      const points = pointsByInstrument.get(definition.code)!;
      if (points.length !== sample.length) {
        throw new Error(
          `国家统计局 PMI：${sheetName}/${definition.sourceLabel} 历史长度不一致`,
        );
      }
    }
  }

  if (!latest || pointsByInstrument.size !== NBS_PMI_INSTRUMENTS.length) {
    throw new Error("国家统计局 PMI：解析结果不完整");
  }
  return { pointsByInstrument, sourceLatestObsDate: latest };
}

/**
 * DERA TSV 解析与归一。所有源端不规整之处都在这里收敛，落库前的值一律是干净类型。
 *
 * 实测的坑（2006q1 与 2026q1 两端各全量核对过）：
 * 1. 日期是 `DD-MON-YYYY`（如 `31-MAR-2026`），不是 ISO，月份是英文三字母缩写。
 * 2. `AFF10B5ONE`（10b5-1 勾选）同一列混用四种编码：'0' / '1' / 'false' / ''。
 * 3. **各季度列集不同**：`AFF10B5ONE` 老季度根本不存在（实测 2006q1 的 SUBMISSION 是
 *    13 列、2026q1 是 14 列）。因此必须按**列名**取值而不是列位，且该列按可选处理、
 *    缺失时写 null 而不是 false——"当年还没有这个勾选框"不等于"申报人没勾"。
 * 4. `RPTOWNER_RELATIONSHIP` 是逗号拼接的多值，如 `Director,Officer,TenPercentOwner`。
 *
 * 另：列数与表头不一致的脏行在 2006q1/2026q1 实测均为 0，`parseTsv` 仍保留该校验作为
 * 防御（若将来出现，错位是静默写错数据而不是报错，代价最高）。
 */

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** `31-MAR-2026` → Date(UTC)。无法解析返回 null（调用方决定跳过还是报错）。 */
export function parseDeraDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2]!.toUpperCase()];
  const year = Number(m[3]);
  if (!mon || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, mon - 1, day));
  // 拒绝溢出日期（如 31-FEB-2026 会被 Date 滚到 3 月）
  if (d.getUTCDate() !== day || d.getUTCMonth() !== mon - 1) return null;
  return d;
}

/** '1'/'true'/'Y' → true；'0'/'false'/'N' → false；空 → null（未知，不等于 false）。 */
export function parseDeraBoolean(raw: string | undefined | null): boolean | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "true" || s === "y" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "n" || s === "no") return false;
  return null;
}

export function parseDeraNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type OwnerRelationship = {
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  isOther: boolean;
};

/** `Director,Officer,TenPercentOwner` → 布尔组。大小写与空格不敏感。 */
export function parseRelationship(raw: string | undefined | null): OwnerRelationship {
  const parts = (raw ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, ""))
    .filter(Boolean);
  return {
    isDirector: parts.includes("director"),
    isOfficer: parts.includes("officer"),
    isTenPercentOwner: parts.includes("tenpercentowner"),
    isOther: parts.includes("other"),
  };
}

export type TsvRow = Record<string, string>;

/**
 * 逐行流式解析 TSV。**列数与表头不一致的行一律跳过并计数**——源里存在含制表符的
 * 脚注文本会撑爆列数，若按位置硬取会整列错位且不报错。
 */
export function parseTsv(text: string): { rows: TsvRow[]; skipped: number; header: string[] } {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? "").split("\t").map((h) => h.trim());
  if (header.length < 2) throw new Error("TSV 表头异常（列数 < 2），源结构可能已变");
  const rows: TsvRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length !== header.length) {
      skipped += 1;
      continue;
    }
    const row: TsvRow = {};
    for (let c = 0; c < header.length; c++) row[header[c]!] = parts[c]!;
    rows.push(row);
  }
  return { rows, skipped, header };
}

/** 校验 TSV 含所有必需列，缺列直接报错（源改版时立刻暴露，而不是静默产出空值）。 */
export function assertColumns(header: string[], required: string[], label: string): void {
  const have = new Set(header);
  const missing = required.filter((c) => !have.has(c));
  if (missing.length) {
    throw new Error(`${label}：缺列 ${missing.join(",")}（源结构可能已变）`);
  }
}

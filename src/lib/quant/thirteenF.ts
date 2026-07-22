/**
 * SEC Form 13F 结构化数据集解析纯函数（Phase 5 WS2）。
 *
 * 数据集来源：https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets
 * 每季一个 zip（date-range 命名，如 01dec2024-28feb2025_form13f.zip），含 tab 分隔：
 *   SUBMISSION.tsv：ACCESSION_NUMBER, FILING_DATE, SUBMISSIONTYPE, CIK, PERIODOFREPORT
 *   COVERPAGE.tsv ：ACCESSION_NUMBER, ISAMENDMENT, AMENDMENTTYPE, FILINGMANAGER_NAME, …
 *   INFOTABLE.tsv ：ACCESSION_NUMBER, …, CUSIP, VALUE, SSHPRNAMT, SSHPRNAMTTYPE, PUTCALL, …
 *
 * 关键口径坑：
 * - VALUE 单位：SEC 2023-01-03 起改报「元」，此前报「千元」→ 按 FILING_DATE 归一到美元。
 * - 仅取 SSHPRNAMTTYPE=SH（股数）且 PUTCALL 空（剔除期权头寸）的行计入普通股持仓。
 * - 日期形如 "31-JAN-2025" → ISO。
 */

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** "31-JAN-2025" → "2025-01-31"（无法解析返回 null） */
export function parseSecDate(s: string): string | null {
  const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})$/.exec(s.trim().toUpperCase());
  if (!m) return null;
  const mm = MONTHS[m[2]!];
  if (!mm) return null;
  const dd = m[1]!.padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

/**
 * VALUE → 美元。SEC 自 2023-01-03 起报到「元」；此前报「千元」需 ×1000。
 * 以披露日（filedAt，ISO 或 Date）判定口径，与实际报表规则一致。
 */
export const VALUE_DOLLAR_CUTOFF = "2023-01-03";
export function scaleValueToUsd(rawValue: number, filedAtIso: string): number {
  return filedAtIso < VALUE_DOLLAR_CUTOFF ? rawValue * 1000 : rawValue;
}

/** TSV 一行按 \t 切列（不做引号处理——SEC 数据集无内嵌引号转义） */
export function splitTsv(line: string): string[] {
  return line.replace(/\r$/, "").split("\t");
}

/** 表头行 → 列名到下标的映射 */
export function headerIndex(headerLine: string): Map<string, number> {
  const cols = splitTsv(headerLine);
  const m = new Map<string, number>();
  cols.forEach((c, i) => m.set(c.trim().toUpperCase(), i));
  return m;
}

export type InfoTableRow = {
  accession: string;
  cusip: string;
  nameOfIssuer: string;
  titleOfClass: string;
  value: number;
  shares: number;
  sshType: string;
  putCall: string;
};

/**
 * 解析 INFOTABLE 一行为结构（列序由 header 决定，抗列顺序变化）。
 * 返回 null：非股数行（SSHPRNAMTTYPE≠SH）、期权行（PUTCALL 非空）、数值缺失、CUSIP 缺失。
 */
export function parseInfoTableRow(
  cols: string[],
  idx: Map<string, number>,
): InfoTableRow | null {
  const get = (name: string): string => {
    const i = idx.get(name);
    return i != null ? (cols[i] ?? "").trim() : "";
  };
  const sshType = get("SSHPRNAMTTYPE").toUpperCase();
  if (sshType && sshType !== "SH") return null;
  const putCall = get("PUTCALL").toUpperCase();
  if (putCall) return null; // 剔除 Put/Call 期权头寸
  const cusip = get("CUSIP").toUpperCase();
  if (!cusip) return null;
  const shares = Number(get("SSHPRNAMT"));
  const value = Number(get("VALUE"));
  if (!Number.isFinite(shares) || !Number.isFinite(value)) return null;
  return {
    accession: get("ACCESSION_NUMBER"),
    cusip,
    nameOfIssuer: get("NAMEOFISSUER"),
    titleOfClass: get("TITLEOFCLASS"),
    value,
    shares,
    sshType: sshType || "SH",
    putCall,
  };
}

/**
 * titleOfClass 是否像债券/票据/优先股等非普通股（供桥接剔除误入候选）。
 * 13F 应只报 13(f) 证券（多为普通股/ETF/期权），但部分 filer 会把公司债按 SH 误报，
 * 其 CUSIP 与普通股不同，若混入候选会把 ticker 误配到债券 CUSIP。
 */
export function isDebtLikeClass(titleOfClass: string): boolean {
  return /\b(BOND|NOTE|NOTES|DEBENTURE|DEB|SR NT|MTN|CONV)\b|CORPORATE BOND/i.test(
    titleOfClass,
  );
}

/** 9 位 CUSIP 校验位（mod-10，字母 A=10…Z=35）。用于清洗桥接候选。 */
export function isValidCusip(cusip: string): boolean {
  const c = cusip.trim().toUpperCase();
  if (!/^[0-9A-Z*@#]{9}$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const ch = c[i]!;
    let v: number;
    if (ch >= "0" && ch <= "9") v = ch.charCodeAt(0) - 48;
    else if (ch >= "A" && ch <= "Z") v = ch.charCodeAt(0) - 55; // A=10
    else if (ch === "*") v = 36;
    else if (ch === "@") v = 37;
    else if (ch === "#") v = 38;
    else return false;
    if (i % 2 === 1) v *= 2;
    sum += Math.floor(v / 10) + (v % 10);
  }
  const check = (10 - (sum % 10)) % 10;
  return String(check) === c[8];
}

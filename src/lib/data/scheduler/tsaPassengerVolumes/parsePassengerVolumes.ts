import type { ObservationPoint } from "../types";

/**
 * 解析 TSA checkpoint travel numbers 页面 HTML → 每日旅客通过人数观测点。
 *
 * 结构（2026-09 fixture 核实，见 .data/tsa-passenger-volumes-current-sample.html /
 * .data/tsa-passenger-volumes-2019-sample.html）：
 *   单个 <table class="table">，表头 <th>Date</th><th>Numbers</th>，
 *   每行 <td>M/D/YYYY</td><td>N,NNN,NNN</td>（数字含千分位逗号）。
 *   当年页面按日期倒序（最新在前）；历史归档页按日期正序。两种顺序均兼容解析，
 *   排序统一由本函数完成。
 *
 * 防御：找不到目标表格、表头不含 Date/Numbers、0 有效行、日期无法解析、
 *      数值非法一律 throw，让 fetch_run 记 FAILED 触发告警，绝不写入可疑值。
 */

export type ParsedTsaPassengerVolumes = {
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTables(html: string): string[] {
  const out: string[] = [];
  const re = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[0]!);
  return out;
}

function extractRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tableHtml))) {
    const cells = [...m[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((x) =>
      stripTags(x[1] ?? ""),
    );
    if (cells.length) rows.push(cells);
  }
  return rows;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseTsaPassengerVolumesPage(html: string): ParsedTsaPassengerVolumes {
  const tables = extractTables(html);
  let targetRows: string[][] | null = null;
  for (const t of tables) {
    const rows = extractRows(t);
    if (rows.length === 0) continue;
    const header = rows[0]!.map((c) => c.toLowerCase());
    if (header.includes("date") && header.includes("numbers")) {
      targetRows = rows.slice(1);
      break;
    }
  }
  if (!targetRows) {
    throw new Error(
      "TSA 旅客通过人数：未找到表头含 Date/Numbers 的表格（页面结构可能已变）",
    );
  }

  const points: ObservationPoint[] = [];
  let latest: Date | null = null;
  let skippedInvalid = 0;
  const now = Date.now();

  for (const row of targetRows) {
    if (row.length < 2) {
      skippedInvalid += 1;
      continue;
    }
    const [rawDate, rawValue] = row;
    const m = DATE_RE.exec(rawDate!.trim());
    if (!m) {
      skippedInvalid += 1;
      continue;
    }
    const [, mm, dd, yyyy] = m;
    const obsDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    if (Number.isNaN(obsDate.getTime())) {
      skippedInvalid += 1;
      continue;
    }
    if (obsDate.getTime() > now + 86_400_000) {
      throw new Error(
        `TSA 旅客通过人数：出现未来日期 ${rawDate}（源数据异常，拒绝写入）`,
      );
    }
    const value = Number(rawValue!.replace(/,/g, "").trim());
    if (!Number.isFinite(value) || value <= 0) {
      skippedInvalid += 1;
      continue;
    }
    // 值域校验（宽松边界，只为拦截解析错位）：单日安检人数应在数万到千万之间
    if (value < 10_000 || value > 10_000_000) {
      throw new Error(
        `TSA 旅客通过人数：${rawDate} 值 ${value} 超出合理值域 [10000,10000000]（拒绝写入，疑似解析错位）`,
      );
    }
    points.push({ obsDate, value });
    if (!latest || obsDate > latest) latest = obsDate;
  }

  if (points.length === 0) {
    throw new Error("TSA 旅客通过人数：解析后 0 个有效点（结构或数值异常）");
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, latestObsDate: latest, skippedInvalid };
}

/**
 * 解析 PR Newswire ISM 新闻稿正文里的 "AT A GLANCE" / "COMPARISON OF ISM SERVICES AND
 * ISM MANUFACTURING SURVEYS" 表 → 各分项最新值。返回值与官网 parseReport.ts 的
 * IsmOfficialParsedReport 同形状，便于 adapter 与 pointForOfficialCode 复用。
 *
 * 制造业：MANUFACTURING AT A GLANCE 表，行标签与官网一致（Manufacturing PMI®/New Orders/…）。
 * 服务业：COMPARISON 表左侧一组数值列为服务业（右侧制造业对照列忽略），含 Inventory Sentiment。
 *
 * DOM 结构未知（可能是标准 <table>，也可能是纯文本 tab/换行排版——见任务备注：浏览器
 * innerText 观察到 tab/换行分隔）。因此本解析器两级尝试：
 *   1) 标准 <table><tr><td> 结构（复用官网 parseReport.ts 的表格提取逻辑）；
 *   2) 找不到合格表格时，退化为「按行/列分隔符切分的扁平文本」提取（把 </tr>/<br> 视为换行，
 *      </td>/</th> 视为制表符，再用 tab 或连续空白切列）。
 * 两级都找不到锚点行（headline + 第二个判定行）→ throw，不允许静默漏项。
 *
 * 观测期沿用官网标题月份提取规则（PR Newswire 标题同样是 "<Month> <Year> ISM® … Report" 形式）。
 */
import type { ObservationPoint } from "../../types";
import {
  ISM_OFFICIAL_MFG_SERIES,
  ISM_OFFICIAL_SVC_SERIES,
  type IsmOfficialReportKind,
  type IsmOfficialSeriesDef,
} from "../catalog";
import {
  extractRows,
  extractTables,
  findSeries,
  firstNumericCell,
  parseIsmReportTitleMonth,
} from "../parseReport";
import type { IsmOfficialParsedReport } from "../parseReport";

function defsFor(kind: IsmOfficialReportKind): readonly IsmOfficialSeriesDef[] {
  return kind === "manufacturing" ? ISM_OFFICIAL_MFG_SERIES : ISM_OFFICIAL_SVC_SERIES;
}

function prNewswireDefs(kind: IsmOfficialReportKind): IsmOfficialSeriesDef[] {
  return defsFor(kind).filter((d) => d.prNewswireLabel);
}

function scoreRows(rows: string[][], kind: IsmOfficialReportKind): number {
  const blob = rows
    .map((r) => r.join(" "))
    .join(" | ")
    .toLowerCase();
  if (kind === "manufacturing") {
    if (!blob.includes("manufacturing pmi")) return 0;
    if (!blob.includes("new orders")) return 0;
    return 2 + (blob.includes("customers") ? 1 : 0);
  }
  if (!blob.includes("services pmi")) return 0;
  if (!blob.includes("business activity")) return 0;
  return 2 + (blob.includes("inventory sentiment") ? 1 : 0);
}

/** 退化路径：把 </tr>/<br> 当换行、</td>|</th> 当制表符，输出「行 -> 单元格数组」。 */
function extractFlattenedTextRows(html: string): string[][] {
  const flattened = html
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ");
  const lines = flattened
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);
  return lines.map((line) =>
    line
      .split(/\t+| {2,}/)
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0),
  );
}

function bestScoringRows(
  candidates: string[][][],
  kind: IsmOfficialReportKind,
): string[][] | null {
  let best: { score: number; rows: string[][] } | null = null;
  for (const rows of candidates) {
    const score = scoreRows(rows, kind);
    if (score > (best?.score ?? 0)) best = { score, rows };
  }
  return best && best.score >= 2 ? best.rows : null;
}

function parseGlanceRows(
  rows: string[][],
  defs: readonly IsmOfficialSeriesDef[],
  obsDate: Date,
): Map<string, ObservationPoint> {
  const out = new Map<string, ObservationPoint>();
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const def = findSeries(defs, cells[0] ?? "");
    if (!def || !def.prNewswireLabel) continue;
    const value = firstNumericCell(cells);
    if (value == null) continue;
    if (value < 0 || value > 100) {
      throw new Error(`PR Newswire 报告：${def.officialLabel} 值 ${value} 超出 [0,100]`);
    }
    out.set(def.code, { obsDate, value });
  }
  return out;
}

export function parsePrNewswireReport(
  html: string,
  kind: IsmOfficialReportKind,
): IsmOfficialParsedReport {
  const title = parseIsmReportTitleMonth(html);
  if (!title) {
    throw new Error("PR Newswire 报告：无法从标题解析观测月份（页面结构可能已变）");
  }

  const now = new Date();
  const horizon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  if (title.obsDate.getTime() > horizon.getTime()) {
    throw new Error(`PR Newswire 报告：观测期 ${title.text} 异常偏未来`);
  }

  const defs = prNewswireDefs(kind);

  const tableRowCandidates = extractTables(html).map((table) => extractRows(table));
  let rows = bestScoringRows(tableRowCandidates, kind);
  if (!rows) {
    rows = bestScoringRows([extractFlattenedTextRows(html)], kind);
  }
  if (!rows) {
    throw new Error(
      kind === "manufacturing"
        ? "PR Newswire 制造业报告：未找到 AT A GLANCE 表（缺 Manufacturing PMI / New Orders 锚点，表格结构或纯文本结构均未命中）"
        : "PR Newswire 服务业报告：未找到 COMPARISON 表（缺 Services PMI / Business Activity 锚点，表格结构或纯文本结构均未命中）",
    );
  }

  const pointsByCode = parseGlanceRows(rows, defs, title.obsDate);
  const headlineCode = defs.find((d) => d.sector === "headline")?.code ?? defs[0]?.code;
  if (!headlineCode || !pointsByCode.has(headlineCode)) {
    throw new Error("PR Newswire 报告：未解析到 headline 分项");
  }

  return {
    kind,
    obsDate: title.obsDate,
    titleMonthText: title.text,
    pointsByCode,
  };
}

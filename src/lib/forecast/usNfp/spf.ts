/**
 * 费城联储专业预测者调查（SPF）非农就业中位数预测 —— 仅作第三方对照，不入库。
 *
 * 文件 `median_emp_level.xlsx`：每行一个调查季度（YEAR, QUARTER），EMP1 = 上一季度就业水平
 * （调查时已知的实际值，季均，千人），EMP2 = 当季预测，EMP3… = 之后各季。当季隐含的
 * 平均月增量 = (EMP2 − EMP1) / 3。调查约在季度第二个月中旬截止。
 * 费城联储网站内容可用于信息、教育和研究目的，页面注明来源。进程内缓存 24 小时。
 */
import * as XLSX from "xlsx";

export const SPF_EMP_URL =
  "https://www.philadelphiafed.org/-/media/frbp/assets/surveys-and-data/survey-of-professional-forecasters/data-files/files/median_emp_level.xlsx";
export const SPF_PAGE_URL =
  "https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters";

export type SpfQuarter = { year: number; quarter: number; emp1: number; emp2: number };

export function parseSpfEmp(buf: ArrayBuffer | Buffer): SpfQuarter[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  if (!ws) throw new Error("SPF：工作簿为空");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  const out: SpfQuarter[] = [];
  for (const r of rows) {
    const year = Number(r.YEAR);
    const quarter = Number(r.QUARTER);
    const emp1 = Number(r.EMP1);
    const emp2 = Number(r.EMP2);
    if ([year, quarter, emp1, emp2].every(Number.isFinite) && quarter >= 1 && quarter <= 4) {
      out.push({ year, quarter, emp1, emp2 });
    }
  }
  if (!out.length) throw new Error("SPF：未解析到 YEAR/QUARTER/EMP1/EMP2（源结构可能已变）");
  return out;
}

let cache: { at: number; data: SpfQuarter[] | null } | null = null;

export async function loadSpfEmp(): Promise<SpfQuarter[] | null> {
  if (cache && Date.now() - cache.at < (cache.data ? 24 * 3_600_000 : 10 * 60_000)) return cache.data;
  try {
    const res = await fetch(SPF_EMP_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (finance-site)" },
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = parseSpfEmp(Buffer.from(await res.arrayBuffer()));
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.warn(`[usNfpNowcast] SPF 读取失败：${error instanceof Error ? error.message : error}`);
    cache = { at: Date.now(), data: null };
    return null;
  }
}

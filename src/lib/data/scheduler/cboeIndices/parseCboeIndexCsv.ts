import type { ObservationPoint } from "../types";
import type { CboeIndexSeriesConfig } from "./catalog";

/**
 * 解析 CBOE 指数历史 CSV（VIX9D_History.csv / VVIX_History.csv）→ 观测点。
 *
 * 结构（2026-09 fixture 核实，见 .data/cboe-vix9d-sample.csv / .data/cboe-vvix-sample.csv）：
 *   首行表头，逗号分隔；DATE 列为 MM/DD/YYYY；
 *   VIX9D: DATE,OPEN,HIGH,LOW,CLOSE —— 取 CLOSE；
 *   VVIX:  DATE,VVIX —— 取 VVIX 列。
 *
 * 防御：表头缺失目标列、0 有效行、日期非法/倒退、数值超出配置值域一律 throw，
 *      让 fetch_run 记 FAILED 触发告警，绝不写入可疑值（源站改版时报错而非静默取错）。
 */

export type ParsedCboeIndex = {
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

const DATE_COL = "DATE";
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim());
}

export function parseCboeIndexCsv(
  text: string,
  config: CboeIndexSeriesConfig,
): ParsedCboeIndex {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error(`CBOE ${config.seriesKey}：CSV 为空`);
  }
  const header = splitCsvLine(lines[0]!);
  const dateIdx = header.indexOf(DATE_COL);
  const valueIdx = header.indexOf(config.valueColumn);
  if (dateIdx === -1 || valueIdx === -1) {
    throw new Error(
      `CBOE ${config.seriesKey}：缺列 ${DATE_COL}/${config.valueColumn}（实际表头：${header.join(",")}；源结构可能已变）`,
    );
  }

  const points: ObservationPoint[] = [];
  let latest: Date | null = null;
  let skippedInvalid = 0;
  let prevDate: Date | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    if (cols.length <= Math.max(dateIdx, valueIdx)) {
      skippedInvalid += 1;
      continue;
    }
    const rawDate = cols[dateIdx]!;
    const m = DATE_RE.exec(rawDate);
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
    // 未来日期（超过今天 +1 天容错时区）视为异常
    if (obsDate.getTime() > Date.now() + 86_400_000) {
      throw new Error(
        `CBOE ${config.seriesKey}：出现未来日期 ${rawDate}（源数据异常，拒绝写入）`,
      );
    }
    if (prevDate && obsDate.getTime() < prevDate.getTime()) {
      throw new Error(
        `CBOE ${config.seriesKey}：日期倒退（${rawDate} 早于前一行），源结构可能已变`,
      );
    }
    prevDate = obsDate;

    const rawValue = cols[valueIdx]!;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      skippedInvalid += 1;
      continue;
    }
    const [lo, hi] = config.valueRange;
    if (value < lo || value > hi) {
      throw new Error(
        `CBOE ${config.seriesKey}：${rawDate} 值 ${value} 超出值域 [${lo},${hi}]（拒绝写入，疑似解析错位）`,
      );
    }

    points.push({ obsDate, value });
    if (!latest || obsDate > latest) latest = obsDate;
  }

  if (points.length === 0) {
    throw new Error(`CBOE ${config.seriesKey}：解析后 0 个有效点（结构或数值异常）`);
  }
  return { points, latestObsDate: latest, skippedInvalid };
}

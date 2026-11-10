"use client";

import { useMemo, useState } from "react";
import {
  formatCompactMoney,
  formatEps,
  formatPct,
  formatPp,
  formatSignedPct,
} from "@/lib/equity/formatFundamentalsDisplay";
import {
  detectStatementProfile,
  orderStatementLines,
  STATEMENT_LINES,
  STATEMENT_NAMES,
  STATEMENT_PROFILE_NAMES,
  type HeadlineField,
  type StatementCode,
  type StatementLine,
  type StatementLines,
} from "@/lib/equity/statementTemplate";
import { useTr } from "@/i18n/TextProvider";

/** 一期报表：独立列（营收、净利润等）+ lines 里的其余科目 */
export type StatementPeriod = Partial<Record<HeadlineField, number | null>> & {
  period: string;
  fiscalDate: string;
  lines?: StatementLines;
};

type Props = {
  /** 升序（旧 → 新）；同比按此顺序向前取 yoyLag 期 */
  rows: StatementPeriod[];
  valueMode: "value" | "yoy";
  yoyLag: number;
  /** 展示的行下标区间 [start, end]（含两端）；省略 = 全部。区间外的行仍用于计算同比 */
  visibleRange?: [number, number];
};

const STATEMENTS: StatementCode[] = ["IS", "BS", "CF"];

function rawValue(row: StatementPeriod, line: StatementLine): number | null {
  const v = line.headline ? row[line.headline] : row.lines?.[line.code];
  return v != null && Number.isFinite(v) ? v : null;
}

function signClass(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

function formatValue(line: StatementLine, v: number | null): string {
  if (v == null) return "—";
  if (line.kind === "ratio") return formatPct(v);
  if (line.kind === "perShare") return formatEps(v);
  // 现金流出按负数展示，便于与小计相加核对；零保持为零。
  return formatCompactMoney(line.outflow && v !== 0 ? -v : v);
}

function cell(rows: StatementPeriod[], i: number, line: StatementLine, valueMode: Props["valueMode"], yoyLag: number) {
  const v = rawValue(rows[i]!, line);
  if (valueMode === "value") return { text: formatValue(line, v), cls: v == null ? "text-fs-muted" : "text-fs-text" };
  const j = i - yoyLag;
  const prev = j >= 0 ? rawValue(rows[j]!, line) : null;
  if (line.kind === "ratio") {
    const d = v != null && prev != null ? v - prev : null;
    return { text: formatPp(d), cls: signClass(d) };
  }
  // 基数为负或为零时增速没有意义（亏损收窄、由零起步），留空而不显示误导性的百分比。
  if (v == null || prev == null || prev <= 0) return { text: "—", cls: "text-fs-muted" };
  const d = v / prev - 1;
  return { text: formatSignedPct(d), cls: signClass(d) };
}

/**
 * 三张报表明细：一次看一张表，最新一期在最左（手机屏幕窄，先看到的就是最新数据）。
 * 本公司在所选期间完全没有数据的科目整行隐藏，不同行业的公司只显示自己披露的科目。
 */
export function StockStatementsTable({ rows, valueMode, yoyLag, visibleRange }: Props) {
  const tr = useTr();
  const [statement, setStatement] = useState<StatementCode>("IS");

  // 报表格式由本公司自己披露的科目判定；银行、保险等的利润表按行业习惯排序
  const profile = useMemo(() => detectStatementProfile(rows), [rows]);

  const [lo, hi] = visibleRange ?? [0, rows.length - 1];
  const shown = useMemo(() => rows.slice(lo, hi + 1), [rows, lo, hi]);

  const visible = useMemo(() => {
    const lines = orderStatementLines(STATEMENT_LINES, profile)
      .filter(l => l.statement === statement && shown.some(r => rawValue(r, l) != null));
    const groups: { group: string; lines: StatementLine[] }[] = [];
    for (const line of lines) {
      const last = groups.at(-1);
      if (last?.group === line.group) last.lines.push(line);
      else groups.push({ group: line.group, lines: [line] });
    }
    return groups;
  }, [shown, statement, profile]);

  const counts = useMemo(() => Object.fromEntries(STATEMENTS.map(code => [code,
    STATEMENT_LINES.filter(l => l.statement === code && shown.some(r => rawValue(r, l) != null)).length])) as Record<StatementCode, number>,
  [shown]);

  // 列：最新在左
  const order = useMemo(() => shown.map((_, k) => lo + k).reverse(), [shown, lo]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <div role="tablist" aria-label={tr("选择报表")} className="grid grid-cols-3 gap-1 rounded-md border border-fs-border/60 p-0.5 sm:inline-grid sm:w-auto">
        {STATEMENTS.map(code => (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={statement === code}
            onClick={() => setStatement(code)}
            className={`min-h-9 whitespace-nowrap rounded px-1.5 py-1 text-xs transition-colors sm:min-h-0 sm:px-3 ${
              statement === code ? "bg-fs-accent/20 text-fs-accent-text" : "text-fs-muted hover:text-fs-text"
            }`}
          >
            {STATEMENT_NAMES[code]}
            <span className="ml-1 hidden text-[10px] opacity-70 sm:inline">{counts[code]}</span>
          </button>
        ))}
      </div>
      <span className="text-[11px] text-fs-muted" title={tr("按本公司披露的报表科目自动判定")}>{tr("报表格式：")}{STATEMENT_PROFILE_NAMES[profile]}
      </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border border-fs-border/60 text-sm text-fs-muted">{tr("所选期间暂无")}{STATEMENT_NAMES[statement]}{tr("数据")}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-fs-border/60">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-fs-muted">
              <tr>
                <th className="sticky left-0 z-10 bg-fs-bg px-2 py-1.5 sm:px-3">{tr("科目")}</th>
                {order.map(i => (
                  <th key={rows[i]!.period} className="whitespace-nowrap px-2 py-1.5 text-right font-normal sm:px-3" title={tr("截止 {fiscalDate}", { fiscalDate: rows[i]!.fiscalDate })}>
                    {rows[i]!.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ group, lines }) => (
                <GroupRows key={group} group={group} lines={lines} rows={rows} order={order} valueMode={valueMode} yoyLag={yoyLag} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] leading-5 text-fs-muted">{tr("已隐藏本公司未披露的科目。部分明细取自报表附注，不一定与合计逐项相加；现金流量表中的流出项以负数显示。")}</p>
    </div>
  );
}

function GroupRows({ group, lines, rows, order, valueMode, yoyLag }: {
  group: string; lines: StatementLine[]; rows: StatementPeriod[]; order: number[];
  valueMode: Props["valueMode"]; yoyLag: number;
}) {
  const tr = useTr();
  return (
    <>
      <tr className="border-t border-fs-border/50 bg-fs-elevated/30">
        <td className="sticky left-0 z-10 bg-fs-elevated px-2 py-1 text-[11px] font-medium text-fs-muted sm:px-3">{tr(group)}</td>
        <td colSpan={order.length} />
      </tr>
      {lines.map(line => (
        <tr key={line.code} className="border-t border-fs-border/40">
          <td className={`sticky left-0 z-10 w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] bg-fs-bg px-2 py-1.5 text-[13px] leading-snug sm:w-auto sm:max-w-none sm:px-3 sm:text-sm sm:whitespace-nowrap ${
            line.total ? "font-medium text-fs-text" : "text-fs-text/90"
          }`}>
            {tr(line.label)}
          </td>
          {order.map(i => {
            const { text, cls } = cell(rows, i, line, valueMode, yoyLag);
            return (
              <td key={rows[i]!.period} className={`whitespace-nowrap px-2 py-1.5 text-right text-[13px] tabular-nums sm:px-3 sm:text-sm ${cls} ${line.total ? "font-medium" : ""}`}>
                {text}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

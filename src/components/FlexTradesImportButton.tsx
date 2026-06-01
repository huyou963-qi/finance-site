"use client";

import { useCallback, useRef, useState } from "react";
import type { ChartExecutionTrade } from "@/lib/chart/executionMarkers";
import {
  clearFlexTradesStorage,
  loadFlexTradesFromStorage,
  parseFlexFileContent,
  saveFlexTradesToStorage,
} from "@/lib/chart/flexExecutionImport";

/** 与已有导入合并并去重（按 dedupeKey） */
function mergeWithExistingFlex(
  existing: ChartExecutionTrade[],
  incoming: ChartExecutionTrade[],
): ChartExecutionTrade[] {
  const seen = new Set<string>();
  const out: ChartExecutionTrade[] = [];
  const key = (t: ChartExecutionTrade) =>
    t.dedupeKey?.trim() ||
    `${t.tradeTimeSec}|${t.price}|${t.size}|${t.side}|${t.symbol ?? ""}`;
  for (const t of [...existing, ...incoming]) {
    const k = key(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function FlexTradesImportButton({
  onImported,
}: {
  onImported: (allFlexTrades: ChartExecutionTrade[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lastErr, setLastErr] = useState<string | null>(null);

  const pickFile = useCallback(() => {
    setLastErr(null);
    inputRef.current?.click();
  }, []);

  const clearImported = useCallback(() => {
    clearFlexTradesStorage();
    onImported([]);
    setLastErr(null);
  }, [onImported]);

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      setBusy(true);
      setLastErr(null);
      try {
        const text = await f.text();
        const { trades, errors } = parseFlexFileContent(f.name, text);
        if (errors.length && !trades.length) {
          setLastErr(errors.join(" "));
          return;
        }
        const prev = loadFlexTradesFromStorage();
        const merged = mergeWithExistingFlex(prev, trades);
        merged.forEach((t) => {
          if (!t.source) t.source = "flex";
        });
        saveFlexTradesToStorage(merged);
        onImported(merged);
        if (errors.length) setLastErr(errors.join(" "));
      } catch (err) {
        setLastErr(err instanceof Error ? err.message : "读取文件失败");
      } finally {
        setBusy(false);
      }
    },
    [onImported],
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml,.csv,text/csv,.htm,.html,text/html"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={pickFile}
        disabled={busy}
        title="导入 IBKR 成交记录：Flex XML、简易 CSV，或账户报表「交易确认」HTML（.htm），可与 Gateway 最近成交叠加在 K 线上"
        className="shrink-0 rounded border border-slate-600 bg-slate-900 px-1 py-px text-[8px] leading-tight text-slate-300 hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
      >
        {busy ? "…" : "IB导入"}
      </button>
      <button
        type="button"
        onClick={clearImported}
        title="清除本机已导入的 IB 成交记录（Flex / 报表 HTML）"
        className="shrink-0 rounded px-0.5 py-px text-[8px] text-slate-500 hover:text-slate-300"
      >
        清除
      </button>
      {lastErr ? (
        <span className="max-w-[180px] truncate text-[9px] text-rose-400/90" title={lastErr}>
          {lastErr}
        </span>
      ) : null}
    </div>
  );
}

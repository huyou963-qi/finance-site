"use client";

import { useEffect, useId, useState } from "react";
import { searchLayerSymbols } from "@/lib/chart/layerSymbolSearch";
import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

export function LayerSymbolInput({ value, onChange, label }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState<SymbolSearchItem | null>(null);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<SymbolSearchItem[]>([]);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(-1);
  useEffect(() => {
    setResults([]);
    setActive(-1);
    if (!focused || !value.trim()) { setMessage(""); return; }
    setMessage("搜索中…");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchLayerSymbols(value.trim(), controller.signal).then((items) => {
        if (controller.signal.aborted) return;
        setResults(items);
        setMessage(items.length ? "" : "未找到资产");
      }).catch((e) => {
        if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : "搜索失败");
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, focused]);
  const select = (item: SymbolSearchItem) => { setSelected(item); onChange(item.symbol); setFocused(false); };
  return (
    <div className="min-w-0 flex-1 basis-24">
      <input
        role="combobox" aria-label={label} aria-autocomplete="list"
        aria-expanded={focused && !!value.trim()} aria-controls={id}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        value={value} placeholder="代码或名称" autoComplete="off"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => { onChange(e.target.value); setFocused(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFocused(false);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); setFocused(true);
            setActive((n) => results.length ? (n + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : -1);
          }
          if (e.key === "Enter" && focused && results[active]) { e.preventDefault(); select(results[active]); }
        }}
        className="w-full min-w-0 rounded border border-fs-border bg-fs-elevated px-1.5 py-1 text-[11px] text-fs-text"
      />
      {selected?.symbol === value && !focused ? <p className="mt-1 break-words text-[10px] text-fs-secondary">{selected.name} · {selected.exchange}</p> : null}
      {focused && value.trim() ? (
        <div id={id} role="listbox" aria-label={`${label}搜索结果`} className="mt-1 max-h-40 overflow-y-auto rounded border border-fs-border bg-fs-bg text-[11px]">
          {message ? <p role="status" className="p-2 text-fs-muted">{message}</p> : null}
          {results.map((item, index) => (
            <button key={item.symbol} id={`${id}-${index}`} type="button" role="option" aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()} onClick={() => select(item)}
              className={`block w-full break-words px-2 py-1.5 text-left hover:bg-fs-elevated ${active === index ? "bg-fs-elevated" : ""}`}>
              <span className="font-mono text-fs-text">{item.symbol}</span>
              <span className="ml-1 text-fs-secondary">{item.name} · {item.exchange}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

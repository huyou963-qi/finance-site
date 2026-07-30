"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHART_LAYER_MAX,
  FUNDAMENTAL_METRIC_LABEL,
  LAYER_COLORS,
  type AxisBinding,
  type ChartLayer,
  type FundamentalMetric,
  type LayerTransform,
} from "@/lib/chart/chartLayers";
import { parseLayerExpression } from "@/lib/chart/layerExpression";
import type { UseChartLayersReturn } from "@/hooks/useChartLayers";

const FUND_METRICS = Object.keys(FUNDAMENTAL_METRIC_LABEL) as FundamentalMetric[];

function axisToSelect(axis: AxisBinding): string {
  if (axis.mode === "right") return "right";
  if (axis.mode === "left") return "left";
  if (axis.mode === "scale") return `scale:${axis.scaleId}`;
  return `pane:${axis.paneSlot}`;
}

function selectToAxis(v: string, layer: ChartLayer): AxisBinding {
  if (v === "right") return { mode: "right" };
  if (v === "left") return { mode: "left" };
  if (v.startsWith("scale:")) {
    return { mode: "scale", scaleId: v.slice(6) || `scale_${layer.id.slice(0, 6)}` };
  }
  if (v === "pane:sub1") return { mode: "pane", paneSlot: "sub1" };
  if (v === "pane:sub2") return { mode: "pane", paneSlot: "sub2" };
  if (v === "pane:overlayPane") return { mode: "pane", paneSlot: "overlayPane" };
  return { mode: "scale", scaleId: `auto_${layer.id.slice(0, 6)}` };
}

type Props = {
  primarySymbol: string;
  layersApi: UseChartLayersReturn;
  className?: string;
};

export function ChartLayersPanel({ primarySymbol, layersApi, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [addMode, setAddMode] = useState<"price" | "expr" | "fund">("price");
  const [priceSym, setPriceSym] = useState("");
  const [exprLeft, setExprLeft] = useState(primarySymbol);
  const [exprOp, setExprOp] = useState<"-" | "/">("/");
  const [exprRight, setExprRight] = useState("SPY");
  const [exprAdvanced, setExprAdvanced] = useState("");
  const [useAdvanced, setUseAdvanced] = useState(false);
  const [fundMetric, setFundMetric] = useState<FundamentalMetric>("ttmPe");
  const [fundSym, setFundSym] = useState(primarySymbol);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setExprLeft(primarySymbol);
    setFundSym(primarySymbol);
  }, [primarySymbol]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const {
    layers,
    compareMode,
    canAdd,
    derived,
    layerErrors,
    loadingExtra,
    addLayer,
    updateLayer,
    removeLayer,
    setCompareMode,
    applyTemplate,
  } = layersApi;

  const summary =
    layers.filter((l) => l.visible).length > 0
      ? `${layers.filter((l) => l.visible).length} 层`
      : "无叠加";

  const tryAdd = () => {
    setFormError(null);
    if (!canAdd) {
      setFormError(`最多 ${CHART_LAYER_MAX} 条叠加层`);
      return;
    }
    if (addMode === "price") {
      const sym = priceSym.trim().toUpperCase();
      if (!sym) {
        setFormError("请输入标的代码");
        return;
      }
      addLayer({ kind: "price", symbol: sym, field: "close" });
      setPriceSym("");
      return;
    }
    if (addMode === "expr") {
      const expr = useAdvanced
        ? exprAdvanced.trim()
        : `${exprLeft.trim().toUpperCase()} ${exprOp} ${exprRight.trim().toUpperCase()}`;
      const parsed = parseLayerExpression(expr);
      if (!parsed.ok) {
        setFormError(parsed.error);
        return;
      }
      addLayer(
        { kind: "expr", expr },
        parsed.symbols.length === 1
          ? undefined
          : undefined,
      );
      return;
    }
    const sym = fundSym.trim().toUpperCase() || primarySymbol.trim().toUpperCase();
    if (!sym) {
      setFormError("请输入基本面标的");
      return;
    }
    addLayer({ kind: "fundamental", symbol: sym, metric: fundMetric });
  };

  return (
    <div ref={rootRef} className={`relative flex items-center ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-[11px] ${
          open
            ? "bg-fs-border text-fs-text"
            : "bg-fs-elevated text-fs-secondary hover:bg-fs-border"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        title="多资产 / 运算 / 基本面叠加与坐标轴"
      >
        <span className="text-fs-muted">叠加</span>
        <span
          className={
            layers.some((l) => l.visible)
              ? "font-medium text-fs-accent-text/95"
              : "text-fs-muted"
          }
        >
          {summary}
        </span>
        <span className="text-[10px] text-fs-muted" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-[100] max-h-[min(70vh,32rem)] w-[min(92vw,24rem)] overflow-y-auto rounded-md border border-fs-border bg-fs-bg p-3 shadow-xl"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-fs-secondary">
              序列层（最多 {CHART_LAYER_MAX}）
            </span>
            <label className="ml-auto flex items-center gap-1 text-[10px] text-fs-muted">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
              />
              对比模式（价格指数化）
            </label>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
              onClick={() => applyTemplate("vsSpy")}
              disabled={!canAdd && layers.length >= CHART_LAYER_MAX}
            >
              模板: vs SPY
            </button>
            <button
              type="button"
              className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
              onClick={() => applyTemplate("peOnChart")}
            >
              模板: PE
            </button>
            <button
              type="button"
              className="rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-secondary hover:bg-fs-elevated"
              onClick={() => applyTemplate("spreadVsPeer", "MSFT")}
            >
              模板: 价差
            </button>
          </div>

          {layers.length === 0 ? (
            <p className="mb-2 text-[10px] text-fs-muted">尚未添加叠加层</p>
          ) : (
            <ul className="mb-2 space-y-2">
              {layers.map((layer) => {
                const d = derived.find((x) => x.layerId === layer.id);
                return (
                  <li
                    key={layer.id}
                    className="rounded border border-fs-border/80 bg-fs-elevated/40 p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={layer.visible}
                        onChange={(e) =>
                          updateLayer(layer.id, { visible: e.target.checked })
                        }
                        aria-label="显示"
                      />
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) =>
                          updateLayer(layer.id, { color: e.target.value })
                        }
                        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                        list="layer-color-presets"
                      />
                      <input
                        type="text"
                        value={layer.label}
                        onChange={(e) =>
                          updateLayer(layer.id, { label: e.target.value })
                        }
                        className="min-w-0 flex-1 rounded border border-fs-border bg-fs-bg px-1 py-0.5 text-[11px] text-fs-text"
                      />
                      <button
                        type="button"
                        className="text-[10px] text-fs-muted hover:text-red-400"
                        onClick={() => removeLayer(layer.id)}
                      >
                        删除
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <label className="flex items-center gap-1 text-fs-muted">
                        轴
                        <select
                          value={axisToSelect(layer.axis)}
                          onChange={(e) =>
                            updateLayer(layer.id, {
                              axis: selectToAxis(e.target.value, layer),
                            })
                          }
                          className="rounded border border-fs-border bg-fs-bg px-1 py-0.5 text-fs-text"
                        >
                          <option value="right">右轴</option>
                          <option value="left">左轴</option>
                          <option value={`scale:${layer.id.slice(0, 8)}`}>
                            独立轴
                          </option>
                          <option value="pane:sub1">副图1</option>
                          <option value="pane:sub2">副图2</option>
                          <option value="pane:overlayPane">主图独立</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-fs-muted">
                        变换
                        <select
                          value={layer.transform}
                          onChange={(e) =>
                            updateLayer(layer.id, {
                              transform: e.target.value as LayerTransform,
                            })
                          }
                          className="rounded border border-fs-border bg-fs-bg px-1 py-0.5 text-fs-text"
                        >
                          <option value="raw">原始</option>
                          <option value="index100">指数化100</option>
                          <option value="pctChange">涨跌幅%</option>
                        </select>
                      </label>
                      {d?.lastValue != null ? (
                        <span className="font-mono text-fs-secondary">
                          最新 {d.lastValue.toPrecision(4)}
                        </span>
                      ) : null}
                      {d?.error ? (
                        <span className="text-amber-500">{d.error}</span>
                      ) : null}
                      {d && d.alignedCount > 0 && layer.source.kind === "expr" ? (
                        <span className="text-fs-muted">
                          对齐 {d.alignedCount} 日
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <datalist id="layer-color-presets">
            {LAYER_COLORS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <div className="border-t border-fs-border pt-2">
            <div className="mb-1 flex gap-1 text-[10px]">
              {(
                [
                  ["price", "资产"],
                  ["expr", "运算"],
                  ["fund", "基本面"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAddMode(k)}
                  className={`rounded px-2 py-0.5 ${
                    addMode === k
                      ? "bg-fs-border text-fs-text"
                      : "text-fs-muted hover:bg-fs-elevated"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {addMode === "price" ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={priceSym}
                  onChange={(e) => setPriceSym(e.target.value.toUpperCase())}
                  placeholder="如 MSFT"
                  className="min-w-0 flex-1 rounded border border-fs-border bg-fs-elevated px-1.5 py-1 font-mono text-[11px] text-fs-text"
                />
              </div>
            ) : null}

            {addMode === "expr" ? (
              <div className="space-y-1">
                {!useAdvanced ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      value={exprLeft}
                      onChange={(e) => setExprLeft(e.target.value.toUpperCase())}
                      className="w-16 rounded border border-fs-border bg-fs-elevated px-1 py-1 font-mono text-[11px]"
                    />
                    <select
                      value={exprOp}
                      onChange={(e) => setExprOp(e.target.value as "-" | "/")}
                      className="rounded border border-fs-border bg-fs-elevated px-1 py-1 text-[11px]"
                    >
                      <option value="-">−</option>
                      <option value="/">/</option>
                    </select>
                    <input
                      value={exprRight}
                      onChange={(e) => setExprRight(e.target.value.toUpperCase())}
                      className="w-16 rounded border border-fs-border bg-fs-elevated px-1 py-1 font-mono text-[11px]"
                    />
                  </div>
                ) : (
                  <input
                    value={exprAdvanced}
                    onChange={(e) => setExprAdvanced(e.target.value)}
                    placeholder="(AAPL / SPY) - (MSFT / SPY)"
                    className="w-full rounded border border-fs-border bg-fs-elevated px-1.5 py-1 font-mono text-[11px]"
                  />
                )}
                <button
                  type="button"
                  className="text-[10px] text-fs-muted underline"
                  onClick={() => setUseAdvanced((v) => !v)}
                >
                  {useAdvanced ? "简易模式" : "高级表达式"}
                </button>
              </div>
            ) : null}

            {addMode === "fund" ? (
              <div className="flex flex-wrap gap-1">
                <input
                  value={fundSym}
                  onChange={(e) => setFundSym(e.target.value.toUpperCase())}
                  className="w-16 rounded border border-fs-border bg-fs-elevated px-1 py-1 font-mono text-[11px]"
                />
                <select
                  value={fundMetric}
                  onChange={(e) =>
                    setFundMetric(e.target.value as FundamentalMetric)
                  }
                  className="min-w-0 flex-1 rounded border border-fs-border bg-fs-elevated px-1 py-1 text-[11px]"
                >
                  {FUND_METRICS.map((m) => (
                    <option key={m} value={m}>
                      {FUNDAMENTAL_METRIC_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {formError ? (
              <p className="mt-1 text-[10px] text-amber-500">{formError}</p>
            ) : null}
            {layerErrors.length ? (
              <p className="mt-1 text-[10px] text-amber-500">
                {layerErrors.slice(0, 2).join("；")}
              </p>
            ) : null}
            {loadingExtra ? (
              <p className="mt-1 text-[10px] text-fs-muted">加载叠加数据…</p>
            ) : null}

            <button
              type="button"
              onClick={tryAdd}
              disabled={!canAdd}
              className="mt-2 w-full rounded bg-fs-elevated py-1 text-[11px] text-fs-text hover:bg-fs-border disabled:opacity-40"
            >
              添加
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

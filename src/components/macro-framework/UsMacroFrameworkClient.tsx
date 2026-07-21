"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CALENDAR,
  CONTRADICTION_SIGNALS,
  MACRO_STATE_BRIEF,
  TIMING_LABEL,
} from "@/lib/macro-framework/data";
import {
  INDICATOR_MATRIX_CATEGORY,
  MATRIX_CATEGORY_DESC,
  MATRIX_CATEGORY_LABEL,
  MATRIX_CATEGORY_ORDER,
  type MatrixCategory,
} from "@/lib/macro-framework/matrixCategories";
import { generateAllCategoryBriefs } from "@/lib/macro-framework/categoryAnalysis";
import type { IndicatorTiming, MacroIndicator } from "@/lib/macro-framework/types";
import { indicatorsById } from "@/lib/macro-framework/mergeIndicators";
import { changeArrow, formatValue, sparklinePath, timingAccent } from "@/lib/macro-framework/utils";

const TIMINGS: IndicatorTiming[] = ["leading", "coincident", "lagging"];

/** 宏观图景月份（月度更新宏观判断时改此处） */
const MACRO_VIGNETTE_MONTH = "2026-07";

const MATRIX_GRID = "grid grid-cols-[11rem_minmax(360px,1fr)_minmax(360px,1fr)_minmax(360px,1fr)]";

function MatrixColumnHeader({ timing, withDivider }: { timing: IndicatorTiming; withDivider?: boolean }) {
  const accent = timingAccent(timing);
  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-2.5 ${
        withDivider ? "border-l border-fs-border/70" : ""
      }`}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
      <span className="text-sm font-semibold tracking-wide" style={{ color: accent }}>
        {TIMING_LABEL[timing]}指标
      </span>
    </div>
  );
}

const SVG_MUTED = "#454542";
const SVG_BORDER = "#e9e9e7";
const SVG_TEXT = "#1a1a18";
const SVG_TEXT_MUTED = "#454542";

function boxEdgeInset(ux: number, uy: number, halfW: number, halfH: number, gap = 8): number {
  const ax = Math.abs(ux);
  const ay = Math.abs(uy);
  if (ax < 1e-6) return halfH + gap;
  if (ay < 1e-6) return halfW + gap;
  return Math.min(halfW / ax, halfH / ay) + gap;
}

function SectorFlowDiagram() {
  const W = 720;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2 + 28;
  const radius = 168;
  const boxW = 120;
  const boxH = 52;
  const halfW = boxW / 2;
  const halfH = boxH / 2;

  const nodeDefs = [
    { id: "corporate", label: "企业部门", sub: "Corporate" },
    { id: "household", label: "居民部门", sub: "Household" },
    { id: "fiscal", label: "政府", sub: "财政政策" },
    { id: "monetary", label: "央行", sub: "货币政策" },
    { id: "financial", label: "金融部门", sub: "Financial" },
  ] as const;

  const nodes = nodeDefs.map((n, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / nodeDefs.length;
    const centerX = cx + radius * Math.cos(angle);
    const centerY = cy + radius * Math.sin(angle);
    return {
      ...n,
      x: centerX - halfW,
      y: centerY - halfH,
      centerX,
      centerY,
    };
  });

  function edgeEndpoints(a: (typeof nodes)[number], b: (typeof nodes)[number]) {
    const dx = b.centerX - a.centerX;
    const dy = b.centerY - a.centerY;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const insetA = boxEdgeInset(ux, uy, halfW, halfH);
    const insetB = boxEdgeInset(-ux, -uy, halfW, halfH);
    return {
      x1: a.centerX + ux * insetA,
      y1: a.centerY + uy * insetA,
      x2: b.centerX - ux * insetB,
      y2: b.centerY - uy * insetB,
    };
  }

  const edges = nodes.map((_, i) => edgeEndpoints(nodes[i], nodes[(i + 1) % nodes.length]));

  return (
    <div className="overflow-x-auto">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full max-w-[720px]"
      >
        <defs>
          <marker id="arrowhead" markerWidth={8} markerHeight={6} refX={7} refY={3} orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill={SVG_MUTED} />
          </marker>
          <marker id="arrowhead-start" markerWidth={8} markerHeight={6} refX={1} refY={3} orient="auto">
            <polygon points="8 0, 0 3, 8 6" fill={SVG_MUTED} />
          </marker>
        </defs>

        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={SVG_MUTED}
            strokeWidth={2}
            markerEnd="url(#arrowhead)"
            markerStart="url(#arrowhead-start)"
          />
        ))}

        {nodes.map((n) => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={boxW} height={boxH} rx={6} fill="#ffffff" stroke={SVG_BORDER} strokeWidth={1.5} />
            <text x={n.x + boxW / 2} y={n.y + 22} textAnchor="middle" fontSize={13} fontWeight={600} fill={SVG_TEXT}>
              {n.label}
            </text>
            <text x={n.x + boxW / 2} y={n.y + 38} textAnchor="middle" fontSize={10} fill={SVG_TEXT_MUTED}>
              {n.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MatrixIndicatorCard({
  ind,
  timing,
  selected,
  onClick,
}: {
  ind: MacroIndicator;
  timing: IndicatorTiming;
  selected: boolean;
  onClick: () => void;
}) {
  const accent = timingAccent(timing);
  const chg = changeArrow(ind.value, ind.prevValue);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 rounded-lg border p-2 text-left transition-colors hover:bg-fs-elevated ${
        selected ? "border-fs-accent bg-fs-accent-soft/50" : "border-fs-border bg-white"
      }`}
    >
      <div className="flex gap-1.5">
        <div className="w-0.5 shrink-0 rounded-sm" style={{ background: accent, minHeight: 32 }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium leading-tight text-fs-text">{ind.nameZh}</div>
          <div className="truncate font-mono text-[9px] text-fs-muted">{ind.nameEn}</div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0 pl-2">
        <span className="text-xs font-semibold tabular-nums text-fs-text">
          {formatValue(ind.value, ind.unit)}
        </span>
        <span
          className={`text-[10px] ${
            chg === "↑" ? "text-fs-accent-text" : chg === "↓" ? "text-fs-negative" : "text-fs-muted"
          }`}
        >
          {chg}
        </span>
        <span className="text-[9px] text-fs-muted">{ind.asOfDate}</span>
      </div>
      <div className="mt-1 pl-2">
        {ind.sparkline.length > 0 ? (
          <svg className="h-6 w-full" viewBox="0 0 80 24" preserveAspectRatio="none">
            <path
              d={sparklinePath(ind.sparkline, 80, 24)}
              fill="none"
              stroke={accent}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div className="flex h-6 items-center text-[9px] text-fs-muted">暂无序列</div>
        )}
      </div>
    </button>
  );
}

function MatrixCell({
  indicators,
  timing,
  selectedId,
  onSelect,
}: {
  indicators: MacroIndicator[];
  timing: IndicatorTiming;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (indicators.length === 0) {
    return (
      <div className="flex min-h-[120px] items-center justify-center rounded-lg bg-fs-elevated/40">
        <span className="text-[10px] text-fs-muted">—</span>
      </div>
    );
  }

  return (
    <div className="grid min-w-[360px] grid-cols-2 gap-2">
      {indicators.map((ind) => (
        <MatrixIndicatorCard
          key={ind.id}
          ind={ind}
          timing={timing}
          selected={selectedId === ind.id}
          onClick={() => onSelect(ind.id)}
        />
      ))}
    </div>
  );
}

export function UsMacroFrameworkClient({ indicators }: { indicators: MacroIndicator[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return false;
        const j = (await r.json().catch(() => ({}))) as { user?: { role?: string } };
        return String(j.user?.role ?? "").trim().toLowerCase() === "admin";
      })
      .then((admin) => {
        if (!cancelled) setIsAdmin(admin);
      })
      .catch(() => {
        /* 未登录或请求失败则保持非 admin */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const indById = useMemo(() => indicatorsById(indicators), [indicators]);

  const matrix = useMemo(() => {
    const grid: Record<MatrixCategory, Record<IndicatorTiming, MacroIndicator[]>> = {} as Record<
      MatrixCategory,
      Record<IndicatorTiming, MacroIndicator[]>
    >;
    for (const cat of MATRIX_CATEGORY_ORDER) {
      grid[cat] = { leading: [], coincident: [], lagging: [] };
    }
    for (const ind of indicators) {
      const cat = INDICATOR_MATRIX_CATEGORY[ind.id];
      if (cat && grid[cat]) {
        grid[cat][ind.timing].push(ind);
      }
    }
    return grid;
  }, [indicators]);

  const categoryBriefs = useMemo(() => {
    const grouped = {} as Record<MatrixCategory, MacroIndicator[]>;
    for (const cat of MATRIX_CATEGORY_ORDER) {
      grouped[cat] = [
        ...matrix[cat].leading,
        ...matrix[cat].coincident,
        ...matrix[cat].lagging,
      ];
    }
    return generateAllCategoryBriefs(grouped);
  }, [matrix]);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-4 py-4 lg:px-6">
      <div className="space-y-5">
        <header>
          <h1 className="flex items-baseline gap-2 text-xl font-semibold text-fs-text">
            美国宏观分析框架
            <span className="text-sm font-normal text-fs-muted">{MACRO_VIGNETTE_MONTH}</span>
          </h1>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: "周期阶段", value: "晚期扩张", cls: "text-fs-text" },
            {
              label: "NFCI",
              value: formatValue(indById.nfci?.value ?? null, indById.nfci?.unit ?? "σ"),
              cls:
                indById.nfci?.value != null && indById.nfci.value > 0
                  ? "text-amber-600"
                  : "text-fs-text",
            },
            {
              label: "Core PCE",
              value: formatValue(indById["core-pce"]?.value ?? null, indById["core-pce"]?.unit ?? "YoY%"),
              cls: "text-fs-text",
            },
            { label: "GDPNow", value: "N/A", cls: "text-fs-muted" },
            { label: "衰退概率", value: "N/A", cls: "text-fs-muted" },
            { label: "扩散指数", value: "N/A", cls: "text-fs-muted" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-fs-border bg-fs-elevated px-3 py-2">
              <div className={`text-base font-semibold ${s.cls ?? "text-fs-text"}`}>{s.value}</div>
              <div className="text-[11px] text-fs-muted">{s.label}</div>
            </div>
          ))}
        </div>

        <section className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-[240px_minmax(400px,1fr)_260px] items-start gap-5">
            <aside className="rounded-lg border border-fs-border bg-fs-elevated/80 p-4">
              <h3 className="text-xs font-medium text-fs-secondary">宏观状态</h3>
              <p className="mt-2 text-xs leading-relaxed text-fs-text">{MACRO_STATE_BRIEF}</p>
              <h3 className="mt-4 text-xs font-medium text-fs-secondary">分歧</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-fs-secondary">
                {CONTRADICTION_SIGNALS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
            <div className="min-w-0 flex justify-center">
              <SectorFlowDiagram />
            </div>
            <aside className="rounded-lg border border-fs-border bg-fs-elevated/80 p-4">
              <h3 className="mb-2 text-xs font-medium text-fs-secondary">数据日历（7 天）</h3>
              <div className="grid grid-cols-[2.5rem_1fr_2rem] gap-x-2 text-[10px] text-fs-muted">
                <span>日期</span>
                <span>事件</span>
                <span className="text-right">重要性</span>
              </div>
              <ul className="mt-1 space-y-1 text-xs text-fs-secondary">
                {CALENDAR.map((c) => (
                  <li key={c.date} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-x-2">
                    <span className="font-mono text-fs-muted">{c.date.slice(5)}</span>
                    <span className="truncate">{c.event}</span>
                    <span className="text-right text-fs-muted">{c.impact}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section>
          <div className="overflow-x-auto">
            <div className={`min-w-[1280px] ${MATRIX_GRID}`}>
              <div aria-hidden className="sticky left-0 z-10 bg-fs-bg" />
              {TIMINGS.map((t, i) => (
                <MatrixColumnHeader key={t} timing={t} withDivider={i > 0} />
              ))}

              {MATRIX_CATEGORY_ORDER.map((cat, rowIdx) => (
                <Fragment key={cat}>
                  <div
                    className={`sticky left-0 z-10 bg-fs-bg px-3 py-3 align-top ${
                      rowIdx < MATRIX_CATEGORY_ORDER.length - 1
                        ? "border-b border-dashed border-fs-border"
                        : ""
                    }`}
                  >
                    <div className="text-xs font-semibold text-fs-text">{MATRIX_CATEGORY_LABEL[cat]}</div>
                    <div className="mt-1.5 text-[10px] font-medium text-fs-accent-text">近况分析</div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-fs-secondary">
                      {categoryBriefs[cat] ?? MATRIX_CATEGORY_DESC[cat]}
                    </p>
                  </div>
                  {TIMINGS.map((timing, colIdx) => (
                    <div
                      key={`${cat}-${timing}`}
                      className={`p-2 align-top ${colIdx > 0 ? "border-l border-fs-border/70" : ""} ${
                        rowIdx < MATRIX_CATEGORY_ORDER.length - 1
                          ? "border-b border-dashed border-fs-border"
                          : ""
                      }`}
                    >
                      <MatrixCell
                        indicators={matrix[cat][timing]}
                        timing={timing}
                        selectedId={selectedId}
                        onSelect={(id) => setSelectedId((p) => (p === id ? null : id))}
                      />
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        {selectedId && indById[selectedId] && (
          <div className="rounded-lg border border-fs-border bg-fs-elevated/80 p-4 text-sm">
            <div className="font-medium text-fs-text">
              {indById[selectedId].nameZh}
              <span className="ml-2 font-normal text-fs-muted">{indById[selectedId].nameEn}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-fs-secondary">
              <span>
                最新{" "}
                <strong className="text-fs-text">
                  {formatValue(indById[selectedId].value, indById[selectedId].unit)}
                </strong>
              </span>
              <span>{indById[selectedId].asOfDate}</span>
              {isAdmin ? <span>{indById[selectedId].source}</span> : null}
              <span style={{ color: timingAccent(indById[selectedId].timing) }}>
                {TIMING_LABEL[indById[selectedId].timing]}
              </span>
              <span>
                {MATRIX_CATEGORY_LABEL[INDICATOR_MATRIX_CATEGORY[selectedId] ?? "activity"]}
              </span>
            </div>
            <p className="mt-2 text-fs-secondary">{indById[selectedId].description}</p>
            <div className="mt-3 max-w-md">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-fs-muted">近 6 期走势</div>
              {indById[selectedId].sparkline.length > 0 ? (
                <svg
                  className="h-16 w-full rounded border border-fs-border bg-white p-2"
                  viewBox="0 0 160 48"
                  preserveAspectRatio="none"
                >
                  <path
                    d={sparklinePath(indById[selectedId].sparkline, 160, 48)}
                    fill="none"
                    stroke={timingAccent(indById[selectedId].timing)}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <div className="rounded border border-fs-border bg-white p-4 text-xs text-fs-muted">
                  本地库暂无历史观测
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

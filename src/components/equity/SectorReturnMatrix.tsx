"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { randomUUID } from "@/lib/randomId";
import { STYLE_BUCKETS } from "@/lib/equity/styleBuckets";
import {
  getSectorDef,
  sectorSlug,
  type GicsSector,
} from "@/lib/equity/gicsCatalog";

export type SectorColumnMeta = {
  sector: string;
  nameZh: string;
  etf: string;
  style: string;
  styleNameZh: string;
};

type PeriodReturns = {
  absolute: Record<string, number | null>;
  excess: Record<string, number | null>;
  spyReturn: number | null;
  loading: boolean;
  error: string | null;
};

type PeriodBlock = {
  id: string;
  startDate: string;
  endDate: string;
  returns: PeriodReturns;
};

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

function sectorHref(sector: string): string {
  return `/equity/sectors/${encodeURIComponent(sectorSlug(sector as GicsSector))}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ytdStartIso(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}

/** 与风格得分卡快捷窗口对齐的日历日近似 */
const MATRIX_PRESETS = [
  { id: "1w", label: "1w", days: 7 },
  { id: "1m", label: "1m", days: 21 },
  { id: "3m", label: "3m", days: 63 },
  { id: "YTD", label: "YTD", days: "ytd" as const },
  { id: "1Y", label: "1Y", days: 252 },
] as const;

type MatrixPresetId = (typeof MATRIX_PRESETS)[number]["id"];

function rangeForPreset(id: MatrixPresetId): { startDate: string; endDate: string } {
  const endDate = todayIso();
  const def = MATRIX_PRESETS.find((p) => p.id === id);
  if (!def) return { startDate: isoDaysAgo(63), endDate };
  if (def.days === "ytd") return { startDate: ytdStartIso(), endDate };
  return { startDate: isoDaysAgo(def.days), endDate };
}

/** 若起止日恰好匹配某个预设（截止=今天），返回该 id，否则 null */
function matchPreset(startDate: string, endDate: string): MatrixPresetId | null {
  if (endDate !== todayIso()) return null;
  for (const p of MATRIX_PRESETS) {
    const r = rangeForPreset(p.id);
    if (r.startDate === startDate && r.endDate === endDate) return p.id;
  }
  return null;
}

function emptyReturns(): PeriodReturns {
  return { absolute: {}, excess: {}, spyReturn: null, loading: false, error: null };
}

function defaultBlocks(): PeriodBlock[] {
  const { startDate, endDate } = rangeForPreset("3m");
  return [
    {
      id: randomUUID(),
      startDate,
      endDate,
      returns: { ...emptyReturns(), loading: true },
    },
  ];
}

/** 固定列序：成长 → 周期 → 防御 */
const COLUMN_ORDER: SectorColumnMeta[] = STYLE_BUCKETS.flatMap((bucket) =>
  bucket.sectors.map((sector) => {
    const def = getSectorDef(sector);
    return {
      sector,
      nameZh: def.nameZh,
      etf: def.etf,
      style: bucket.id,
      styleNameZh: bucket.nameZh,
    };
  }),
);

/** 周期 / 防御组的首列：左侧加粗，形成「成长 | 周期 | 防御」组间分割线 */
const STYLE_GROUP_START_SECTORS = new Set<string>(
  STYLE_BUCKETS.slice(1).map((b) => b.sectors[0]),
);

function isStyleGroupStart(sector: string): boolean {
  return STYLE_GROUP_START_SECTORS.has(sector);
}

async function fetchPeriodReturns(
  startDate: string,
  endDate: string,
): Promise<Omit<PeriodReturns, "loading">> {
  const q = new URLSearchParams({ from: startDate, to: endDate });
  const r = await fetch(`/api/equity/sector-returns?${q}`, { cache: "no-store" });
  const j = (await r.json()) as {
    error?: string;
    spyReturn?: number | null;
    columns?: {
      sector: string;
      absoluteReturn: number | null;
      excessVsSpy: number | null;
    }[];
  };
  if (!r.ok) throw new Error(j.error ?? "加载失败");

  const absolute: Record<string, number | null> = {};
  const excess: Record<string, number | null> = {};
  for (const c of j.columns ?? []) {
    absolute[c.sector] = c.absoluteReturn;
    excess[c.sector] = c.excessVsSpy;
  }
  return { absolute, excess, spyReturn: j.spyReturn ?? null, error: null };
}

export function SectorReturnMatrix() {
  const [blocks, setBlocks] = useState<PeriodBlock[]>(defaultBlocks);

  const loadBlock = useCallback(async (id: string, startDate: string, endDate: string) => {
    if (!startDate || !endDate) return;
    if (endDate < startDate) {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                returns: {
                  ...emptyReturns(),
                  error: "截止日期须不早于开始日期",
                },
              }
            : b,
        ),
      );
      return;
    }

    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? { ...b, returns: { ...b.returns, loading: true, error: null } }
          : b,
      ),
    );

    try {
      const data = await fetchPeriodReturns(startDate, endDate);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, returns: { ...data, loading: false } }
            : b,
        ),
      );
    } catch (e) {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                returns: {
                  ...emptyReturns(),
                  error: e instanceof Error ? e.message : "加载失败",
                },
              }
            : b,
        ),
      );
    }
  }, []);

  // 初始块加载
  useEffect(() => {
    const first = blocks[0];
    if (!first) return;
    void loadBlock(first.id, first.startDate, first.endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时拉默认区间
  }, []);

  const addBlock = () => {
    const id = randomUUID();
    const startDate = isoDaysAgo(21);
    const endDate = todayIso();
    setBlocks((prev) => [
      ...prev,
      { id, startDate, endDate, returns: { ...emptyReturns(), loading: true } },
    ]);
    void loadBlock(id, startDate, endDate);
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== id)));
  };

  const updateDate = (id: string, field: "startDate" | "endDate", value: string) => {
    setBlocks((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, [field]: value } : b));
      const block = next.find((b) => b.id === id);
      if (block?.startDate && block.endDate) {
        queueMicrotask(() => {
          void loadBlock(id, block.startDate, block.endDate);
        });
      }
      return next;
    });
  };

  /** 快捷窗口只改第一个区间；选中态由日期是否匹配预设推导 */
  const applyPreset = (presetId: MatrixPresetId) => {
    const first = blocks[0];
    if (!first) return;
    const { startDate, endDate } = rangeForPreset(presetId);
    setBlocks((prev) =>
      prev.map((b, i) => (i === 0 ? { ...b, startDate, endDate } : b)),
    );
    void loadBlock(first.id, startDate, endDate);
  };

  const selectedPreset = useMemo(() => {
    const first = blocks[0];
    if (!first) return null;
    return matchPreset(first.startDate, first.endDate);
  }, [blocks]);

  const styleGroups = useMemo(() => {
    return STYLE_BUCKETS.map((bucket) => ({
      ...bucket,
      cols: COLUMN_ORDER.filter((c) => c.style === bucket.id),
    }));
  }, []);

  const totalCols = COLUMN_ORDER.length;

  return (
    <section className="overflow-x-auto rounded-md border border-fs-border">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-fs-elevated/50 text-[11px] text-fs-muted">
            <th
              colSpan={2}
              className="sticky left-0 z-10 min-w-[14rem] border-b border-r border-fs-border bg-fs-elevated/80 px-2 py-1 font-medium"
            >
              <button
                type="button"
                onClick={addBlock}
                className="rounded-md bg-fs-accent-soft px-2.5 py-1 text-xs font-medium text-fs-accent-text ring-1 ring-fs-accent/25 hover:opacity-90"
              >
                新建区间
              </button>
            </th>
            <th className="min-w-[4.5rem] border-b border-r border-fs-border px-2 py-1.5 text-center font-medium">
              基准
            </th>
            {styleGroups.map((g, gi) => (
              <th
                key={g.id}
                colSpan={g.cols.length}
                className={
                  gi > 0
                    ? "border-b border-l-2 border-r border-fs-border px-2 py-1.5 text-center font-medium last:border-r-0"
                    : "border-b border-r border-fs-border px-2 py-1.5 text-center font-medium"
                }
              >
                {g.nameZh}行业
              </th>
            ))}
          </tr>
          <tr className="bg-fs-elevated/30 text-xs">
            <th
              colSpan={2}
              className="sticky left-0 z-10 min-w-[14rem] border-b border-r border-fs-border bg-fs-elevated/80 px-2 py-1.5"
            >
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="第一个区间快捷窗口">
                {MATRIX_PRESETS.map((p) => {
                  const active = selectedPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={
                        active
                          ? "rounded px-1.5 py-0.5 text-[11px] font-medium bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30"
                          : "rounded px-1.5 py-0.5 text-[11px] font-medium text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </th>
            <th className="min-w-[4.5rem] border-b border-r border-fs-border px-1.5 py-1.5 text-center font-medium text-fs-text">
              标普500
              <div className="text-[10px] font-normal text-fs-muted">SPY</div>
            </th>
            {COLUMN_ORDER.map((c, ci) => (
              <th
                key={c.sector}
                className={[
                  "min-w-[4.5rem] border-b px-1.5 py-1.5 text-center font-medium",
                  isStyleGroupStart(c.sector) ? "border-l-2 border-fs-border" : "",
                  ci === COLUMN_ORDER.length - 1 ? "" : "border-r border-fs-border",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <Link
                  href={sectorHref(c.sector)}
                  className="text-fs-accent-text hover:underline"
                  title={c.sector}
                >
                  {c.nameZh}
                </Link>
                <div className="text-[10px] font-normal text-fs-muted">{c.etf}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, bi) => (
            <PeriodBlockRows
              key={block.id}
              block={block}
              index={bi}
              canRemove={blocks.length > 1}
              onChangeDate={updateDate}
              onRemove={removeBlock}
              totalCols={totalCols}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PeriodBlockRows({
  block,
  index,
  canRemove,
  onChangeDate,
  onRemove,
  totalCols,
}: {
  block: PeriodBlock;
  index: number;
  canRemove: boolean;
  onChangeDate: (id: string, field: "startDate" | "endDate", value: string) => void;
  onRemove: (id: string) => void;
  totalCols: number;
}) {
  const dateCell =
    "sticky left-0 z-10 min-w-[8.5rem] border-r border-fs-border bg-fs-elevated px-2 py-1 text-xs text-fs-muted";
  const metricCell =
    "sticky left-[8.5rem] z-10 min-w-[4.5rem] border-r border-fs-border bg-fs-elevated px-2 py-1 text-xs text-fs-muted";
  const valueCell =
    "border-r border-fs-border px-1.5 py-1 text-center text-xs tabular-nums last:border-r-0";
  const dateInputClass =
    "mt-0.5 w-full min-w-0 rounded border border-fs-border bg-white px-1.5 py-0.5 text-xs text-fs-text outline-none focus:ring-1 focus:ring-fs-accent/40";

  const spyAbs = block.returns.spyReturn;
  /** 相对收益行：SPY 为基准，超额为 0 */
  const spyExcess = spyAbs == null ? null : 0;

  const sectorValueClass = (sector: string, ci: number) =>
    [
      "px-1.5 py-1 text-center text-xs tabular-nums",
      isStyleGroupStart(sector) ? "border-l-2 border-fs-border" : "",
      ci === COLUMN_ORDER.length - 1 ? "" : "border-r border-fs-border",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <>
      {index > 0 ? (
        <tr>
          <td
            colSpan={totalCols + 3}
            className="border-t-2 border-fs-border bg-fs-elevated/20 py-0.5"
          />
        </tr>
      ) : null}

      {block.returns.error ? (
        <tr className="border-t border-fs-border/40">
          <td colSpan={totalCols + 3} className="px-2 py-1 text-xs text-red-300">
            {block.returns.error}
          </td>
        </tr>
      ) : null}

      <tr className="border-t border-fs-border/50">
        <td className={dateCell}>
          <div className="flex items-center gap-1">
            <span className="shrink-0">开始日期</span>
            {canRemove ? (
              <button
                type="button"
                onClick={() => onRemove(block.id)}
                className="ml-auto text-[10px] text-fs-muted hover:text-red-400"
                title="删除此区间"
              >
                删除
              </button>
            ) : null}
          </div>
          <input
            type="date"
            value={block.startDate}
            onChange={(e) => onChangeDate(block.id, "startDate", e.target.value)}
            className={dateInputClass}
          />
        </td>
        <td className={metricCell}>
          绝对收益
          {block.returns.loading ? (
            <span className="ml-1 text-[10px] text-fs-muted">…</span>
          ) : null}
        </td>
        <td className={`${valueCell} ${pctClass(spyAbs)}`}>
          {block.returns.loading ? "…" : fmtPct(spyAbs)}
        </td>
        {COLUMN_ORDER.map((c, ci) => {
          const v = block.returns.absolute[c.sector] ?? null;
          return (
            <td key={`abs-${c.sector}`} className={`${sectorValueClass(c.sector, ci)} ${pctClass(v)}`}>
              {block.returns.loading ? "…" : fmtPct(v)}
            </td>
          );
        })}
      </tr>

      <tr className="border-t border-fs-border/40">
        <td className={dateCell}>
          <div>截止日期</div>
          <input
            type="date"
            value={block.endDate}
            onChange={(e) => onChangeDate(block.id, "endDate", e.target.value)}
            className={dateInputClass}
          />
        </td>
        <td className={metricCell}>相对收益</td>
        <td className={`${valueCell} text-fs-muted`}>
          {block.returns.loading ? "…" : spyExcess == null ? "—" : "基准"}
        </td>
        {COLUMN_ORDER.map((c, ci) => {
          const v = block.returns.excess[c.sector] ?? null;
          return (
            <td key={`ex-${c.sector}`} className={`${sectorValueClass(c.sector, ci)} ${pctClass(v)}`}>
              {block.returns.loading ? "…" : fmtPct(v)}
            </td>
          );
        })}
      </tr>
    </>
  );
}

/** 供测试：列顺序与风格篮子一致 */
export function matrixColumnSectors(): string[] {
  return COLUMN_ORDER.map((c) => c.sector);
}

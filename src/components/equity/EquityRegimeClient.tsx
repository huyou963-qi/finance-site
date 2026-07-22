"use client";

/**
 * 宏观 regime 页（Phase 4 WS5）：/equity/regime。
 * 当前 regime 卡 + regime 时间线（增长/通胀 z + 象限背景带 + NBER 对照）+ 分 regime 的
 * GICS 行业次期收益热力图。数据源 GET /api/equity/regime。不用 useSearchParams。
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  RegimeTimelineChart,
  type RegimePoint,
} from "@/components/equity/RegimeTimelineChart";
import {
  REGIME_COLOR,
  REGIME_DESC,
  REGIME_LABEL,
  REGIME_ORDER,
  divergingColor,
  onColorInk,
  type RegimeKey,
} from "@/components/equity/regimeVisuals";

type RegimeInputs = {
  growthZ: number | null;
  inflationMomZ: number | null;
};
type StoredRegime = {
  date: string;
  growthState: string;
  inflationState: string;
  regime: RegimeKey;
  recession: number;
  inputs: RegimeInputs;
};
type RegimeCell = { meanReturn: number | null; periods: number };
type SectorPerf = {
  start: string;
  end: string;
  sectors: string[];
  regimes: RegimeKey[];
  cells: Record<string, Record<RegimeKey, RegimeCell>>;
  marketByRegime: Record<RegimeKey, RegimeCell>;
  regimeAvailable: boolean;
};
type ApiResponse = {
  regimes: StoredRegime[];
  sectorPerformance: SectorPerf;
  current: StoredRegime | null;
  available: boolean;
};

function pct(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}
function num(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

export function EquityRegimeClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/equity/regime", { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? "请求失败");
        return json as ApiResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "请求失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const timelinePoints: RegimePoint[] = useMemo(() => {
    if (!data) return [];
    return data.regimes.map((r) => ({
      date: r.date,
      regime: r.regime,
      recession: r.recession,
      growthZ: r.inputs?.growthZ ?? null,
      inflationMomZ: r.inputs?.inflationMomZ ?? null,
    }));
  }, [data]);

  // 行业收益色阶尺度：用全表绝对值 95 分位附近，避免极端值压平对比
  const sectorScale = useMemo(() => {
    if (!data) return 0.03;
    const vals: number[] = [];
    for (const s of data.sectorPerformance.sectors) {
      for (const rk of data.sectorPerformance.regimes) {
        const v = data.sectorPerformance.cells[s]?.[rk]?.meanReturn;
        if (v != null && Number.isFinite(v)) vals.push(Math.abs(v));
      }
    }
    if (!vals.length) return 0.03;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.9)] || 0.03;
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold text-fs-text">宏观 Regime</h1>
        <p className="text-sm text-fs-muted">
          增长×通胀四象限（近似 PIT）+ 分 regime 的行业表现 · NBER 衰退对照
        </p>
        <Link
          href="/equity/factor-research"
          className="ml-auto text-sm text-fs-accent-text hover:underline"
        >
          因子研究 →
        </Link>
      </header>

      {loading ? (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">
          加载中…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-6 text-sm text-red-400">
          {error}
        </div>
      ) : !data || !data.available ? (
        <div className="rounded-lg border border-dashed border-fs-border px-4 py-10 text-center text-sm text-fs-muted">
          regime 尚未构建。运行 <code className="text-fs-text">npm run quant:build-regime</code> 后刷新。
        </div>
      ) : (
        <>
          {/* 当前 regime + 四象限图例 */}
          <section className="mb-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {data.current ? (
              <div
                className="rounded-lg border p-4"
                style={{ borderColor: `${REGIME_COLOR[data.current.regime]}66` }}
              >
                <div className="text-xs text-fs-muted">最新 regime（{data.current.date}）</div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-sm"
                    style={{ background: REGIME_COLOR[data.current.regime] }}
                  />
                  <span className="text-xl font-semibold text-fs-text">
                    {REGIME_LABEL[data.current.regime]}
                  </span>
                  {data.current.recession === 1 ? (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400">
                      NBER 衰退
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-fs-muted">{REGIME_DESC[data.current.regime]}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-fs-muted">增长 z</div>
                    <div className="tabular-nums text-fs-text">{num(data.current.inputs?.growthZ)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-fs-muted">通胀动量 z</div>
                    <div className="tabular-nums text-fs-text">
                      {num(data.current.inputs?.inflationMomZ)}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-fs-border p-4">
              <div className="mb-2 text-sm font-medium text-fs-text">四象限</div>
              <div className="grid grid-cols-2 gap-2">
                {REGIME_ORDER.map((rk) => (
                  <div key={rk} className="flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: REGIME_COLOR[rk] }}
                    />
                    <span className="text-fs-text">{REGIME_LABEL[rk]}</span>
                    <span className="text-xs text-fs-muted">{REGIME_DESC[rk]}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* regime 时间线 */}
          <section className="mb-5 rounded-lg border border-fs-border p-4">
            <h2 className="mb-2 text-sm font-medium text-fs-text">
              Regime 时间线（{data.sectorPerformance.start} → {data.sectorPerformance.end}）
            </h2>
            <RegimeTimelineChart points={timelinePoints} />
            <p className="mt-1 text-xs text-fs-muted">
              背景色带 = 当期象限；增长 z 转负领先/同步 NBER 衰退。全程 as-of（用估算发布日）防前视。
            </p>
          </section>

          {/* 分 regime 行业收益热力图 */}
          <section className="mb-5 rounded-lg border border-fs-border p-4">
            <h2 className="mb-3 text-sm font-medium text-fs-text">分 Regime 的 GICS 行业次期等权收益（月均）</h2>
            <div className="overflow-x-auto">
              <table className="min-w-[560px] text-sm">
                <thead>
                  <tr className="text-xs text-fs-muted">
                    <th className="px-2 py-1 text-left font-medium">行业 \ regime</th>
                    {data.sectorPerformance.regimes.map((rk) => (
                      <th key={rk} className="px-2 py-1 text-center font-medium">
                        <span
                          className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                          style={{ background: REGIME_COLOR[rk] }}
                        />
                        {REGIME_LABEL[rk]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sectorPerformance.sectors.map((s) => (
                    <tr key={s}>
                      <th className="whitespace-nowrap px-2 py-1 text-left font-normal text-fs-text">{s}</th>
                      {data.sectorPerformance.regimes.map((rk) => {
                        const cell = data.sectorPerformance.cells[s]?.[rk];
                        const v = cell?.meanReturn ?? null;
                        return (
                          <td
                            key={rk}
                            className="px-2 py-1 text-center tabular-nums"
                            style={{ background: divergingColor(v, sectorScale), color: onColorInk(v, sectorScale) }}
                            title={`${s} · ${REGIME_LABEL[rk]}：${pct(v)}（${cell?.periods ?? 0} 期）`}
                          >
                            {pct(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-fs-border">
                    <th className="whitespace-nowrap px-2 py-1 text-left font-medium text-fs-text">全市场等权</th>
                    {data.sectorPerformance.regimes.map((rk) => {
                      const cell = data.sectorPerformance.marketByRegime[rk];
                      return (
                        <td key={rk} className="px-2 py-1 text-center tabular-nums text-fs-text">
                          {pct(cell?.meanReturn)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-fs-muted">
              红=高于零的月均收益 · 蓝=低于零 · 灰≈零。GICS 现值近似（非 PIT，早年退市股无归属）。
              回测可用 regimeFilter 只在选定象限持仓（见回测页）。
            </p>
          </section>
        </>
      )}
    </div>
  );
}

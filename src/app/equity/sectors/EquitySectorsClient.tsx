"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectorNavChart, StyleBarChart } from "@/components/equity/SectorCharts";
import { SectorReturnMatrix } from "@/components/equity/SectorReturnMatrix";
import { CYCLE_BACKGROUND_KEYS } from "@/lib/equity/sectorMacroMap";

type SectorRow = {
  sector: string;
  nameZh: string;
  etf: string;
  style: string;
  absoluteReturn: number | null;
  excessVsSpy: number | null;
};

type StyleRow = {
  id: string;
  nameZh: string;
  equalWeightReturn: number | null;
  equalWeightExcess: number | null;
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

export function EquitySectorsClient() {
  /** 风格得分卡 / 净值图固定用 3M；区间切换在收益矩阵内完成 */
  const windowId = "3M";
  const [sectors, setSectors] = useState<SectorRow[]>([]);
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [spyReturn, setSpyReturn] = useState<number | null>(null);
  const [nav, setNav] = useState<Record<string, { time: number; value: number }[]>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [macroBg, setMacroBg] = useState<{ label: string; last: number | null }[]>([]);

  const load = useCallback(async (w: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/equity/sector-returns?window=${w}&nav=1`, {
        cache: "no-store",
      });
      const j = (await r.json()) as {
        error?: string;
        sectors?: SectorRow[];
        styles?: StyleRow[];
        spyReturn?: number | null;
        nav?: Record<string, { time: number; value: number }[]>;
        dataCoverage?: { etfsMissing?: string[] };
      };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setSectors(j.sectors ?? []);
      setStyles(j.styles ?? []);
      setSpyReturn(j.spyReturn ?? null);
      setNav(j.nav ?? {});
      setMissing(j.dataCoverage?.etfsMissing ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(windowId);
  }, [load]);

  useEffect(() => {
    const series = CYCLE_BACKGROUND_KEYS.map((k) => k.key).join(",");
    fetch(`/api/data/macro?source=unified&series=${encodeURIComponent(series)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as {
          categories?: string[];
          series?: { key?: string; name?: string; data?: (number | null)[] }[];
        };
      })
      .then((payload) => {
        if (!payload?.categories?.length || !payload.series?.length) {
          setMacroBg([]);
          return;
        }
        const byKey = new Map(
          payload.series.map((s) => [s.key ?? s.name ?? "", s] as const),
        );
        setMacroBg(
          CYCLE_BACKGROUND_KEYS.map((k) => {
            const s = byKey.get(k.key);
            const data = s?.data ?? [];
            let last: number | null = null;
            for (let i = data.length - 1; i >= 0; i--) {
              const v = data[i];
              if (v != null && Number.isFinite(v)) {
                last = v;
                break;
              }
            }
            return { label: k.labelZh, last };
          }),
        );
      })
      .catch(() => setMacroBg([]));
  }, []);

  const navSeries = useMemo(() => {
    const colors = sectors.slice(0, 11);
    return [
      ...(nav.SPY?.length ? [{ name: "SPY", data: nav.SPY }] : []),
      ...colors
        .filter((s) => (nav[s.etf] ?? []).length > 0)
        .map((s) => ({ name: `${s.nameZh}(${s.etf})`, data: nav[s.etf]! })),
    ];
  }, [nav, sectors]);

  const [fundRows, setFundRows] = useState<
    {
      sector: string;
      nameZh: string;
      revenueYoYMedian: number | null;
      peMedian: number | null;
      coveragePct: number;
    }[]
  >([]);

  useEffect(() => {
    fetch("/api/equity/fundamentals-overview", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as {
          sectors?: {
            sector: string;
            nameZh: string;
            revenueYoYMedian: number | null;
            peMedian: number | null;
            coveragePct: number;
          }[];
        };
      })
      .then((j) => setFundRows(j?.sectors ?? []))
      .catch(() => setFundRows([]));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-4 px-3 py-3 sm:px-4">
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {macroBg.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <div className="text-[11px] text-fs-muted">
            风格轮动背景：景气（ISM）· 曲线（衰退领先）· 利率（成长久期）· 信用（风险偏好）
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {macroBg.map((m) => (
              <div
                key={m.label}
                className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2"
              >
                <div className="text-[11px] text-fs-muted">{m.label}</div>
                <div className="mt-0.5 text-sm font-medium text-fs-text">
                  {m.last == null
                    ? "—"
                    : m.label.includes("OAS") || m.label.includes("曲线") || m.label.includes("收益率")
                      ? `${m.last.toFixed(2)}%`
                      : m.last.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <SectorReturnMatrix />

      <section className="rounded-md border border-fs-border bg-fs-elevated/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-fs-text">风格得分卡（相对 SPY）</h2>
          <span className="text-xs text-fs-muted">
            快捷窗口 {windowId} · SPY {fmtPct(spyReturn)}
            {loading ? " · 加载中…" : ""}
          </span>
        </div>
        <StyleBarChart
          rows={styles.map((s) => ({
            name: s.nameZh,
            excess: s.equalWeightExcess,
          }))}
        />
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          {styles.map((s) => (
            <div key={s.id} className="text-fs-muted">
              {s.nameZh}：绝对 {fmtPct(s.equalWeightReturn)} · 超额{" "}
              <span className={pctClass(s.equalWeightExcess)}>
                {fmtPct(s.equalWeightExcess)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-fs-border bg-fs-elevated/30 p-3">
        <h2 className="mb-2 text-sm font-medium text-fs-text">相对强弱（归一化净值）</h2>
        {navSeries.length ? (
          <SectorNavChart series={navSeries} height={300} />
        ) : (
          <p className="py-8 text-center text-sm text-fs-muted">
            {missing.length
              ? `暂无 ETF 行情：缺失 ${missing.join(", ")}`
              : "暂无净值数据"}
          </p>
        )}
      </section>

      {fundRows.length > 0 ? (
        <section className="overflow-x-auto rounded-md border border-fs-border">
          <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium text-fs-text">
            行业基本面（中位数 · 样本覆盖见备注）
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-fs-elevated/60 text-xs text-fs-muted">
              <tr>
                <th className="px-3 py-2 font-medium">行业</th>
                <th className="px-3 py-2 font-medium">营收增速中位</th>
                <th className="px-3 py-2 font-medium">PE 中位</th>
                <th className="px-3 py-2 font-medium">覆盖率</th>
              </tr>
            </thead>
            <tbody>
              {fundRows.map((r) => (
                <tr key={r.sector} className="border-t border-fs-border/60">
                  <td className="px-3 py-2 text-fs-text">{r.nameZh}</td>
                  <td className={`px-3 py-2 ${pctClass(r.revenueYoYMedian)}`}>
                    {fmtPct(r.revenueYoYMedian)}
                  </td>
                  <td className="px-3 py-2 text-fs-text">
                    {r.peMedian == null ? "—" : r.peMedian.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-fs-muted">
                    {(r.coveragePct * 100).toFixed(0)}%
                    {r.coveragePct < 0.5 ? " · 样本偏少" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="rounded-md border border-dashed border-fs-border bg-fs-elevated/20 px-3 py-4 text-sm text-fs-muted">
          <div className="font-medium text-fs-text">行业基本面暂无数据</div>
          <p className="mt-1">
            快照表为空。请先同步（主数据源为免费 SEC EDGAR companyfacts，不依赖 FMP 付费档）：
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-fs-elevated px-2 py-1.5 text-xs text-fs-text">
            npm run equity:sync-fundamentals -- --limit=100
          </pre>
        </section>
      )}
    </div>
  );
}

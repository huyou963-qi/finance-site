"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectorNavChart } from "@/components/equity/SectorCharts";
import { WeeklyMarkdown } from "@/components/weekly/WeeklyMarkdown";

type Constituent = {
  symbol: string;
  name: string;
  marketCap: number | null;
  gicsIndustry: string | null;
  cik: string | null;
};

type FundAgg = {
  sampleCount: number;
  universeCount: number;
  coveragePct: number;
  revenueYoYMedian: number | null;
  epsYoYMedian: number | null;
  grossMarginMedian: number | null;
  opMarginMedian: number | null;
  peMedian: number | null;
  members?: {
    symbol: string;
    revenueYoY: number | null;
    epsYoY: number | null;
    pe: number | null;
    period: string | null;
  }[];
};

type MacroKey = { key: string; labelZh: string };
type MacroMapping = {
  keys: MacroKey[];
  noteZh?: string;
  pending?: boolean;
  macroTemplateId?: string;
};

type BriefItem = {
  id: string;
  symbol: string;
  periodMonth: string;
  summaryOneLiner?: string;
  title?: string;
};

type ResonanceItem = {
  id: string;
  peerGroupId: string;
  periodMonth: string;
  bodyMarkdown: string;
};

const TABS = [
  { id: "price", label: "走势与成分" },
  { id: "macro", label: "宏观对照" },
  { id: "fundamentals", label: "财报聚合" },
  { id: "narrative", label: "经营叙事" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

function fmtCap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toLocaleString();
}

function pctClass(v: number | null | undefined): string {
  if (v == null) return "text-fs-muted";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-red-400";
  return "text-fs-muted";
}

export function EquitySectorDetailClient({ sectorSlug }: { sectorSlug: string }) {
  const [tab, setTab] = useState<TabId>("price");
  const [sector, setSector] = useState<string>("");
  const [nameZh, setNameZh] = useState("");
  const [etf, setEtf] = useState("");
  const [style, setStyle] = useState("");
  const [constituents, setConstituents] = useState<Constituent[]>([]);
  const [nav, setNav] = useState<{ time: number; value: number }[]>([]);
  const [spyNav, setSpyNav] = useState<{ time: number; value: number }[]>([]);
  const [macroMap, setMacroMap] = useState<MacroMapping | null>(null);
  const [macroSeries, setMacroSeries] = useState<
    { label: string; points: { time: number; value: number }[] }[]
  >([]);
  const [fund, setFund] = useState<FundAgg | null>(null);
  const [briefs, setBriefs] = useState<BriefItem[]>([]);
  const [resonance, setResonance] = useState<ResonanceItem | null>(null);
  const [selectedBrief, setSelectedBrief] = useState<{
    title: string;
    bodyMarkdown: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/equity/sectors/${encodeURIComponent(sectorSlug)}/constituents`, {
        cache: "no-store",
      });
      const j = (await r.json()) as {
        error?: string;
        sector?: string;
        nameZh?: string;
        etf?: string;
        style?: string;
        constituents?: Constituent[];
      };
      if (!r.ok) throw new Error(j.error ?? "加载失败");
      setSector(j.sector ?? "");
      setNameZh(j.nameZh ?? "");
      setEtf(j.etf ?? "");
      setStyle(j.style ?? "");
      setConstituents(j.constituents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [sectorSlug]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (!etf) return;
    fetch(`/api/equity/sector-returns?window=3M&nav=1`, { cache: "no-store" })
      .then(async (r) => r.json())
      .then((j: { nav?: Record<string, { time: number; value: number }[]> }) => {
        setNav(j.nav?.[etf] ?? []);
        setSpyNav(j.nav?.SPY ?? []);
      })
      .catch(() => {
        setNav([]);
        setSpyNav([]);
      });
  }, [etf]);

  useEffect(() => {
    if (!sector) return;
    fetch(`/api/equity/sectors/${encodeURIComponent(sectorSlug)}/macro`, {
      cache: "no-store",
    })
      .then(async (r) => r.json())
      .then(
        (j: {
          mapping?: MacroMapping;
          series?: { labelZh: string; points: { date: string; value: number }[] }[];
        }) => {
          setMacroMap(j.mapping ?? null);
          setMacroSeries(
            (j.series ?? []).map((s) => ({
              label: s.labelZh,
              points: (s.points ?? []).map((p) => ({
                time: Math.floor(new Date(`${p.date}T00:00:00Z`).getTime() / 1000),
                value: p.value,
              })),
            })),
          );
        },
      )
      .catch(() => setMacroMap(null));
  }, [sector, sectorSlug]);

  useEffect(() => {
    if (!sector) return;
    fetch(`/api/equity/sectors/${encodeURIComponent(sectorSlug)}/fundamentals`, {
      cache: "no-store",
    })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j: FundAgg | null) => setFund(j))
      .catch(() => setFund(null));
  }, [sector, sectorSlug]);

  useEffect(() => {
    if (!sector) return;
    fetch(
      `/api/equity/company-operating-briefs?sector=${encodeURIComponent(sector)}&limit=30`,
      { cache: "no-store" },
    )
      .then(async (r) => (r.ok ? r.json() : null))
      .then(
        (j: {
          briefs?: {
            id: string;
            symbol: string;
            periodMonth: string;
            meta?: { summaryOneLiner?: string; title?: string };
          }[];
        } | null) => {
          setBriefs(
            (j?.briefs ?? []).map((b) => ({
              id: b.id,
              symbol: b.symbol,
              periodMonth: b.periodMonth,
              summaryOneLiner: b.meta?.summaryOneLiner,
              title: b.meta?.title,
            })),
          );
        },
      )
      .catch(() => setBriefs([]));

    fetch(
      `/api/equity/industry-peer-resonances?sector=${encodeURIComponent(sector)}&limit=1`,
      { cache: "no-store" },
    )
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j: { items?: ResonanceItem[] } | null) => {
        setResonance(j?.items?.[0] ?? null);
      })
      .catch(() => setResonance(null));
  }, [sector]);

  const topConstituents = useMemo(() => constituents.slice(0, 40), [constituents]);

  const openBrief = async (id: string) => {
    const r = await fetch(`/api/equity/company-operating-briefs/${id}`, {
      cache: "no-store",
    });
    if (!r.ok) return;
    const j = (await r.json()) as {
      meta?: { title?: string };
      bodyMarkdown?: string;
    };
    setSelectedBrief({
      title: j.meta?.title ?? "经营简报",
      bodyMarkdown: j.bodyMarkdown ?? "",
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-3 sm:px-4">
      <div className="text-xs text-fs-muted">
        <Link href="/equity/sectors" className="hover:text-fs-accent-text">
          ← 美股行业
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fs-text">
            {nameZh || sectorSlug}
            {etf ? (
              <span className="ml-2 text-sm font-normal text-fs-muted">{etf}</span>
            ) : null}
          </h1>
          <p className="mt-0.5 text-sm text-fs-muted">
            {sector}
            {style ? ` · ${style}` : ""}
            {loading ? " · 加载中…" : ` · ${constituents.length} 只成分`}
          </p>
        </div>
        {etf ? (
          <Link
            href={`/markets?symbol=${encodeURIComponent(etf)}`}
            className="rounded-md bg-fs-accent-soft px-3 py-1.5 text-xs font-medium text-fs-accent-text ring-1 ring-fs-accent/25"
          >
            在行情页打开 {etf}
          </Link>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-fs-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              tab === t.id
                ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "price" ? (
        <div className="flex flex-col gap-4">
          <section className="rounded-md border border-fs-border bg-fs-elevated/30 p-3">
            <h2 className="mb-2 text-sm font-medium text-fs-text">ETF vs SPY（3M）</h2>
            {nav.length || spyNav.length ? (
              <SectorNavChart
                series={[
                  ...(spyNav.length ? [{ name: "SPY", data: spyNav }] : []),
                  ...(nav.length ? [{ name: etf || "ETF", data: nav }] : []),
                ]}
              />
            ) : (
              <p className="py-6 text-center text-sm text-fs-muted">暂无 ETF 行情</p>
            )}
          </section>

          <section className="overflow-x-auto rounded-md border border-fs-border">
            <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium">
              成分股（按市值）
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-fs-muted">
                <tr>
                  <th className="px-3 py-2">代码</th>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">行业</th>
                  <th className="px-3 py-2">市值</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {topConstituents.map((c) => (
                  <tr key={c.symbol} className="border-t border-fs-border/60">
                    <td className="px-3 py-2 font-medium text-fs-text">{c.symbol}</td>
                    <td className="px-3 py-2 text-fs-muted">{c.name}</td>
                    <td className="px-3 py-2 text-fs-muted">{c.gicsIndustry ?? "—"}</td>
                    <td className="px-3 py-2 text-fs-text">{fmtCap(c.marketCap)}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/markets?symbol=${encodeURIComponent(c.symbol)}`}
                        className="text-xs text-fs-accent-text hover:underline"
                      >
                        K线
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {tab === "macro" ? (
        <section className="flex flex-col gap-3">
          {macroMap?.noteZh ? (
            <p className="text-sm text-fs-muted">
              {macroMap.noteZh}
              {macroMap.pending ? "（映射待扩展）" : ""}
            </p>
          ) : null}
          {macroMap?.macroTemplateId ? (
            <Link
              href={`/macro?template=${encodeURIComponent(macroMap.macroTemplateId)}`}
              className="text-sm text-fs-accent-text hover:underline"
            >
              打开宏观模板 →
            </Link>
          ) : null}
          {macroSeries.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {macroSeries.slice(0, 4).map((s) => (
                <div
                  key={s.label}
                  className="rounded-md border border-fs-border bg-fs-elevated/30 p-2"
                >
                  <div className="mb-1 text-xs text-fs-muted">{s.label}</div>
                  <SectorNavChart
                    series={[{ name: s.label, data: s.points }]}
                    height={160}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fs-muted">
              {macroMap?.pending
                ? "本行业宏观映射待扩展"
                : "暂无宏观序列（请确认已 seed 对应指标）"}
            </p>
          )}
        </section>
      ) : null}

      {tab === "fundamentals" ? (
        <section className="flex flex-col gap-3">
          {fund ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { label: "营收增速中位", v: fund.revenueYoYMedian, pct: true },
                  { label: "EPS 增速中位", v: fund.epsYoYMedian, pct: true },
                  { label: "毛利率中位", v: fund.grossMarginMedian, pct: true },
                  { label: "营业利润率中位", v: fund.opMarginMedian, pct: true },
                  { label: "PE 中位", v: fund.peMedian, pct: false },
                ].map((x) => (
                  <div
                    key={x.label}
                    className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2"
                  >
                    <div className="text-[11px] text-fs-muted">{x.label}</div>
                    <div className={`text-sm font-medium ${x.pct ? pctClass(x.v) : "text-fs-text"}`}>
                      {x.pct ? fmtPct(x.v) : x.v == null ? "—" : x.v.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-fs-muted">
                样本 {fund.sampleCount}/{fund.universeCount}（覆盖率{" "}
                {(fund.coveragePct * 100).toFixed(0)}%）
                {fund.coveragePct < 0.5 ? " · 覆盖不足 50%，解读需谨慎" : ""}
              </p>
              {fund.members?.length ? (
                <div className="overflow-x-auto rounded-md border border-fs-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs text-fs-muted">
                      <tr>
                        <th className="px-3 py-2">代码</th>
                        <th className="px-3 py-2">营收 YoY</th>
                        <th className="px-3 py-2">EPS YoY</th>
                        <th className="px-3 py-2">PE</th>
                        <th className="px-3 py-2">期间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fund.members.map((m) => (
                        <tr key={m.symbol} className="border-t border-fs-border/60">
                          <td className="px-3 py-2">{m.symbol}</td>
                          <td className={`px-3 py-2 ${pctClass(m.revenueYoY)}`}>
                            {fmtPct(m.revenueYoY)}
                          </td>
                          <td className={`px-3 py-2 ${pctClass(m.epsYoY)}`}>
                            {fmtPct(m.epsYoY)}
                          </td>
                          <td className="px-3 py-2">
                            {m.pe == null ? "—" : m.pe.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-fs-muted">{m.period ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-fs-muted">
              暂无财报快照。请运行 npm run equity:sync-fundamentals
            </p>
          )}
        </section>
      ) : null}

      {tab === "narrative" ? (
        <section className="flex flex-col gap-4">
          {resonance ? (
            <div className="rounded-md border border-fs-border bg-fs-elevated/30 p-3">
              <h2 className="mb-2 text-sm font-medium text-fs-text">
                同业互证 · {resonance.periodMonth}
              </h2>
              <WeeklyMarkdown content={resonance.bodyMarkdown} />
            </div>
          ) : (
            <p className="text-sm text-fs-muted">暂无同业互证（需 Automation ingest）</p>
          )}
          <div className="rounded-md border border-fs-border">
            <div className="border-b border-fs-border bg-fs-elevated/40 px-3 py-2 text-sm font-medium">
              公司经营简报
            </div>
            <ul className="divide-y divide-fs-border/60">
              {briefs.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-fs-text">
                      {b.symbol} · {b.periodMonth}
                    </div>
                    <div className="text-xs text-fs-muted">
                      {b.summaryOneLiner ?? b.title ?? "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openBrief(b.id)}
                    className="shrink-0 text-xs text-fs-accent-text hover:underline"
                  >
                    阅读
                  </button>
                </li>
              ))}
              {!briefs.length ? (
                <li className="px-3 py-4 text-sm text-fs-muted">暂无简报</li>
              ) : null}
            </ul>
          </div>
          {selectedBrief ? (
            <div className="rounded-md border border-fs-border bg-fs-elevated/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">{selectedBrief.title}</h3>
                <button
                  type="button"
                  className="text-xs text-fs-muted hover:text-fs-text"
                  onClick={() => setSelectedBrief(null)}
                >
                  关闭
                </button>
              </div>
              <WeeklyMarkdown content={selectedBrief.bodyMarkdown} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

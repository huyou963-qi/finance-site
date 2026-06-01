"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AssetMeta = {
  asset: "10Y" | "SPX" | "XAU";
  firstDate: string;
  lastDate: string;
  rows: number;
};

type ReturnRow = {
  asset: "10Y" | "SPX" | "XAU";
  startDate: string;
  endDate: string;
  closeToCloseReturn: number;
  lowToHighReturn: number;
  startClose: number;
  endClose: number;
  startLow: number;
  endHigh: number;
  tradingDays: number;
};

type ApiPayload = {
  assets: AssetMeta[];
  defaults: { start: string; end: string; pickedAssets: ("10Y" | "SPX" | "XAU")[] };
  rows: ReturnRow[];
  error?: string;
};

type ReturnRun = {
  id: string;
  createdAt: string;
  request: { start: string; end: string; assets: ("10Y" | "SPX" | "XAU")[] };
  rows: ReturnRow[];
};

type Template = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  runs: ReturnRun[];
  draftStart: string;
  draftEnd: string;
  draftAssets: ("10Y" | "SPX" | "XAU")[];
};

type PersistedState = {
  version: 1;
  templates: Template[];
  activeTemplateId: string;
};

const ASSET_OPTIONS = [
  { key: "10Y", label: "10Y（美债收益率）" },
  { key: "SPX", label: "SPX（标普 500）" },
  { key: "XAU", label: "XAU（黄金）" },
] as const;

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "-";
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function createTemplate(
  name: string,
  defaults: { start: string; end: string; assets: ("10Y" | "SPX" | "XAU")[] },
): Template {
  const t = nowIso();
  return {
    id: uid(),
    name,
    createdAt: t,
    updatedAt: t,
    runs: [],
    draftStart: defaults.start,
    draftEnd: defaults.end,
    draftAssets: [...defaults.assets],
  };
}

function normalizeTemplate(
  raw: Partial<Template>,
  defaults: { start: string; end: string; assets: ("10Y" | "SPX" | "XAU")[] },
): Template {
  const assets = raw.draftAssets?.length
    ? (raw.draftAssets.filter((a) => a === "10Y" || a === "SPX" || a === "XAU") as ("10Y" | "SPX" | "XAU")[])
    : defaults.assets;
  return {
    id: String(raw.id || uid()),
    name: String(raw.name || "未命名模板"),
    createdAt: String(raw.createdAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso()),
    runs: Array.isArray(raw.runs) ? (raw.runs as ReturnRun[]) : [],
    draftStart: typeof raw.draftStart === "string" && raw.draftStart ? raw.draftStart : defaults.start,
    draftEnd: typeof raw.draftEnd === "string" && raw.draftEnd ? raw.draftEnd : defaults.end,
    draftAssets: assets.length > 0 ? assets : defaults.assets,
  };
}

async function loadPersisted(defaults: {
  start: string;
  end: string;
  assets: ("10Y" | "SPX" | "XAU")[];
}): Promise<PersistedState | null> {
  const res = await fetch("/api/tools/asset-return-templates", { cache: "no-store" });
  if (res.status === 401) {
    throw new Error("请先登录后再使用模板功能");
  }
  try {
    if (!res.ok) return null;
    const payload = (await res.json()) as { state?: PersistedState | null };
    const state = payload.state;
    if (!state || state.version !== 1 || !Array.isArray(state.templates) || state.templates.length === 0) {
      return null;
    }
    const templates = state.templates.map((t) => normalizeTemplate(t, defaults));
    const activeRaw = String(state.activeTemplateId ?? templates[0]!.id);
    const activeTemplateId = templates.some((t) => t.id === activeRaw) ? activeRaw : templates[0]!.id;
    return { version: 1, templates, activeTemplateId };
  } catch {
    return null;
  }
}

async function savePersisted(templates: Template[], activeTemplateId: string) {
  const state: PersistedState = { version: 1, templates, activeTemplateId };
  const res = await fetch("/api/tools/asset-return-templates", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "会话已失效，请重新登录" : "模板保存失败");
  }
}

export function MarketsToolsClient() {
  const [assetsMeta, setAssetsMeta] = useState<AssetMeta[]>([]);
  const [apiDefaults, setApiDefaults] = useState<{
    start: string;
    end: string;
    assets: ("10Y" | "SPX" | "XAU")[];
  } | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === activeTemplateId) ?? null,
    [templates, activeTemplateId],
  );

  const patchActiveTemplate = useCallback(
    (updater: (t: Template) => Template) => {
      setTemplates((prev) =>
        prev.map((t) => (t.id === activeTemplateId ? updater({ ...t, updatedAt: nowIso() }) : t)),
      );
    },
    [activeTemplateId],
  );

  useEffect(() => {
    if (!hydrated || templates.length === 0 || !activeTemplateId) return;
    savePersisted(templates, activeTemplateId).catch((e) => {
      setHint(e instanceof Error ? e.message : "模板保存失败");
    });
  }, [templates, activeTemplateId, hydrated]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tools/asset-returns`);
        const payload = (await res.json()) as ApiPayload;
        if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
        if (cancelled) return;

        setAssetsMeta(payload.assets);
        setApiDefaults({
          start: payload.defaults.start,
          end: payload.defaults.end,
          assets: payload.defaults.pickedAssets,
        });

        const stored = await loadPersisted({
          start: payload.defaults.start,
          end: payload.defaults.end,
          assets: payload.defaults.pickedAssets,
        });
        if (stored && stored.templates.length > 0) {
          const id =
            stored.templates.some((t) => t.id === stored.activeTemplateId) && stored.activeTemplateId
              ? stored.activeTemplateId
              : stored.templates[0]!.id;
          setTemplates(stored.templates);
          setActiveTemplateId(id);
        } else {
          const t = createTemplate("模板 1", {
            start: payload.defaults.start,
            end: payload.defaults.end,
            assets: payload.defaults.pickedAssets,
          });
          setTemplates([t]);
          setActiveTemplateId(t.id);
        }
        setHydrated(true);
        setHint(null);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "未知错误";
        setHint(`加载失败：${message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = activeTemplate?.draftStart ?? "";
  const end = activeTemplate?.draftEnd ?? "";
  const pickedAssets = activeTemplate?.draftAssets ?? [];

  const setStart = (v: string) => {
    patchActiveTemplate((t) => ({ ...t, draftStart: v }));
  };
  const setEnd = (v: string) => {
    patchActiveTemplate((t) => ({ ...t, draftEnd: v }));
  };
  const setPickedAssets = (next: ("10Y" | "SPX" | "XAU")[]) => {
    patchActiveTemplate((t) => ({ ...t, draftAssets: next }));
  };

  const calculateAndAppendRun = async () => {
    if (!activeTemplate) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("start", start);
      qs.set("end", end);
      qs.set("assets", pickedAssets.join(","));
      const res = await fetch(`/api/tools/asset-returns?${qs.toString()}`);
      const payload = (await res.json()) as ApiPayload;
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);

      setAssetsMeta(payload.assets);
      const run: ReturnRun = {
        id: uid(),
        createdAt: new Date().toLocaleString("zh-CN"),
        request: { start, end, assets: [...pickedAssets] },
        rows: payload.rows,
      };
      patchActiveTemplate((t) => ({ ...t, runs: [run, ...t.runs] }));
      setHint(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "未知错误";
      setHint(`加载失败：${message}`);
    } finally {
      setLoading(false);
    }
  };

  const newTemplate = () => {
    const def = apiDefaults ?? { start: "", end: "", assets: ["10Y", "SPX", "XAU"] as ("10Y" | "SPX" | "XAU")[] };
    const n = templates.length + 1;
    const t = createTemplate(`模板 ${n}`, def);
    setTemplates((prev) => [...prev, t]);
    setActiveTemplateId(t.id);
  };

  const deleteTemplate = (id: string) => {
    if (templates.length <= 1) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (templates.length === 0) return;
    if (!templates.some((t) => t.id === activeTemplateId)) {
      setActiveTemplateId(templates[0]!.id);
    }
  }, [templates, activeTemplateId]);

  const runs = activeTemplate?.runs ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">K线区间统计</h1>
        <p className="mt-1 text-sm text-slate-400">
          使用本地 Excel（10Y、SPX、XAU）日线数据，统计任意两个日期区间的回报：Close→Close 与
          Low→High。多条统计会保存在当前<strong className="text-slate-300">模板</strong>
          中，刷新页面后仍可打开继续查看。
        </p>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-slate-400">
            当前模板
            <select
              value={activeTemplateId}
              onChange={(e) => setActiveTemplateId(e.target.value)}
              disabled={!hydrated || templates.length === 0}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.runs.length} 条统计）
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-slate-400">
            模板名称
            <input
              type="text"
              value={activeTemplate?.name ?? ""}
              disabled={!activeTemplate}
              onChange={(e) => patchActiveTemplate((t) => ({ ...t, name: e.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={!hydrated}
            onClick={newTemplate}
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            新建模板
          </button>
          <button
            type="button"
            disabled={!hydrated || templates.length <= 1}
            onClick={() => activeTemplate && deleteTemplate(activeTemplate.id)}
            className="rounded-md border border-rose-800 bg-rose-950/30 px-3 py-1.5 text-sm text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            删除当前模板
          </button>
        </div>
        {activeTemplate ? (
          <p className="mt-2 text-xs text-slate-500">
            本模板已自动保存到服务端文件。上次更新：{activeTemplate.updatedAt.slice(0, 19).replace("T", " ")}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            起始日期
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={!activeTemplate}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            结束日期
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={!activeTemplate}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            {ASSET_OPTIONS.map((asset) => {
              const checked = pickedAssets.includes(asset.key);
              return (
                <label
                  key={asset.key}
                  className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${
                    checked
                      ? "border-emerald-700 bg-emerald-950/60 text-emerald-100"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mr-1 align-middle"
                    checked={checked}
                    disabled={!activeTemplate}
                    onChange={() => {
                      setPickedAssets(
                        checked ? pickedAssets.filter((x) => x !== asset.key) : [...pickedAssets, asset.key],
                      );
                    }}
                  />
                  {asset.label}
                </label>
              );
            })}
          </div>
          <button
            type="button"
            disabled={!start || !end || pickedAssets.length === 0 || loading || !activeTemplate}
            onClick={() => calculateAndAppendRun().catch(() => {})}
            className="rounded-md border border-emerald-700 bg-emerald-900/50 px-3 py-1.5 text-sm text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "计算中..." : "计算区间回报"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          非交易日会自动映射到起始日后的首个交易日与结束日前的最后交易日。
        </p>
      </section>

      {hint ? <p className="text-sm text-rose-300">{hint}</p> : null}

      <section className="space-y-4">
        {runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-4 text-sm text-slate-400">
            当前模板尚无统计结果，点击上方「计算区间回报」后会追加到本模板并自动保存。
          </div>
        ) : null}
        {runs.map((run, idx) => {
          const bestCloseToClose =
            run.rows.length > 0
              ? [...run.rows].sort((a, b) => b.closeToCloseReturn - a.closeToCloseReturn)[0]
              : null;
          const bestLowToHigh =
            run.rows.length > 0
              ? [...run.rows].sort((a, b) => b.lowToHighReturn - a.lowToHighReturn)[0]
              : null;

          return (
            <div key={run.id} className="space-y-3">
              {idx > 0 ? <div className="h-px w-full bg-slate-800" /> : null}
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">
                    统计时间：{run.createdAt} ｜ 查询区间：{run.request.start} ~ {run.request.end}
                    ｜ 资产：{run.request.assets.join(", ")}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchActiveTemplate((t) => ({ ...t, runs: t.runs.filter((x) => x.id !== run.id) }))
                    }
                    className="rounded-md border border-rose-700 bg-rose-950/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-900/40"
                  >
                    删除该统计
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <h2 className="text-sm font-medium text-slate-200">Close→Close 最优资产</h2>
                    <p className="mt-2 text-lg font-semibold text-emerald-300">
                      {bestCloseToClose
                        ? `${bestCloseToClose.asset} · ${fmtPct(bestCloseToClose.closeToCloseReturn)}`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <h2 className="text-sm font-medium text-slate-200">Low→High 最优资产</h2>
                    <p className="mt-2 text-lg font-semibold text-emerald-300">
                      {bestLowToHigh
                        ? `${bestLowToHigh.asset} · ${fmtPct(bestLowToHigh.lowToHighReturn)}`
                        : "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 overflow-auto">
                  <table className="min-w-full text-xs md:text-sm">
                    <thead className="bg-slate-900/80 text-slate-300">
                      <tr>
                        <th className="px-2 py-2 text-left">资产</th>
                        <th className="px-2 py-2 text-left">实际起止</th>
                        <th className="px-2 py-2 text-right">Close→Close</th>
                        <th className="px-2 py-2 text-right">Low→High</th>
                        <th className="px-2 py-2 text-right">起始收盘</th>
                        <th className="px-2 py-2 text-right">结束收盘</th>
                        <th className="px-2 py-2 text-right">起始最低</th>
                        <th className="px-2 py-2 text-right">结束最高</th>
                        <th className="px-2 py-2 text-right">交易日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.rows.map((r) => (
                        <tr key={`${run.id}-${r.asset}`} className="border-t border-slate-800 text-slate-200">
                          <td className="px-2 py-2">{r.asset}</td>
                          <td className="px-2 py-2">
                            {r.startDate} ~ {r.endDate}
                          </td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.closeToCloseReturn)}</td>
                          <td className="px-2 py-2 text-right">{fmtPct(r.lowToHighReturn)}</td>
                          <td className="px-2 py-2 text-right">{fmtNum(r.startClose)}</td>
                          <td className="px-2 py-2 text-right">{fmtNum(r.endClose)}</td>
                          <td className="px-2 py-2 text-right">{fmtNum(r.startLow)}</td>
                          <td className="px-2 py-2 text-right">{fmtNum(r.endHigh)}</td>
                          <td className="px-2 py-2 text-right">{r.tradingDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
        <p>数据覆盖：</p>
        <div className="mt-1 flex flex-wrap gap-3">
          {assetsMeta.map((m) => (
            <span key={m.asset}>
              {m.asset}: {m.firstDate} ~ {m.lastDate}（{m.rows} 行）
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { MacroChartTemplate } from "@/lib/data/macroPresetTemplates";
import {
  MACRO_TEMPLATE_COUNTRIES,
  MACRO_TEMPLATE_DIMENSION_LINKS,
  MACRO_TEMPLATE_RELATION_GROUPS,
  countryHasTemplates,
  countTemplatesByDimension,
  getMacroTemplateDimension,
  getTemplatesForDimension,
  resolveTemplatePlacement,
  type MacroTemplateBrowseMode,
  type MacroTemplateDimensionId,
  type MacroTemplateRelationGroup,
  type MacroTemplateScope,
} from "@/lib/data/macroTemplateTaxonomy";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import {
  IconChart,
  IconChevronDown,
  IconChevronRight,
  IconGrid,
  IconMore,
  IconTrash,
} from "@/components/mobile/mobileIcons";

type CountryId = Exclude<MacroTemplateScope, "global">;

export type MacroMobileTemplatesPanelProps = {
  templates: MacroChartTemplate[];
  folderIdByTemplate?: Record<string, string | null>;
  loading: boolean;
  activeTemplateId: string | null;
  onLoad: (tpl: MacroChartTemplate) => void;
  /** 仅管理员：删除系统模板 */
  onDelete?: (tpl: MacroChartTemplate) => void;
  /** 管理员：已隐藏内置模板的恢复入口（与桌面共用） */
  adminExtra?: ReactNode;
  /** 「我的模板」内容（与桌面共用） */
  userPanel: ReactNode;
};

function layerLabel(group: MacroTemplateRelationGroup): string {
  return group.id === "hub" ? "枢纽" : group.label;
}

function segClass(active: boolean) {
  return `h-9 flex-1 rounded-md text-sm font-medium transition ${
    active ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25" : "text-fs-secondary"
  }`;
}

/**
 * 手机端系统模板：结构图的分层变成列表分组，维度点开即展开模板；
 * 结构图收进「结构图」按钮全屏弹出（保留分层、去掉连线）。
 */
export function MacroMobileTemplatesPanel({
  templates,
  folderIdByTemplate,
  loading,
  activeTemplateId,
  onLoad,
  onDelete,
  adminExtra,
  userPanel,
}: MacroMobileTemplatesPanelProps) {
  const [view, setView] = useState<"system" | "mine">("system");
  const [mode, setMode] = useState<MacroTemplateBrowseMode>("country");
  const [country, setCountry] = useState<CountryId>("US");
  const [expanded, setExpanded] = useState<Set<MacroTemplateDimensionId>>(
    () => new Set<MacroTemplateDimensionId>(["economy"]),
  );
  const [mapOpen, setMapOpen] = useState(false);
  const [menuTpl, setMenuTpl] = useState<MacroChartTemplate | null>(null);
  const dimEls = useRef(new Map<MacroTemplateDimensionId, HTMLDivElement>());

  const counts = useMemo(
    () => countTemplatesByDimension(templates, "country", country, folderIdByTemplate),
    [templates, country, folderIdByTemplate],
  );
  const countryTotal = useMemo(
    () => Object.values(counts).reduce((n, c) => n + c, 0),
    [counts],
  );
  const globalTemplates = useMemo(
    () =>
      templates.filter(
        (tpl) => resolveTemplatePlacement(tpl, folderIdByTemplate).scope === "global",
      ),
    [templates, folderIdByTemplate],
  );
  const countryLabel = MACRO_TEMPLATE_COUNTRIES.find((c) => c.id === country)?.label ?? country;

  const toggle = (id: MacroTemplateDimensionId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jumpTo = (id: MacroTemplateDimensionId) => {
    setExpanded((prev) => new Set(prev).add(id));
    setMapOpen(false);
    requestAnimationFrame(() => {
      dimEls.current.get(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  const templateRow = (tpl: MacroChartTemplate) => (
    <li
      key={tpl.id}
      className="flex min-h-14 items-center gap-2.5 border-t border-fs-border/70 py-2 pl-3 pr-1"
    >
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-fs-border bg-white text-fs-muted"
        aria-hidden
      >
        <IconChart size={18} />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug text-fs-text">{tpl.name}</span>
      {tpl.id === activeTemplateId ? (
        <span className="shrink-0 rounded border border-fs-accent/30 bg-fs-accent-soft px-1.5 text-[11px] text-fs-accent-text">
          当前
        </span>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={() => onLoad(tpl)}
        className="h-8 shrink-0 rounded-md border border-fs-accent/30 bg-fs-accent-soft px-3 text-[13px] font-medium text-fs-accent-text active:border-fs-accent disabled:opacity-40"
      >
        加载
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={() => setMenuTpl(tpl)}
          aria-label="更多操作"
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated"
        >
          <IconMore size={20} />
        </button>
      ) : (
        <span className="w-2 shrink-0" aria-hidden />
      )}
    </li>
  );

  const dimensionCard = (id: MacroTemplateDimensionId) => {
    const dim = getMacroTemplateDimension(id);
    const count = counts[id] ?? 0;
    const open = expanded.has(id) && count > 0;
    return (
      <div
        key={id}
        ref={(el) => {
          if (el) dimEls.current.set(id, el);
          else dimEls.current.delete(id);
        }}
        className={`scroll-mt-2 overflow-hidden rounded-lg border border-fs-border ${
          open ? "bg-white" : "bg-fs-elevated"
        } ${count === 0 ? "opacity-50" : ""}`}
      >
        <button
          type="button"
          disabled={count === 0}
          onClick={() => toggle(id)}
          aria-expanded={open}
          className="flex min-h-13 w-full items-center gap-2 py-1.5 pl-3 pr-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-fs-text">{dim.label}</span>
            {open ? (
              <span className="mt-0.5 block text-xs leading-normal text-fs-muted">
                {MACRO_TEMPLATE_DIMENSION_LINKS[id].blurb}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 rounded border border-fs-border/80 bg-fs-elevated px-1.5 text-[11px] tabular-nums text-fs-muted">
            {count}
          </span>
          <span className="shrink-0 text-fs-muted">
            {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
          </span>
        </button>
        {open ? (
          <ul>
            {getTemplatesForDimension(templates, "country", country, id, folderIdByTemplate).map(
              templateRow,
            )}
          </ul>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-0.5 rounded-lg border border-fs-border bg-fs-elevated p-0.5">
        <button type="button" onClick={() => setView("system")} className={segClass(view === "system")}>
          系统模板
        </button>
        <button type="button" onClick={() => setView("mine")} className={segClass(view === "mine")}>
          我的模板
        </button>
      </div>

      {view === "mine" ? (
        userPanel
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 gap-0.5 rounded-lg border border-fs-border bg-fs-elevated p-0.5">
              {(
                [
                  ["country", "国家"],
                  ["global", "全球"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={loading}
                  onClick={() => setMode(id)}
                  className={`h-8 rounded-md px-3 text-[13px] font-medium transition disabled:opacity-40 ${
                    mode === id
                      ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
                      : "text-fs-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "country" ? (
              <>
                <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {MACRO_TEMPLATE_COUNTRIES.map((c) => {
                    const hasContent = countryHasTemplates(templates, c.id, folderIdByTemplate);
                    const selected = country === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={loading || !hasContent}
                        onClick={() => setCountry(c.id)}
                        className={`h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition disabled:opacity-40 ${
                          selected
                            ? "border-fs-text bg-fs-text text-fs-bg"
                            : "border-fs-border bg-white text-fs-text"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setMapOpen(true)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-fs-border bg-white px-2.5 text-[13px] font-medium text-fs-text active:bg-fs-elevated"
                >
                  <IconGrid size={16} />
                  结构图
                </button>
              </>
            ) : null}
          </div>

          {mode === "global" ? (
            globalTemplates.length === 0 ? (
              <p className="rounded-lg border border-dashed border-fs-border px-4 py-8 text-center text-sm text-fs-muted">
                暂无全球对比模板。
              </p>
            ) : (
              <section>
                <h3 className="px-0.5 pb-1.5 text-xs font-semibold tracking-wide text-fs-muted">
                  全球对比模板
                </h3>
                <ul className="overflow-hidden rounded-lg border border-fs-border bg-white [&>li:first-child]:border-t-0">
                  {globalTemplates.map(templateRow)}
                </ul>
              </section>
            )
          ) : countryTotal === 0 ? (
            <p className="rounded-lg border border-dashed border-fs-border px-4 py-8 text-center text-sm text-fs-muted">
              该国暂无系统模板。
            </p>
          ) : (
            MACRO_TEMPLATE_RELATION_GROUPS.map((group) => (
              <section key={group.id}>
                <h3 className="px-0.5 pb-1.5 text-xs font-semibold tracking-wide text-fs-muted">
                  {layerLabel(group)}
                </h3>
                <div className="flex flex-col gap-2">{group.dimensionIds.map(dimensionCard)}</div>
              </section>
            ))
          )}

          {adminExtra}
        </>
      )}

      <MobileSheet
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title={`宏观结构图 · ${countryLabel}`}
        size="full"
      >
        <p className="px-4 pb-1.5 pt-3 text-[13px] leading-relaxed text-fs-muted">
          自上而下：总量 → 实体与需求 → 价格 → 政策 → 综合研判。点任一维度，回到列表并展开它。
        </p>
        {MACRO_TEMPLATE_RELATION_GROUPS.map((group) => {
          const n = group.dimensionIds.length;
          const colsClass = n >= 3 ? "grid-cols-3" : n === 2 ? "grid-cols-2" : "grid-cols-1";
          return (
            <div key={group.id} className="flex gap-2.5 border-t border-fs-border/70 px-4 py-2.5">
              <span className="w-14 shrink-0 pt-2 text-xs font-semibold leading-snug text-fs-muted">
                {layerLabel(group)}
              </span>
              <div className={`grid min-w-0 flex-1 gap-2 ${colsClass}`}>
                {group.dimensionIds.map((id) => {
                  const count = counts[id] ?? 0;
                  const active = expanded.has(id) && count > 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={count === 0}
                      onClick={() => jumpTo(id)}
                      className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 py-2 disabled:opacity-45 ${
                        active
                          ? "border-fs-accent/50 bg-fs-accent-soft text-fs-accent-text"
                          : "border-fs-border bg-white text-fs-text"
                      }`}
                    >
                      <span className="max-w-full truncate text-sm font-semibold">
                        {getMacroTemplateDimension(id).shortLabel}
                      </span>
                      <span className="text-xs tabular-nums opacity-75">{count} 个模板</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </MobileSheet>

      <MobileSheet open={menuTpl != null} onClose={() => setMenuTpl(null)} title={menuTpl?.name}>
        {menuTpl ? (
          <div className="pb-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                const tpl = menuTpl;
                setMenuTpl(null);
                onLoad(tpl);
              }}
              className="flex h-13 w-full items-center gap-3.5 border-t border-fs-border px-5 text-left text-base text-fs-text active:bg-fs-elevated disabled:opacity-40"
            >
              <IconChart />
              加载
            </button>
            {onDelete ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  const tpl = menuTpl;
                  setMenuTpl(null);
                  onDelete(tpl);
                }}
                className="flex h-13 w-full items-center gap-3.5 border-t border-fs-border px-5 text-left text-base text-fs-negative active:bg-fs-elevated disabled:opacity-40"
              >
                <IconTrash />
                删除系统模板
              </button>
            ) : null}
          </div>
        ) : null}
      </MobileSheet>
    </div>
  );
}

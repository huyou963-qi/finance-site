"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { MacroChartTemplate } from "@/lib/data/macroPresetTemplates";
import {
  MACRO_TEMPLATE_COUNTRIES,
  MACRO_TEMPLATE_DIMENSION_LINKS,
  countryHasTemplates,
  countTemplatesByDimension,
  getMacroTemplateDimension,
  getTemplatesForDimension,
  resolveTemplatePlacement,
  type MacroTemplateBrowseMode,
  type MacroTemplateDimensionId,
  type MacroTemplateScope,
} from "@/lib/data/macroTemplateTaxonomy";
import { MacroStructureFlowMap } from "@/components/macro/MacroStructureFlowMap";

export type MacroSystemTemplateBrowserProps = {
  templates: MacroChartTemplate[];
  folderIdByTemplate?: Record<string, string | null>;
  loading?: boolean;
  emptyText?: string;
  renderActions: (tpl: MacroChartTemplate) => ReactNode;
};

type CountryId = Exclude<MacroTemplateScope, "global">;

export function MacroSystemTemplateBrowser({
  templates,
  folderIdByTemplate,
  loading = false,
  emptyText = "暂无系统模板。",
  renderActions,
}: MacroSystemTemplateBrowserProps) {
  const [mode, setMode] = useState<MacroTemplateBrowseMode>("country");
  const [country, setCountry] = useState<CountryId>("US");
  const [selectedDimensionId, setSelectedDimensionId] =
    useState<MacroTemplateDimensionId>("economy");

  const counts = useMemo(
    () => countTemplatesByDimension(templates, mode, country, folderIdByTemplate),
    [templates, mode, country, folderIdByTemplate],
  );

  const selectedTemplates = useMemo(() => {
    if (mode === "global") {
      return templates.filter(
        (tpl) => resolveTemplatePlacement(tpl, folderIdByTemplate).scope === "global",
      );
    }
    return getTemplatesForDimension(
      templates,
      mode,
      country,
      selectedDimensionId,
      folderIdByTemplate,
    );
  }, [templates, mode, country, selectedDimensionId, folderIdByTemplate]);

  const selectedDimension = getMacroTemplateDimension(selectedDimensionId);
  const selectedLink = MACRO_TEMPLATE_DIMENSION_LINKS[selectedDimensionId];

  const scopeVisibleCount = useMemo(
    () => Object.values(counts).reduce((n, c) => n + c, 0),
    [counts],
  );

  if (templates.length === 0) {
    return <p className="text-[11px] text-fs-secondary">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-fs-text">系统模板</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-md border border-fs-border/80 bg-fs-elevated/80 p-0.5"
            role="tablist"
            aria-label="系统模板浏览入口"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "global"}
              disabled={loading}
              onClick={() => setMode("global")}
              className={`rounded px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                mode === "global"
                  ? "bg-fs-accent-soft text-fs-accent-text"
                  : "text-fs-secondary hover:text-fs-text"
              }`}
            >
              全球对比
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "country"}
              disabled={loading}
              onClick={() => setMode("country")}
              className={`rounded px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                mode === "country"
                  ? "bg-fs-accent-soft text-fs-accent-text"
                  : "text-fs-secondary hover:text-fs-text"
              }`}
            >
              国家分析
            </button>
          </div>
          {mode === "country" ? (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="选择国家">
              {MACRO_TEMPLATE_COUNTRIES.map((c) => {
                const hasContent = countryHasTemplates(templates, c.id, folderIdByTemplate);
                const selected = country === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={loading}
                    onClick={() => setCountry(c.id)}
                    title={hasContent ? undefined : "暂无该国模板"}
                    className={`rounded border px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-40 ${
                      selected
                        ? "border-fs-text bg-fs-text text-fs-bg"
                        : hasContent
                          ? "border-fs-border/80 bg-fs-elevated text-fs-text hover:border-fs-border"
                          : "border-fs-border/50 text-fs-muted"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {scopeVisibleCount === 0 ? (
        <p className="text-[11px] text-fs-secondary">
          {mode === "global" ? "暂无全球对比模板。" : "该国暂无系统模板。"}
        </p>
      ) : null}

      <div className="grid gap-0 border-t border-fs-border/70 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <div className="min-w-0 py-3 lg:border-r lg:border-fs-border/60 lg:pr-4">
          {mode === "global" ? (
            <aside className="min-w-0" aria-label="全球对比结构图（待设计）">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="text-[13px] font-semibold text-fs-text">宏观结构图</h4>
                <span className="text-[10px] text-fs-muted">全球对比</span>
              </div>
              <div className="flex h-[20rem] flex-col items-center justify-center rounded-md border border-dashed border-fs-border/70 bg-fs-bg/20 px-6 text-center">
                <p className="text-[13px] font-medium text-fs-secondary">全球对比结构待设计</p>
                <p className="mt-1.5 max-w-xs text-[11px] leading-relaxed text-fs-muted">
                  当前国家分析结构图不适用于全球对比；右侧可先浏览已有全球模板。
                </p>
              </div>
            </aside>
          ) : (
            <MacroStructureFlowMap
              counts={counts}
              selectedDimensionId={selectedDimensionId}
              loading={loading}
              onSelect={setSelectedDimensionId}
            />
          )}
        </div>

        <section className="min-w-0 py-3 lg:pl-5">
          <div className="mb-1 flex flex-wrap items-baseline gap-2">
            <h4 className="text-[15px] font-semibold text-fs-text">
              {mode === "global" ? "全球对比模板" : selectedDimension.label}
            </h4>
            <span className="text-[12px] text-fs-muted">({selectedTemplates.length})</span>
          </div>
          {mode === "global" ? (
            <p className="mb-3 text-[12px] leading-relaxed text-fs-secondary">
              跨国家对比模板列表；结构图将按全球对比逻辑单独设计。
            </p>
          ) : (
            <p className="mb-3 text-[12px] leading-relaxed text-fs-secondary">{selectedLink.blurb}</p>
          )}

          {mode === "country" && selectedLink.related.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-fs-muted">关联：</span>
              {selectedLink.related.map((relId) => {
                const rel = getMacroTemplateDimension(relId);
                const active = relId === selectedDimensionId;
                return (
                  <button
                    key={relId}
                    type="button"
                    disabled={loading || active}
                    onClick={() => setSelectedDimensionId(relId)}
                    className="rounded border border-fs-border/80 bg-fs-elevated px-2.5 py-0.5 text-[11px] text-fs-text hover:border-fs-text/40 disabled:cursor-default disabled:opacity-40"
                  >
                    {rel.shortLabel === "经济 Overview" ? "Overview" : rel.shortLabel}
                  </button>
                );
              })}
            </div>
          ) : null}

          {selectedTemplates.length === 0 ? (
            <div className="rounded-md border border-dashed border-fs-border/70 px-4 py-10 text-center text-[12px] text-fs-muted">
              暂无模板
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {selectedTemplates.map((tpl) => (
                <li key={tpl.id}>
                  <div
                    className="flex items-center gap-3 rounded-md border border-fs-border/80 bg-fs-elevated/70 px-3 py-3"
                    title={[tpl.name, tpl.description].filter(Boolean).join("\n")}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-fs-border/60 text-fs-muted"
                      aria-hidden
                    >
                      <svg width="20" height="16" viewBox="0 0 22 18" fill="none" className="opacity-50">
                        <rect
                          x="1"
                          y="1"
                          width="20"
                          height="16"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                        <path
                          d="M3 13l4-4 3 3 4-5 5 6"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1 self-center">
                      <div className="text-[13px] font-medium text-fs-text">{tpl.name}</div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1 [&_button]:min-w-[4.25rem] [&_button]:rounded [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[11px]">
                      {renderActions(tpl)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

        </section>
      </div>

    </div>
  );
}

"use client";

import { useTr } from "@/i18n/TextProvider";

export type MacroMainTab = "selected" | "charts" | "templates";

export type MacroMainToolbarProps = {
  mainTab: MacroMainTab;
  onMainTabChange: (tab: MacroMainTab) => void;
  onExtractData: () => void;
  extractDisabled: boolean;
  onCreateTemplate: () => void;
  onSaveTemplate: () => void;
  isAdmin: boolean;
  canDeleteActiveTemplate?: boolean;
  onDeleteActiveTemplate?: () => void;
};

export function MacroMainToolbar({
  mainTab,
  onMainTabChange,
  onExtractData,
  extractDisabled,
  onCreateTemplate,
  onSaveTemplate,
  isAdmin,
  canDeleteActiveTemplate = false,
  onDeleteActiveTemplate,
}: MacroMainToolbarProps) {
  const tr = useTr();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onExtractData}
        disabled={extractDisabled}
        className="rounded-md border border-fs-accent/30 bg-fs-accent-soft px-2.5 py-1 text-xs font-medium text-fs-accent-text transition hover:border-fs-accent disabled:cursor-not-allowed disabled:opacity-40"
      >{tr("提取数据")}</button>
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-fs-border/90 bg-fs-elevated p-0.5"
        role="tablist"
        aria-label={tr("宏观功能模块")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "selected"}
          onClick={() => onMainTabChange("selected")}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition ${
            mainTab === "selected"
              ? "border border-fs-accent bg-fs-accent-soft text-fs-accent-text"
              : "border border-transparent text-fs-text hover:border-fs-border hover:bg-fs-elevated/40"
          }`}
        >{tr("已选指标")}</button>
        <span className="h-4 w-px shrink-0 bg-fs-border/90" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "charts"}
          onClick={() => onMainTabChange("charts")}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition ${
            mainTab === "charts"
              ? "border border-fs-accent bg-fs-accent-soft text-fs-accent-text"
              : "border border-transparent text-fs-text hover:border-fs-border hover:bg-fs-elevated/40"
          }`}
        >{tr("图表")}</button>
        <span className="h-4 w-px shrink-0 bg-fs-border/90" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "templates"}
          onClick={() => onMainTabChange("templates")}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition ${
            mainTab === "templates"
              ? "border border-fs-accent bg-fs-accent-soft text-fs-accent-text"
              : "border border-transparent text-fs-text hover:border-fs-border hover:bg-fs-elevated/40"
          }`}
        >{tr("模板库")}</button>
        <span className="h-4 w-px shrink-0 bg-fs-border/90" aria-hidden />
        <button
          type="button"
          onClick={onCreateTemplate}
          className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-fs-text transition hover:border-fs-border hover:bg-fs-elevated"
          title={tr("清空当前配置并新建模板草稿")}
        >{tr("新建模板")}</button>
        <button
          type="button"
          onClick={onSaveTemplate}
          className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-fs-text transition hover:border-fs-border hover:bg-fs-elevated"
          title={isAdmin ? tr("选择保存为系统模板或我的模板") : tr("命名后保存到我的模板")}
        >{tr("保存模板")}</button>
        {canDeleteActiveTemplate && onDeleteActiveTemplate ? (
          <button
            type="button"
            onClick={onDeleteActiveTemplate}
            className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-fs-text transition hover:border-fs-border hover:bg-fs-elevated"
            title={isAdmin ? tr("删除当前系统模板或我的模板") : tr("删除当前我的模板")}
          >{tr("删除模板")}</button>
        ) : null}
      </div>
    </div>
  );
}

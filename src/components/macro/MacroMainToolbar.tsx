"use client";

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
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onExtractData}
        disabled={extractDisabled}
        className="rounded-md border border-emerald-700/80 bg-emerald-950/45 px-2.5 py-1 text-xs font-medium text-emerald-100 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        提取数据
      </button>
      <div
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-slate-700/90 bg-slate-950/50 p-0.5"
        role="tablist"
        aria-label="宏观功能模块"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "selected"}
          onClick={() => onMainTabChange("selected")}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition ${
            mainTab === "selected"
              ? "border border-emerald-600 bg-emerald-950/50 text-emerald-100"
              : "border border-transparent text-slate-200 hover:border-slate-600 hover:bg-slate-900/40"
          }`}
        >
          已选指标
        </button>
        <span className="h-4 w-px shrink-0 bg-slate-700/90" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "charts"}
          onClick={() => onMainTabChange("charts")}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition ${
            mainTab === "charts"
              ? "border border-emerald-600 bg-emerald-950/50 text-emerald-100"
              : "border border-transparent text-slate-200 hover:border-slate-600 hover:bg-slate-900/40"
          }`}
        >
          图表
        </button>
        <span className="h-4 w-px shrink-0 bg-slate-700/90" aria-hidden />
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "templates"}
          onClick={() => onMainTabChange("templates")}
          className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition ${
            mainTab === "templates"
              ? "border border-emerald-600 bg-emerald-950/50 text-emerald-100"
              : "border border-transparent text-slate-200 hover:border-slate-600 hover:bg-slate-900/40"
          }`}
        >
          模板库
        </button>
        <span className="h-4 w-px shrink-0 bg-slate-700/90" aria-hidden />
        <button
          type="button"
          onClick={onCreateTemplate}
          className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-900/60"
          title="清空当前配置并新建模板草稿"
        >
          新建模板
        </button>
        <button
          type="button"
          onClick={onSaveTemplate}
          className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-cyan-100 transition hover:border-cyan-700/60 hover:bg-cyan-950/25"
          title={isAdmin ? "选择保存为系统模板或我的模板" : "命名后保存到我的模板"}
        >
          保存模板
        </button>
        {canDeleteActiveTemplate && onDeleteActiveTemplate ? (
          <button
            type="button"
            onClick={onDeleteActiveTemplate}
            className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-rose-200/90 transition hover:border-rose-800/70 hover:bg-rose-950/25"
            title={isAdmin ? "删除当前系统模板或我的模板" : "删除当前我的模板"}
          >
            删除模板
          </button>
        ) : null}
      </div>
    </div>
  );
}

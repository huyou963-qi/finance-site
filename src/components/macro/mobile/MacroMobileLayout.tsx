"use client";

import { useState, type ReactNode } from "react";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import {
  IconChart,
  IconChecklist,
  IconGrid,
  IconLayers,
  IconMore,
  IconTable,
} from "@/components/mobile/mobileIcons";

export type MacroMobileTab = "tree" | "selected" | "data" | "charts" | "templates";

const TABS: { id: MacroMobileTab; label: string; Icon: typeof IconLayers }[] = [
  { id: "tree", label: "指标", Icon: IconLayers },
  { id: "selected", label: "已选", Icon: IconChecklist },
  { id: "data", label: "数据", Icon: IconTable },
  { id: "charts", label: "图表", Icon: IconChart },
  { id: "templates", label: "模板", Icon: IconGrid },
];

export type MacroMobileLayoutProps = {
  tab: MacroMobileTab;
  onTabChange: (tab: MacroMobileTab) => void;
  /** 顶部标题旁的说明：当前模板名或指标数 */
  subtitle: string;
  selectedBadge: number;
  onExtract: () => void;
  extractDisabled: boolean;
  extracting: boolean;
  onCreateTemplate: () => void;
  onSaveTemplate: () => void;
  onDeleteTemplate?: () => void;
  tree: ReactNode;
  selected: ReactNode;
  data: ReactNode;
  charts: ReactNode;
  templates: ReactNode;
};

/**
 * 宏观数据手机布局：底部 5 个标签一次只显示一块，替代桌面的左右分栏。
 * 指标树常驻挂载（隐藏时保留搜索词与展开状态），其余面板按需渲染。
 */
export function MacroMobileLayout({
  tab,
  onTabChange,
  subtitle,
  selectedBadge,
  onExtract,
  extractDisabled,
  extracting,
  onCreateTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  tree,
  selected,
  data,
  charts,
  templates,
}: MacroMobileLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const menuAction = (label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
      className={`flex h-13 w-full items-center border-t border-fs-border px-5 text-left text-base active:bg-fs-elevated ${
        danger ? "text-fs-negative" : "text-fs-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-13 shrink-0 items-center gap-2 border-b border-fs-border py-1 pl-3 pr-1">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="shrink-0 text-base font-semibold text-fs-text">宏观数据</h1>
          <span className="truncate text-xs text-fs-muted">{subtitle}</span>
        </div>
        <button
          type="button"
          onClick={onExtract}
          disabled={extractDisabled}
          className="h-9 shrink-0 rounded-md border border-fs-accent/30 bg-fs-accent-soft px-3 text-sm font-medium text-fs-accent-text active:border-fs-accent disabled:opacity-40"
        >
          {extracting ? "提取中…" : "提取数据"}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="模板操作"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated"
        >
          <IconMore size={22} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={tab === "tree" ? "flex h-full min-h-0 flex-col px-3 pt-3" : "hidden"}>
          {tree}
        </div>
        {tab === "selected" ? (
          <div className="h-full overflow-y-auto overscroll-contain">{selected}</div>
        ) : null}
        {tab === "data" ? <div className="flex h-full min-h-0 flex-col">{data}</div> : null}
        {tab === "charts" ? (
          <div className="h-full overflow-y-auto overscroll-contain">{charts}</div>
        ) : null}
        {tab === "templates" ? (
          <div className="h-full overflow-y-auto overscroll-contain px-3 py-3">{templates}</div>
        ) : null}
      </div>

      <nav
        aria-label="宏观功能模块"
        className="flex shrink-0 border-t border-fs-border bg-white/95"
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = id === tab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                active ? "font-semibold text-fs-accent-text" : "text-fs-muted"
              }`}
            >
              <Icon size={22} />
              <span>{label}</span>
              {id === "selected" && selectedBadge > 0 ? (
                <span className="absolute left-[calc(50%+4px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fs-accent px-1 text-[10px] font-semibold text-white">
                  {selectedBadge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <MobileSheet open={menuOpen} onClose={() => setMenuOpen(false)} title="模板">
        <div className="pb-2">
          {menuAction("新建模板", onCreateTemplate)}
          {menuAction("保存模板", onSaveTemplate)}
          {onDeleteTemplate ? menuAction("删除当前模板", onDeleteTemplate, true) : null}
        </div>
      </MobileSheet>
    </div>
  );
}

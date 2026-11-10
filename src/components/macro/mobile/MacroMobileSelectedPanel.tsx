"use client";

import { useState } from "react";
import type { SelectedIndicatorRowMeta } from "@/components/SelectedIndicatorsList";
import { MobileSheet } from "@/components/mobile/MobileSheet";
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconLocate,
  IconMore,
  IconSigma,
  IconTrash,
} from "@/components/mobile/mobileIcons";
import {
  createDividerItem,
  dividerDisplayLabel,
  removeDivider,
  reorderListItems,
  updateDividerLabel,
  type MacroSelectedListItem,
} from "@/lib/macroSelectedList";
import { useTr } from "@/i18n/TextProvider";
import type { Tr } from "@/i18n/text";

export type MacroMobileSelectedPanelProps = {
  items: MacroSelectedListItem[];
  rowByKey: Map<string, SelectedIndicatorRowMeta>;
  onChange: (items: MacroSelectedListItem[]) => void;
  onRemoveKey: (key: string) => void;
  onRenameKey?: (key: string) => void;
  onLocateKey: (key: string) => void;
  displayCount: number;
  rawCount: number;
  maxSeries: number;
  onOpenCalc: () => void;
  /** 管理员可见指标来源；普通用户隐藏 */
  showSource?: boolean;
};

function metaLine(row: SelectedIndicatorRowMeta, showSource: boolean, tr: Tr): string {
  return [
    row.country,
    row.frequency,
    row.unit,
    row.updatedAt ? tr("观测 {updatedAt}", { updatedAt: row.updatedAt }) : undefined,
    showSource ? row.source : undefined,
  ]
    .filter((v): v is string => Boolean(v && v !== "-" && v !== "—"))
    .join(" · ");
}

const actionClass =
  "flex h-13 w-full items-center gap-3.5 border-t border-fs-border px-5 text-left text-base text-fs-text active:bg-fs-elevated disabled:opacity-35";

/** 手机端已选指标：两行卡片 + 「⋯」菜单（上移/下移替代拖动排序，按钮替代双击定位） */
export function MacroMobileSelectedPanel({
  items,
  rowByKey,
  onChange,
  onRemoveKey,
  onRenameKey,
  onLocateKey,
  displayCount,
  rawCount,
  maxSeries,
  onOpenCalc,
  showSource = false,
}: MacroMobileSelectedPanelProps) {
  const tr = useTr();
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const menuItem = menuIndex != null ? items[menuIndex] : undefined;
  const closeMenu = () => setMenuIndex(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    onChange(reorderListItems(items, from, to));
    setMenuIndex(to);
  };

  let menuTitle = "";
  if (menuItem?.type === "divider") menuTitle = tr("分组：{v0}", { v0: dividerDisplayLabel(menuItem) });
  else if (menuItem) menuTitle = rowByKey.get(menuItem.key)?.label ?? menuItem.key;

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-fs-text">{tr("已选指标")}{" "}<span className="font-normal text-fs-muted">{displayCount}</span>
          </p>
          <p className="mt-0.5 text-xs text-fs-muted">{tr("原始指标")}{" "}{rawCount}/{maxSeries}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCalc}
          disabled={items.length === 0}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-fs-border bg-white px-3 text-sm font-medium text-fs-text active:bg-fs-elevated disabled:opacity-40"
        >
          <IconSigma size={16} />{tr("指标运算")}</button>
        <button
          type="button"
          onClick={() => onChange([...items, createDividerItem()])}
          disabled={items.length === 0}
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-fs-border bg-white px-3 text-sm font-medium text-fs-text active:bg-fs-elevated disabled:opacity-40"
        >{tr("+ 分割线")}</button>
      </div>

      {items.length === 0 ? (
        <p className="border-t border-fs-border px-3 py-8 text-center text-sm text-fs-muted">{tr("暂无已选指标，到「指标」里勾选。")}</p>
      ) : (
        <ul className="border-t border-fs-border">
          {items.map((item, index) => {
            if (item.type === "divider") {
              return (
                <li
                  key={item.id}
                  className="flex h-11 items-center gap-2 border-b border-fs-accent/30 bg-fs-accent-soft/60 pl-3 pr-0.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fs-accent-text">
                    —— {dividerDisplayLabel(item)} ——
                  </span>
                  <button
                    type="button"
                    onClick={() => setMenuIndex(index)}
                    aria-label={tr("分组操作")}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-accent-text"
                  >
                    <IconMore size={22} />
                  </button>
                </li>
              );
            }
            const row = rowByKey.get(item.key);
            if (!row) return null;
            const isDerived = item.type === "derived";
            return (
              <li
                key={item.key}
                className="flex min-h-[62px] items-center gap-1.5 border-b border-fs-border/80 py-2 pl-3 pr-0.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-fs-text">
                    {isDerived ? (
                      <span className="mr-1.5 inline-flex rounded border border-fs-accent/30 bg-fs-accent-soft px-1.5 align-[2px] text-[11px] text-fs-accent-text">{tr("派生")}</span>
                    ) : null}
                    {tr(row.label)}
                  </p>
                  <p className="mt-0.5 truncate text-xs tabular-nums text-fs-muted">
                    {metaLine(row, showSource, tr) || (showSource ? item.key : "")}
                  </p>
                </div>
                {isDerived && onRenameKey ? (
                  <button
                    type="button"
                    onClick={() => onRenameKey(item.key)}
                    className="inline-flex h-8 shrink-0 items-center rounded-md border border-fs-border bg-white px-2.5 text-[13px] text-fs-secondary"
                  >{tr("改名")}</button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMenuIndex(index)}
                  aria-label={tr("更多操作")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated"
                >
                  <IconMore size={22} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-3 py-3.5 text-[13px] leading-relaxed text-fs-muted">{tr("点右上「提取数据」后，到「数据」查看数值、到「图表」看走势。")}</p>

      <MobileSheet open={menuItem != null} onClose={closeMenu} title={menuTitle}>
        {menuItem && menuIndex != null ? (
          <div className="pb-2">
            <button
              type="button"
              disabled={menuIndex === 0}
              onClick={() => move(menuIndex, menuIndex - 1)}
              className={actionClass}
            >
              <IconArrowUp />{tr("上移")}</button>
            <button
              type="button"
              disabled={menuIndex === items.length - 1}
              onClick={() => move(menuIndex, menuIndex + 1)}
              className={actionClass}
            >
              <IconArrowDown />{tr("下移")}</button>
            {menuItem.type === "divider" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next = window.prompt(tr("分组名称"), dividerDisplayLabel(menuItem));
                    if (next != null) onChange(updateDividerLabel(items, menuItem.id, next));
                    closeMenu();
                  }}
                  className={actionClass}
                >
                  <IconEdit />{tr("编辑分组名称")}</button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(removeDivider(items, menuItem.id));
                    closeMenu();
                  }}
                  className={`${actionClass} text-fs-negative`}
                >
                  <IconTrash />{tr("删除分组")}</button>
              </>
            ) : (
              <>
                {menuItem.type === "derived" ? (
                  onRenameKey ? (
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onRenameKey(menuItem.key);
                      }}
                      className={actionClass}
                    >
                      <IconEdit />{tr("改名")}</button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      onLocateKey(menuItem.key);
                    }}
                    className={actionClass}
                  >
                    <IconLocate />{tr("在指标树中定位")}</button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onRemoveKey(menuItem.key);
                  }}
                  className={`${actionClass} text-fs-negative`}
                >
                  <IconTrash />{tr("删除")}</button>
              </>
            )}
          </div>
        ) : null}
      </MobileSheet>
    </div>
  );
}

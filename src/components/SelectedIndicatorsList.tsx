"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  dividerDisplayLabel,
  removeDivider,
  reorderListItems,
  updateDividerLabel,
  type MacroSelectedListItem,
} from "@/lib/macroSelectedList";

export type SelectedIndicatorRowMeta = {
  key: string;
  label: string;
  frequency: string;
  range: string;
  unit: string;
  country: string;
  updatedAt: string;
  source: string;
};

type Props = {
  items: MacroSelectedListItem[];
  rowByKey: Map<string, SelectedIndicatorRowMeta>;
  onChange: (items: MacroSelectedListItem[]) => void;
  onRemoveKey: (key: string) => void;
  onLocateKey: (key: string) => void;
};

function DividerLabelEditor({
  id,
  label,
  onSave,
}: {
  id: string;
  label: string;
  onSave: (id: string, nextLabel: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(label);
  }, [label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    onSave(id, draft);
    setEditing(false);
  }, [draft, id, onSave]);

  const cancel = useCallback(() => {
    setDraft(label);
    setEditing(false);
  }, [label]);

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1 text-[10px] text-fs-accent-text">
        <span className="shrink-0 text-fs-accent">——</span>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
          placeholder="分组名称"
          className="min-w-0 flex-1 rounded border border-fs-accent/50 bg-white px-1.5 py-0 text-[10px] text-fs-text outline-none focus:border-fs-accent"
        />
        <span className="shrink-0 text-fs-accent">——</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="点击编辑分组名称"
      className="min-w-0 flex-1 truncate text-left text-[10px] font-medium tracking-wide text-fs-accent-text hover:text-fs-accent"
    >
      —— {label} ——
    </button>
  );
}

export function SelectedIndicatorsList({
  items,
  rowByKey,
  onChange,
  onRemoveKey,
  onLocateKey,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const finishDrag = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex === null || dragIndex === toIndex) {
        finishDrag();
        return;
      }
      onChange(reorderListItems(items, dragIndex, toIndex));
      finishDrag();
    },
    [dragIndex, finishDrag, items, onChange],
  );

  const saveDividerLabel = useCallback(
    (id: string, nextLabel: string) => {
      onChange(updateDividerLabel(items, id, nextLabel));
    },
    [items, onChange],
  );

  const dragHandleProps = (index: number) => ({
    draggable: true,
    onDragStart: () => setDragIndex(index),
    onDragEnd: finishDrag,
  });

  const dropTargetProps = (index: number) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropIndex(index);
    },
    onDragLeave: () => setDropIndex((prev) => (prev === index ? null : prev)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      handleDrop(index);
    },
  });

  if (items.length === 0) {
    return <p className="px-2 py-3 text-xs text-fs-muted">暂无已选指标。</p>;
  }

  return (
    <ul className="divide-y divide-fs-border/80">
      {items.map((item, index) => {
        if (item.type === "divider") {
          const label = dividerDisplayLabel(item);
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <li
              key={item.id}
              {...dropTargetProps(index)}
              className={`flex items-center gap-2 border-y border-fs-accent/30 bg-fs-accent-soft/60 px-2 py-1 ${
                isDropTarget ? "ring-1 ring-inset ring-fs-accent/50" : ""
              }`}
            >
              <span
                {...dragHandleProps(index)}
                className="cursor-grab select-none text-[10px] text-fs-secondary active:cursor-grabbing"
                title="拖动调整分界线位置"
                aria-label="拖动分界线"
              >
                ⋮⋮
              </span>
              <DividerLabelEditor id={item.id} label={label} onSave={saveDividerLabel} />
              <button
                type="button"
                onClick={() => onChange(removeDivider(items, item.id))}
                className="shrink-0 rounded border border-fs-accent/50 bg-white px-1.5 py-0 text-[10px] font-medium text-fs-accent-text hover:border-fs-accent hover:bg-fs-accent-soft"
              >
                删除分组
              </button>
            </li>
          );
        }

        const row = rowByKey.get(item.key);
        if (!row) return null;
        const rangeText = row.range !== "-" ? row.range : "—";
        const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

        return (
          <li
            key={item.key}
            {...dropTargetProps(index)}
            title={`${item.key}\n国家：${row.country}\n单位：${row.unit}\n更新时间：${row.updatedAt}\n频率：${row.frequency}\n来源：${row.source}\n范围：${rangeText}\n拖动调整顺序；双击定位到左侧指标树`}
            className={`flex cursor-pointer items-center gap-1.5 px-2 py-1 hover:bg-fs-elevated/80 ${
              isDropTarget ? "bg-fs-elevated ring-1 ring-inset ring-fs-accent/40" : ""
            }`}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a, input")) return;
              onLocateKey(item.key);
            }}
          >
            <span
              {...dragHandleProps(index)}
              className="shrink-0 cursor-grab select-none px-0.5 text-[11px] text-fs-secondary active:cursor-grabbing"
              title="拖动调整顺序"
              aria-label="拖动排序"
            >
              ⋮⋮
            </span>
            <span className="min-w-0 max-w-[38%] shrink truncate text-xs font-medium text-fs-text">
              {row.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-[10px] leading-tight text-fs-secondary tabular-nums">
              <span className="text-fs-secondary">国家</span>：{row.country}
              <span className="mx-1.5 text-fs-secondary">|</span>
              <span className="text-fs-secondary">单位</span>：{row.unit}
              <span className="mx-1.5 text-fs-secondary">|</span>
              <span className="text-fs-secondary">更新时间</span>：{row.updatedAt}
              <span className="mx-1.5 text-fs-secondary">|</span>
              <span className="text-fs-secondary">频率</span>：{row.frequency}
              <span className="mx-1.5 text-fs-secondary">|</span>
              <span className="text-fs-secondary">来源</span>：{row.source}
              <span className="mx-1.5 text-fs-secondary">|</span>
              <span className="text-fs-secondary">范围</span>：{rangeText}
            </span>
            <Link
              href={`/tools/statistical-analysis?series=${encodeURIComponent(item.key)}&label=${encodeURIComponent(row.label)}`}
              className="shrink-0 rounded border border-fs-accent/50 bg-fs-accent-soft px-1.5 py-0 text-[10px] font-medium text-fs-accent-text hover:border-fs-accent"
              title="跳转到统计分析页面"
            >
              统计分析
            </Link>
            <button
              type="button"
              onClick={() => onRemoveKey(item.key)}
              className="shrink-0 rounded border border-fs-negative/50 bg-white px-1.5 py-0 text-[10px] font-medium text-fs-negative hover:border-fs-negative hover:bg-red-50"
            >
              删除
            </button>
          </li>
        );
      })}
    </ul>
  );
}

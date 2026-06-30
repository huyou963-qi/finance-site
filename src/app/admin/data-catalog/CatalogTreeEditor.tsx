"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { randomUUID } from "@/lib/randomId";
import type {
  CatalogLayoutApiPayload,
  CatalogLayoutCategory,
  CatalogLayoutCountry,
  CatalogLayoutDocument,
  CatalogLayoutSubgroup,
} from "@/lib/data/catalogLayout";
import { UNASSIGNED_CATEGORY_NAME } from "@/lib/data/catalogLayout";

type ItemLocation = {
  countryCode: string;
  categoryId: string;
  subgroupId: string | null;
  index: number;
};

type DragPayload = {
  key: string;
  from: ItemLocation;
};

function findCategory(
  layout: CatalogLayoutDocument,
  countryCode: string,
  categoryId: string,
): CatalogLayoutCategory | null {
  const country = layout.countries.find((c) => c.countryCode === countryCode);
  return country?.categories.find((c) => c.id === categoryId) ?? null;
}

function getItemList(
  cat: CatalogLayoutCategory,
  subgroupId: string | null,
): string[] {
  if (subgroupId) {
    const sg = cat.subgroups.find((s) => s.id === subgroupId);
    return sg?.itemKeys ?? [];
  }
  return cat.itemKeys;
}

function setItemList(
  cat: CatalogLayoutCategory,
  subgroupId: string | null,
  keys: string[],
): CatalogLayoutCategory {
  if (subgroupId) {
    return {
      ...cat,
      subgroups: cat.subgroups.map((sg) =>
        sg.id === subgroupId ? { ...sg, itemKeys: keys } : sg,
      ),
    };
  }
  return { ...cat, itemKeys: keys };
}

function moveItemInLayout(
  layout: CatalogLayoutDocument,
  key: string,
  from: ItemLocation,
  to: ItemLocation,
): CatalogLayoutDocument {
  const sameContainer =
    from.countryCode === to.countryCode &&
    from.categoryId === to.categoryId &&
    from.subgroupId === to.subgroupId;
  let insertIndex = to.index;
  if (sameContainer && from.index < to.index) {
    insertIndex -= 1;
  }

  const countries = layout.countries.map((country) => {
    if (country.countryCode !== from.countryCode && country.countryCode !== to.countryCode) {
      return country;
    }

    let next = country;

    if (country.countryCode === from.countryCode) {
      next = {
        ...next,
        categories: next.categories.map((cat) => {
          if (cat.id !== from.categoryId) return cat;
          const list = [...getItemList(cat, from.subgroupId)];
          if (from.index < 0 || from.index >= list.length || list[from.index] !== key) {
            const idx = list.indexOf(key);
            if (idx >= 0) list.splice(idx, 1);
          } else {
            list.splice(from.index, 1);
          }
          return setItemList(cat, from.subgroupId, list);
        }),
      };
    }

    if (country.countryCode === to.countryCode) {
      next = {
        ...next,
        categories: next.categories.map((cat) => {
          if (cat.id !== to.categoryId) return cat;
          const list = [...getItemList(cat, to.subgroupId)];
          const without = list.filter((k) => k !== key);
          const insertAt = Math.max(0, Math.min(insertIndex, without.length));
          without.splice(insertAt, 0, key);
          return setItemList(cat, to.subgroupId, without);
        }),
      };
    }

    return next;
  });

  return { ...layout, countries };
}

function updateCountry(
  layout: CatalogLayoutDocument,
  countryCode: string,
  updater: (c: CatalogLayoutCountry) => CatalogLayoutCountry,
): CatalogLayoutDocument {
  return {
    ...layout,
    countries: layout.countries.map((c) =>
      c.countryCode === countryCode ? updater(c) : c,
    ),
  };
}

function DropZone({
  label,
  keys,
  itemLabels,
  countryCode,
  categoryId,
  subgroupId,
  onDropItem,
}: {
  label: string;
  keys: string[];
  itemLabels: Record<string, string>;
  countryCode: string;
  categoryId: string;
  subgroupId: string | null;
  onDropItem: (payload: DragPayload, to: ItemLocation) => void;
}) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    const raw = e.dataTransfer.getData("application/x-catalog-item");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as DragPayload;
      onDropItem(payload, { countryCode, categoryId, subgroupId, index });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-0.5">
      {keys.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverIndex(0);
          }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={(e) => handleDrop(e, 0)}
          className={`rounded border border-dashed px-2 py-1.5 text-xs ${
            dragOverIndex === 0
              ? "border-cyan-500/60 bg-cyan-950/30 text-cyan-200/80"
              : "border-fs-border text-fs-secondary"
          }`}
        >
          {label}（拖入指标）
        </div>
      ) : (
        keys.map((key, index) => (
          <div
            key={key}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/x-catalog-item",
                JSON.stringify({
                  key,
                  from: { countryCode, categoryId, subgroupId, index },
                } satisfies DragPayload),
              );
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIndex(index);
            }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => handleDrop(e, index)}
            className={`flex cursor-grab items-center gap-2 rounded border px-2 py-1 text-xs active:cursor-grabbing ${
              dragOverIndex === index
                ? "border-cyan-500/60 bg-cyan-950/40"
                : "border-fs-border bg-fs-elevated hover:border-fs-border"
            }`}
          >
            <span className="shrink-0 text-fs-secondary">⠿</span>
            <span className="min-w-0 flex-1 truncate text-fs-text">
              {itemLabels[key] ?? key}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-fs-secondary">{key}</span>
          </div>
        ))
      )}
      {keys.length > 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverIndex(keys.length);
          }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={(e) => handleDrop(e, keys.length)}
          className={`h-1 rounded ${
            dragOverIndex === keys.length ? "bg-cyan-500/50" : "bg-transparent"
          }`}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function CategoryBlock({
  countryCode,
  category,
  itemLabels,
  onRenameCategory,
  onDeleteCategory,
  onAddSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onDropItem,
}: {
  countryCode: string;
  category: CatalogLayoutCategory;
  itemLabels: Record<string, string>;
  onRenameCategory: (categoryId: string, name: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onAddSubgroup: (categoryId: string) => void;
  onRenameSubgroup: (categoryId: string, subgroupId: string, name: string) => void;
  onDeleteSubgroup: (categoryId: string, subgroupId: string) => void;
  onDropItem: (payload: DragPayload, to: ItemLocation) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(category.name);

  const btn =
    "rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:bg-fs-elevated hover:text-fs-text";

  return (
    <div className="rounded-lg border border-fs-border bg-fs-elevated p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              const trimmed = nameDraft.trim();
              if (trimmed && trimmed !== category.name) onRenameCategory(category.id, trimmed);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setNameDraft(category.name);
                setEditingName(false);
              }
            }}
            className="min-w-[120px] rounded border border-fs-border bg-fs-elevated px-2 py-0.5 text-sm text-fs-text"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(category.name);
              setEditingName(true);
            }}
            className="text-sm font-medium text-fs-text hover:text-fs-text"
            title="点击修改分类名"
          >
            {category.name}
          </button>
        )}
        <span className="text-xs text-fs-secondary">
          {category.itemKeys.length +
            category.subgroups.reduce((n, sg) => n + sg.itemKeys.length, 0)}{" "}
          项
        </span>
        <div className="ml-auto flex flex-wrap gap-1">
          <button type="button" className={btn} onClick={() => onAddSubgroup(category.id)}>
            + 子层
          </button>
          <button type="button" className={btn} onClick={() => onDeleteCategory(category.id)}>
            删除分类
          </button>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-fs-secondary">分类下指标</div>
        <DropZone
          label="此分类"
          keys={category.itemKeys}
          itemLabels={itemLabels}
          countryCode={countryCode}
          categoryId={category.id}
          subgroupId={null}
          onDropItem={onDropItem}
        />
      </div>

      {(category.subgroups ?? []).map((sg) => (
        <SubgroupBlock
          key={sg.id}
          countryCode={countryCode}
          categoryId={category.id}
          subgroup={sg}
          itemLabels={itemLabels}
          onRename={(name) => onRenameSubgroup(category.id, sg.id, name)}
          onDelete={() => onDeleteSubgroup(category.id, sg.id)}
          onDropItem={onDropItem}
        />
      ))}
    </div>
  );
}

function SubgroupBlock({
  countryCode,
  categoryId,
  subgroup,
  itemLabels,
  onRename,
  onDelete,
  onDropItem,
}: {
  countryCode: string;
  categoryId: string;
  subgroup: CatalogLayoutSubgroup;
  itemLabels: Record<string, string>;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDropItem: (payload: DragPayload, to: ItemLocation) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(subgroup.name);
  const btn =
    "rounded border border-fs-border px-1.5 py-0.5 text-[10px] text-fs-muted hover:bg-fs-elevated hover:text-fs-text";

  return (
    <div className="mb-2 ml-3 border-l-2 border-fs-border pl-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              const trimmed = nameDraft.trim();
              if (trimmed && trimmed !== subgroup.name) onRename(trimmed);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setNameDraft(subgroup.name);
                setEditingName(false);
              }
            }}
            className="min-w-[100px] rounded border border-fs-border bg-fs-elevated px-2 py-0.5 text-xs text-fs-text"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(subgroup.name);
              setEditingName(true);
            }}
            className="text-xs font-medium text-fs-muted hover:text-fs-text"
            title="点击修改子层名"
          >
            {subgroup.name}
          </button>
        )}
        <button type="button" className={btn} onClick={onDelete}>
          删除子层
        </button>
      </div>
      <DropZone
        label={subgroup.name}
        keys={subgroup.itemKeys}
        itemLabels={itemLabels}
        countryCode={countryCode}
        categoryId={categoryId}
        subgroupId={subgroup.id}
        onDropItem={onDropItem}
      />
    </div>
  );
}

export function CatalogTreeEditor({ onSaved }: { onSaved?: () => void }) {
  const [data, setData] = useState<CatalogLayoutApiPayload | null>(null);
  const [layout, setLayout] = useState<CatalogLayoutDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("US");
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog-layout", { cache: "no-store" });
      const payload = (await res.json()) as CatalogLayoutApiPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setData(payload);
      setLayout(payload.layout);
      setDirty(false);
      setCountryFilter((prev) => {
        if (payload.layout.countries.some((c) => c.countryCode === prev)) return prev;
        return payload.layout.countries[0]?.countryCode ?? prev;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const itemLabels = data?.itemLabels ?? {};

  const currentCountry = useMemo(() => {
    if (!layout) return null;
    return layout.countries.find((c) => c.countryCode === countryFilter) ?? null;
  }, [layout, countryFilter]);

  const countryOptions = useMemo(() => {
    if (!layout) return [];
    return layout.countries.map((c) => c.countryCode);
  }, [layout]);

  const patchLayout = (next: CatalogLayoutDocument) => {
    setLayout(next);
    setDirty(true);
    setMsg(null);
  };

  const handleDropItem = (payload: DragPayload, to: ItemLocation) => {
    if (!layout) return;
    const next = moveItemInLayout(layout, payload.key, payload.from, to);
    patchLayout(next);
  };

  const addCategory = () => {
    if (!layout || !currentCountry) return;
    const name = window.prompt("新分类名称");
    if (!name?.trim()) return;
    patchLayout(
      updateCountry(layout, currentCountry.countryCode, (c) => ({
        ...c,
        categories: [
          ...c.categories,
          { id: randomUUID(), name: name.trim(), itemKeys: [], subgroups: [] },
        ],
      })),
    );
  };

  const renameCategory = (categoryId: string, name: string) => {
    if (!layout || !currentCountry) return;
    patchLayout(
      updateCountry(layout, currentCountry.countryCode, (c) => ({
        ...c,
        categories: c.categories.map((cat) =>
          cat.id === categoryId ? { ...cat, name } : cat,
        ),
      })),
    );
  };

  const deleteCategory = (categoryId: string) => {
    if (!layout || !currentCountry) return;
    const cat = findCategory(layout, currentCountry.countryCode, categoryId);
    if (!cat) return;
    const count =
      cat.itemKeys.length + cat.subgroups.reduce((n, sg) => n + sg.itemKeys.length, 0);
    if (count > 0 && !window.confirm(`删除「${cat.name}」？其中 ${count} 个指标将移至「未分配」。`)) {
      return;
    }
    const keysToMove = [
      ...cat.itemKeys,
      ...cat.subgroups.flatMap((sg) => sg.itemKeys),
    ];
    let next = updateCountry(layout, currentCountry.countryCode, (c) => ({
      ...c,
      categories: c.categories.filter((x) => x.id !== categoryId),
    }));
    if (keysToMove.length > 0) {
      next = moveKeysToUnassigned(next, currentCountry.countryCode, keysToMove);
    }
    patchLayout(next);
  };

  const addSubgroup = (categoryId: string) => {
    if (!layout || !currentCountry) return;
    const name = window.prompt("子层名称");
    if (!name?.trim()) return;
    patchLayout(
      updateCountry(layout, currentCountry.countryCode, (c) => ({
        ...c,
        categories: c.categories.map((cat) =>
          cat.id === categoryId
            ? {
                ...cat,
                subgroups: [
                  ...cat.subgroups,
                  { id: randomUUID(), name: name.trim(), itemKeys: [] },
                ],
              }
            : cat,
        ),
      })),
    );
  };

  const renameSubgroup = (categoryId: string, subgroupId: string, name: string) => {
    if (!layout || !currentCountry) return;
    patchLayout(
      updateCountry(layout, currentCountry.countryCode, (c) => ({
        ...c,
        categories: c.categories.map((cat) =>
          cat.id === categoryId
            ? {
                ...cat,
                subgroups: cat.subgroups.map((sg) =>
                  sg.id === subgroupId ? { ...sg, name } : sg,
                ),
              }
            : cat,
        ),
      })),
    );
  };

  const deleteSubgroup = (categoryId: string, subgroupId: string) => {
    if (!layout || !currentCountry) return;
    const cat = findCategory(layout, currentCountry.countryCode, categoryId);
    const sg = cat?.subgroups.find((s) => s.id === subgroupId);
    if (!sg) return;
    if (sg.itemKeys.length > 0 && !window.confirm(`删除子层「${sg.name}」？指标将移至「未分配」。`)) {
      return;
    }
    let next = updateCountry(layout, currentCountry.countryCode, (c) => ({
      ...c,
      categories: c.categories.map((cat) =>
        cat.id === categoryId
          ? { ...cat, subgroups: cat.subgroups.filter((s) => s.id !== subgroupId) }
          : cat,
      ),
    }));
    if (sg.itemKeys.length > 0) {
      next = moveKeysToUnassigned(next, currentCountry.countryCode, sg.itemKeys);
    }
    patchLayout(next);
  };

  const save = async () => {
    if (!layout) return;
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      });
      const payload = (await res.json()) as CatalogLayoutApiPayload & {
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setData(payload);
      setLayout(payload.layout);
      setDirty(false);
      setMsg(payload.message ?? "已保存");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = async () => {
    if (!window.confirm("恢复为系统默认目录树？自定义布局将被清除。")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalog-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const payload = (await res.json()) as CatalogLayoutApiPayload & {
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setData(payload);
      setLayout(payload.layout);
      setDirty(false);
      setMsg(payload.message ?? "已恢复默认");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setSaving(false);
    }
  };

  const btn =
    "rounded-md border border-fs-border bg-fs-elevated px-3 py-1.5 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-50";

  if (loading && !layout) {
    return <p className="text-sm text-fs-muted">加载目录布局…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-fs-border bg-fs-bg/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-fs-text">编辑目录树</h2>
          <p className="mt-0.5 text-xs text-fs-muted">
            拖动指标调整层级与顺序；宏观页目录只读，与此处保存的布局一致。
            {data?.isCustom ? (
              <span className="text-cyan-500/80">
                {" "}
                · 已使用自定义布局
                {data.updatedAt ? `（${new Date(data.updatedAt).toLocaleString("zh-CN")}）` : ""}
              </span>
            ) : (
              <span> · 当前为默认布局</span>
            )}
            {dirty ? <span className="text-amber-400"> · 有未保存修改</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={saving} onClick={() => load()}>
            重新加载
          </button>
          <button type="button" className={btn} disabled={saving} onClick={() => resetDefault()}>
            恢复默认
          </button>
          <button
            type="button"
            className={`${btn} border-cyan-800/60 bg-cyan-950/40 text-cyan-100 hover:bg-cyan-900/40`}
            disabled={saving || !dirty}
            onClick={() => save()}
          >
            {saving ? "保存中…" : "保存布局"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {msg ? <p className="text-xs text-fs-accent-text/90">{msg}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-fs-muted">
          国家
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="rounded border border-fs-border bg-fs-bg px-2 py-1 text-sm text-fs-text"
          >
            {countryOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btn} onClick={addCategory}>
          + 添加分类
        </button>
      </div>

      {currentCountry ? (
        <div className="space-y-3">
          {currentCountry.categories.map((cat) => (
            <CategoryBlock
              key={cat.id}
              countryCode={currentCountry.countryCode}
              category={cat}
              itemLabels={itemLabels}
              onRenameCategory={renameCategory}
              onDeleteCategory={deleteCategory}
              onAddSubgroup={addSubgroup}
              onRenameSubgroup={renameSubgroup}
              onDeleteSubgroup={deleteSubgroup}
              onDropItem={handleDropItem}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-fs-muted">无国家数据</p>
      )}
    </div>
  );
}

const UNASSIGNED = UNASSIGNED_CATEGORY_NAME;

function moveKeysToUnassigned(
  layout: CatalogLayoutDocument,
  countryCode: string,
  keys: string[],
): CatalogLayoutDocument {
  if (keys.length === 0) return layout;

  let next = layout;
  for (const key of keys) {
    next = removeKeyFromCountry(next, countryCode, key);
  }

  return updateCountry(next, countryCode, (c) => {
    let unassigned = c.categories.find((cat) => cat.name === UNASSIGNED);
    if (!unassigned) {
      unassigned = {
        id: randomUUID(),
        name: UNASSIGNED,
        itemKeys: [],
        subgroups: [],
      };
      c = { ...c, categories: [...c.categories, unassigned] };
    }
    const merged = [...new Set([...(unassigned.itemKeys ?? []), ...keys])];
    return {
      ...c,
      categories: c.categories.map((cat) =>
        cat.name === UNASSIGNED ? { ...cat, itemKeys: merged } : cat,
      ),
    };
  });
}

function removeKeyFromCountry(
  layout: CatalogLayoutDocument,
  countryCode: string,
  key: string,
): CatalogLayoutDocument {
  return updateCountry(layout, countryCode, (c) => ({
    ...c,
    categories: c.categories.map((cat) => ({
      ...cat,
      itemKeys: cat.itemKeys.filter((k) => k !== key),
      subgroups: cat.subgroups.map((sg) => ({
        ...sg,
        itemKeys: sg.itemKeys.filter((k) => k !== key),
      })),
    })),
  }));
}

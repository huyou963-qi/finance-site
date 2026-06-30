"use client";

import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from "react";
import type { MacroChartTemplate, MacroTemplateFolder } from "@/lib/data/macroPresetTemplates";
import { buildTemplateFolderGroups } from "@/lib/macroTemplateFolders";

const TEMPLATE_DRAG_MIME = "application/x-macro-template-id";

export type MacroTemplateFolderSectionProps = {
  templates: MacroChartTemplate[];
  folders: MacroTemplateFolder[];
  getFolderId: (tpl: MacroChartTemplate) => string | null | undefined;
  onAssignFolder: (templateId: string, folderId: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  renderActions: (tpl: MacroChartTemplate) => ReactNode;
  renderMeta?: (tpl: MacroChartTemplate) => ReactNode;
  emptyText?: string;
  disabled?: boolean;
};

function templateTileTitle(tpl: MacroChartTemplate): string {
  const lines = [tpl.name];
  if (tpl.description) lines.push(tpl.description);
  if (!tpl.builtIn) {
    lines.push(`${tpl.selectedKeys.length} 序列 · 布局 ${tpl.layoutMode} 图`);
    lines.push(new Date(tpl.createdAtIso).toLocaleString("zh-CN"));
  }
  lines.push("拖动到其他文件夹以归类");
  return lines.join("\n");
}

function FolderToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? `折叠${label}` : `展开${label}`}
      onClick={onToggle}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-fs-border/80 bg-fs-elevated/90 text-[11px] leading-none text-fs-secondary hover:border-fs-border hover:bg-fs-border/90 hover:text-fs-text"
    >
      {open ? "−" : "+"}
    </button>
  );
}

export function MacroTemplateFolderSection({
  templates,
  folders,
  getFolderId,
  onAssignFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  renderActions,
  renderMeta: _renderMeta,
  emptyText = "暂无模板。",
  disabled = false,
}: MacroTemplateFolderSectionProps) {
  const groups = useMemo(() => {
    const built = buildTemplateFolderGroups(templates, folders, getFolderId);
    if (!built.some((g) => g.folder === null)) {
      built.push({ folder: null, templates: [] });
    }
    return built;
  }, [templates, folders, getFolderId]);

  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const isOpen = (key: string) => openFolders[key] !== false;

  const toggleFolder = (key: string) => {
    setOpenFolders((prev) => ({ ...prev, [key]: !isOpen(key) }));
  };

  const folderDropKey = (folder: MacroTemplateFolder | null) => folder?.id ?? "__uncategorized__";

  const readDraggedTemplateId = (e: DragEvent): string | null => {
    const id = e.dataTransfer.getData(TEMPLATE_DRAG_MIME) || e.dataTransfer.getData("text/plain");
    return id.trim() || null;
  };

  const handleTemplateDragStart = useCallback(
    (tpl: MacroChartTemplate, e: DragEvent<HTMLDivElement>) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(TEMPLATE_DRAG_MIME, tpl.id);
      e.dataTransfer.setData("text/plain", tpl.id);
      e.dataTransfer.effectAllowed = "move";
      setDraggingTemplateId(tpl.id);
    },
    [disabled],
  );

  const handleTemplateDragEnd = useCallback(() => {
    setDraggingTemplateId(null);
    setDropTargetKey(null);
  }, []);

  const markDropTarget = useCallback((folderKey: string) => {
    setDropTargetKey((prev) => (prev === folderKey ? prev : folderKey));
  }, []);

  const handleFolderDragOver = useCallback(
    (folderKey: string, e: DragEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      markDropTarget(folderKey);
    },
    [disabled, markDropTarget],
  );

  const handleFolderDragLeave = useCallback((folderKey: string, e: DragEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDropTargetKey((prev) => (prev === folderKey ? null : prev));
  }, []);

  const handleFolderDrop = useCallback(
    (folder: MacroTemplateFolder | null, folderKey: string, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      const templateId = readDraggedTemplateId(e);
      if (!templateId) return;
      onAssignFolder(templateId, folder?.id ?? null);
      setOpenFolders((prev) => ({ ...prev, [folderKey]: true }));
      setDraggingTemplateId(null);
      setDropTargetKey(null);
    },
    [disabled, onAssignFolder],
  );

  const renderTemplateItem = (tpl: MacroChartTemplate) => (
    <li key={tpl.id} className="min-w-0">
      <div
        draggable={!disabled}
        onDragStart={(e) => handleTemplateDragStart(tpl, e)}
        onDragEnd={handleTemplateDragEnd}
        className={`flex min-h-[8.75rem] w-full max-w-[7.25rem] cursor-grab flex-col rounded border border-fs-border/90 bg-fs-elevated/45 p-1.5 active:cursor-grabbing hover:border-fs-border/90 ${
          draggingTemplateId === tpl.id ? "opacity-45 ring-1 ring-cyan-500/40" : ""
        }`}
        title={templateTileTitle(tpl)}
      >
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="line-clamp-3 text-[11px] font-medium leading-snug text-fs-text">
            {tpl.name}
          </div>
        </div>
        <div className="mt-1.5 shrink-0">
          <div className="flex flex-col gap-0.5 [&_button]:w-full [&_button]:px-1 [&_button]:py-0.5 [&_button]:text-[10px] [&_button]:leading-tight">
            {renderActions(tpl)}
          </div>
        </div>
      </div>
    </li>
  );

  const renderTemplateGrid = (groupTemplates: MacroChartTemplate[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,7.25rem))] justify-start gap-1.5 p-1.5">
      {groupTemplates.map(renderTemplateItem)}
    </ul>
  );

  const renderFolderBody = (
    groupTemplates: MacroChartTemplate[],
    open: boolean,
    isDropTarget: boolean,
  ) => {
    if (!open) return null;

    return (
      <div className="relative border-t border-fs-border/70">
        {groupTemplates.length > 0 ? (
          renderTemplateGrid(groupTemplates)
        ) : (
          <p className="px-2 py-1.5 text-[10px] text-fs-secondary">
            {draggingTemplateId ? "拖入模板以归类" : "文件夹为空"}
          </p>
        )}
        {draggingTemplateId && isDropTarget ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-cyan-950/10 pb-1">
            <span className="rounded bg-cyan-950/80 px-2 py-0.5 text-[10px] text-cyan-200/90">
              松开以移入此文件夹
            </span>
          </div>
        ) : null}
      </div>
    );
  };

  const renderFolderShell = (
    folder: MacroTemplateFolder | null,
    groupTemplates: MacroChartTemplate[],
  ) => {
    const key = folderDropKey(folder);
    const open = isOpen(key);
    const label = folder?.name ?? "未分类";
    const isDropTarget = dropTargetKey === key;

    const folderShellClass = `rounded border bg-fs-bg/30 ${
      isDropTarget ? "border-cyan-500/60 bg-cyan-950/15" : "border-fs-border/70"
    }`;

    return (
      <div
        key={key}
        className={folderShellClass}
        onDragOver={(e) => handleFolderDragOver(key, e)}
        onDragLeave={(e) => handleFolderDragLeave(key, e)}
        onDrop={(e) => handleFolderDrop(folder, key, e)}
      >
        <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
          <FolderToggle open={open} onToggle={() => toggleFolder(key)} label={label} />
          <span
            className={`min-w-0 truncate text-[11px] font-medium ${
              folder ? "flex-1 text-fs-secondary" : "text-fs-muted"
            }`}
          >
            {label}
          </span>
          <span className="text-[10px] text-fs-secondary">({groupTemplates.length})</span>
          {folder ? (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const name = window.prompt("文件夹名称", folder.name)?.trim();
                  if (!name || name === folder.name) return;
                  onRenameFolder(folder.id, name);
                }}
                className="rounded border border-fs-border px-1 py-0 text-[9px] text-fs-muted hover:border-fs-border hover:text-fs-text disabled:opacity-40"
              >
                重命名
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (
                    window.confirm(`删除文件夹「${folder.name}」？其中的模板将移至未分类。`)
                  ) {
                    onDeleteFolder(folder.id);
                  }
                }}
                className="rounded border border-rose-900/70 px-1 py-0 text-[9px] text-rose-200/90 hover:border-rose-700 disabled:opacity-40"
              >
                删除
              </button>
            </>
          ) : null}
        </div>
        {renderFolderBody(groupTemplates, open, isDropTarget)}
      </div>
    );
  };

  const handleCreateFolder = () => {
    const name = window.prompt("文件夹名称")?.trim();
    if (!name) return;
    onCreateFolder(name);
  };

  if (templates.length === 0 && folders.length === 0) {
    return <p className="mt-2 text-xs text-fs-muted">{emptyText}</p>;
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={handleCreateFolder}
          className="rounded border border-fs-border px-2 py-0.5 text-[10px] text-fs-secondary hover:border-fs-border hover:text-fs-text disabled:opacity-40"
        >
          新建文件夹
        </button>
        <span className="text-[10px] text-fs-secondary">
          {disabled ? "仅可查看文件夹归类" : "拖动模板到文件夹以归类"}
        </span>
      </div>

      {groups.map(({ folder, templates: groupTemplates }) =>
        renderFolderShell(folder, groupTemplates),
      )}
    </div>
  );
}

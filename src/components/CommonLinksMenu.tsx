"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyBookmarkState,
  normalizeBookmarkUrl,
  type BookmarkFolder,
  type BookmarkLink,
  type BookmarkState,
} from "@/lib/data/userBookmarks";

const linkBase =
  "rounded-md px-2.5 py-1 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50";

type Me = { username: string; role: "admin" | "user" } | null;

type FormKind = "link" | "folder" | null;

function uid() {
  return crypto.randomUUID();
}

function sortFolders(folders: BookmarkFolder[]): BookmarkFolder[] {
  return [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function sortLinks(links: BookmarkLink[]): BookmarkLink[] {
  return [...links].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

function linksInFolder(links: BookmarkLink[], folderId: string | null): BookmarkLink[] {
  return sortLinks(links.filter((l) => l.folderId === folderId));
}

export function CommonLinksMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [state, setState] = useState<BookmarkState>(emptyBookmarkState());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formFolderId, setFormFolderId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  const persist = useCallback(async (next: BookmarkState) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/bookmarks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
      const json = (await res.json()) as { state?: BookmarkState; error?: string };
      if (!res.ok) throw new Error(json.error ?? "保存失败");
      if (json.state) setState(json.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/bookmarks", { cache: "no-store" });
      const json = (await res.json()) as { state?: BookmarkState; error?: string };
      if (!res.ok) throw new Error(json.error ?? "加载失败");
      setState(json.state ?? emptyBookmarkState());
      loadedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (open && me && !loadedRef.current) void load();
  }, [open, me, load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setEditMode(false);
    setFormKind(null);
    loadedRef.current = false;
    setState(emptyBookmarkState());
  }, [me?.username]);

  function resetForm() {
    setFormKind(null);
    setEditingLinkId(null);
    setEditingFolderId(null);
    setFormTitle("");
    setFormUrl("");
    setFormFolderId(null);
  }

  function openAddLink(folderId: string | null = null) {
    setEditMode(true);
    setFormKind("link");
    setEditingLinkId(null);
    setEditingFolderId(null);
    setFormTitle("");
    setFormUrl("");
    setFormFolderId(folderId);
  }

  function openEditLink(link: BookmarkLink) {
    setEditMode(true);
    setFormKind("link");
    setEditingLinkId(link.id);
    setEditingFolderId(null);
    setFormTitle(link.title);
    setFormUrl(link.url);
    setFormFolderId(link.folderId);
  }

  function openAddFolder() {
    setEditMode(true);
    setFormKind("folder");
    setEditingLinkId(null);
    setEditingFolderId(null);
    setFormTitle("");
    setFormUrl("");
    setFormFolderId(null);
  }

  function openEditFolder(folder: BookmarkFolder) {
    setEditMode(true);
    setFormKind("folder");
    setEditingFolderId(folder.id);
    setEditingLinkId(null);
    setFormTitle(folder.name);
    setFormUrl("");
    setFormFolderId(null);
  }

  async function submitForm() {
    if (!me) return;
    const title = formTitle.trim();
    if (!title) {
      setError(formKind === "folder" ? "请填写文件夹名称" : "请填写链接标题");
      return;
    }

    let next = { ...state, folders: [...state.folders], links: [...state.links] };

    if (formKind === "folder") {
      if (editingFolderId) {
        next.folders = next.folders.map((f) =>
          f.id === editingFolderId ? { ...f, name: title } : f,
        );
      } else {
        next.folders.push({
          id: uid(),
          name: title,
          sortOrder: next.folders.length,
        });
      }
    } else if (formKind === "link") {
      const url = normalizeBookmarkUrl(formUrl);
      if (!url) {
        setError("请填写有效网址");
        return;
      }
      if (editingLinkId) {
        next.links = next.links.map((l) =>
          l.id === editingLinkId
            ? { ...l, title, url, folderId: formFolderId }
            : l,
        );
      } else {
        next.links.push({
          id: uid(),
          title,
          url,
          folderId: formFolderId,
          sortOrder: next.links.length,
          createdAt: new Date().toISOString(),
        });
      }
    }

    setState(next);
    resetForm();
    await persist(next);
  }

  async function deleteLink(linkId: string) {
    const next = { ...state, links: state.links.filter((l) => l.id !== linkId) };
    setState(next);
    await persist(next);
  }

  async function deleteFolder(folderId: string) {
    const next = {
      ...state,
      folders: state.folders.filter((f) => f.id !== folderId),
      links: state.links.map((l) =>
        l.folderId === folderId ? { ...l, folderId: null } : l,
      ),
    };
    setState(next);
    await persist(next);
  }

  const folders = sortFolders(state.folders);
  const rootLinks = linksInFolder(state.links, null);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${linkBase} text-fs-muted hover:bg-fs-elevated hover:text-fs-text`}
      >
        常用链接
        <span className="ml-0.5 text-[10px] opacity-70" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-fs-border bg-fs-elevated py-1 shadow-lg"
        >
          {!me ? (
            <div className="px-3 py-3 text-sm text-fs-muted">
              <p className="mb-2">登录后可保存个人常用链接，并按文件夹归类。</p>
              <Link
                href="/auth"
                className="text-fs-accent-text hover:text-fs-accent-text"
                onClick={() => setOpen(false)}
              >
                去登录 →
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-fs-border px-3 py-1.5">
                <span className="text-[11px] text-fs-muted">我的收藏夹</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditMode((v) => !v);
                    resetForm();
                  }}
                  className={`rounded px-1.5 py-0.5 text-[11px] transition ${
                    editMode
                      ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30"
                      : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
                  }`}
                >
                  {editMode ? "完成" : "管理"}
                </button>
              </div>

              <div className="max-h-[min(24rem,60vh)] overflow-y-auto px-1 py-1">
                {loading ? (
                  <p className="px-2 py-2 text-sm text-fs-muted">加载中…</p>
                ) : folders.length === 0 && rootLinks.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-fs-muted">暂无链接，点击下方添加。</p>
                ) : (
                  <>
                    {folders.map((folder) => {
                      const folderLinks = linksInFolder(state.links, folder.id);
                      return (
                        <div key={folder.id} className="mb-1">
                          <div className="flex items-center gap-1 px-2 py-0.5">
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-fs-muted">
                              {folder.name}
                            </span>
                            {editMode ? (
                              <span className="flex shrink-0 gap-0.5">
                                <button
                                  type="button"
                                  title="重命名文件夹"
                                  onClick={() => openEditFolder(folder)}
                                  className="rounded px-1 text-[10px] text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
                                >
                                  改
                                </button>
                                <button
                                  type="button"
                                  title="删除文件夹"
                                  onClick={() => deleteFolder(folder.id).catch(() => {})}
                                  className="rounded px-1 text-[10px] text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300"
                                >
                                  删
                                </button>
                                <button
                                  type="button"
                                  title="在此文件夹添加链接"
                                  onClick={() => openAddLink(folder.id)}
                                  className="rounded px-1 text-[10px] text-fs-accent/90 hover:bg-fs-accent-soft hover:text-fs-accent-text"
                                >
                                  +
                                </button>
                              </span>
                            ) : null}
                          </div>
                          {folderLinks.length === 0 ? (
                            <p className="px-3 py-0.5 text-[11px] text-fs-secondary">（空）</p>
                          ) : (
                            folderLinks.map((link) => (
                              <BookmarkRow
                                key={link.id}
                                link={link}
                                editMode={editMode}
                                onEdit={() => openEditLink(link)}
                                onDelete={() => deleteLink(link.id).catch(() => {})}
                                onNavigate={() => setOpen(false)}
                              />
                            ))
                          )}
                        </div>
                      );
                    })}
                    {rootLinks.length > 0 ? (
                      <div className="mb-1">
                        {folders.length > 0 ? (
                          <div className="px-2 py-0.5 text-[11px] font-medium text-fs-muted">
                            未分类
                          </div>
                        ) : null}
                        {rootLinks.map((link) => (
                          <BookmarkRow
                            key={link.id}
                            link={link}
                            editMode={editMode}
                            onEdit={() => openEditLink(link)}
                            onDelete={() => deleteLink(link.id).catch(() => {})}
                            onNavigate={() => setOpen(false)}
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {formKind ? (
                <div className="border-t border-fs-border px-3 py-2">
                  <div className="mb-1.5 text-[11px] font-medium text-fs-muted">
                    {formKind === "folder"
                      ? editingFolderId
                        ? "重命名文件夹"
                        : "新建文件夹"
                      : editingLinkId
                        ? "编辑链接"
                        : "新建链接"}
                  </div>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={formKind === "folder" ? "文件夹名称" : "链接标题"}
                    className="mb-1.5 w-full rounded border border-fs-border bg-fs-bg px-2 py-1 text-sm text-fs-text placeholder:text-fs-secondary"
                  />
                  {formKind === "link" ? (
                    <>
                      <input
                        type="text"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="https:// 或 /macro"
                        className="mb-1.5 w-full rounded border border-fs-border bg-fs-bg px-2 py-1 text-sm text-fs-text placeholder:text-fs-secondary"
                      />
                      <select
                        value={formFolderId ?? ""}
                        onChange={(e) =>
                          setFormFolderId(e.target.value ? e.target.value : null)
                        }
                        className="mb-1.5 w-full rounded border border-fs-border bg-fs-bg px-2 py-1 text-sm text-fs-text"
                      >
                        <option value="">未分类</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => submitForm().catch(() => {})}
                      disabled={saving}
                      className="rounded bg-fs-accent px-2 py-0.5 text-xs text-white hover:bg-fs-accent disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded border border-fs-border px-2 py-0.5 text-xs text-fs-muted hover:text-fs-text"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1 border-t border-fs-border px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => openAddLink(null)}
                    className="rounded px-2 py-0.5 text-[11px] text-fs-secondary hover:bg-fs-elevated"
                  >
                    + 链接
                  </button>
                  <button
                    type="button"
                    onClick={openAddFolder}
                    className="rounded px-2 py-0.5 text-[11px] text-fs-secondary hover:bg-fs-elevated"
                  >
                    + 文件夹
                  </button>
                </div>
              )}

              {error ? (
                <p className="border-t border-fs-border px-3 py-1.5 text-[11px] text-rose-400">
                  {error}
                </p>
              ) : saving ? (
                <p className="border-t border-fs-border px-3 py-1 text-[11px] text-fs-secondary">
                  保存中…
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function BookmarkRow({
  link,
  editMode,
  onEdit,
  onDelete,
  onNavigate,
}: {
  link: BookmarkLink;
  editMode: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}) {
  const external = /^https?:\/\//i.test(link.url);
  const className =
    "flex min-w-0 flex-1 items-center rounded px-2 py-1 text-sm text-fs-text transition hover:bg-fs-elevated hover:text-fs-text";

  return (
    <div className="flex items-center gap-0.5 pr-1">
      {editMode ? (
        <span className={`${className} cursor-default hover:bg-transparent hover:text-fs-text`}>
          <span className="truncate">{link.title}</span>
        </span>
      ) : external ? (
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          className={className}
          title={link.url}
          onClick={onNavigate}
        >
          <span className="truncate">{link.title}</span>
        </a>
      ) : (
        <Link
          href={link.url}
          role="menuitem"
          className={className}
          title={link.url}
          onClick={onNavigate}
        >
          <span className="truncate">{link.title}</span>
        </Link>
      )}
      {editMode ? (
        <span className="flex shrink-0 gap-0.5">
          <button
            type="button"
            title="编辑"
            onClick={onEdit}
            className="rounded px-1 text-[10px] text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
          >
            改
          </button>
          <button
            type="button"
            title="删除"
            onClick={onDelete}
            className="rounded px-1 text-[10px] text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300"
          >
            删
          </button>
        </span>
      ) : null}
    </div>
  );
}

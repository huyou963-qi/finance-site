import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BookmarkFolder = {
  id: string;
  name: string;
  sortOrder: number;
};

export type BookmarkLink = {
  id: string;
  folderId: string | null;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
};

export type BookmarkState = {
  version: 1;
  folders: BookmarkFolder[];
  links: BookmarkLink[];
};

export function emptyBookmarkState(): BookmarkState {
  return { version: 1, folders: [], links: [] };
}

function sanitizeFolder(item: unknown, index: number): BookmarkFolder | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const name = String(o.name ?? "").trim();
  if (!id || !name) return null;
  const sortOrder = Number.isFinite(o.sortOrder) ? Number(o.sortOrder) : index;
  return { id, name, sortOrder };
}

function sanitizeLink(item: unknown, index: number): BookmarkLink | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const title = String(o.title ?? "").trim();
  const url = String(o.url ?? "").trim();
  if (!id || !title || !url) return null;
  const folderIdRaw = o.folderId;
  const folderId =
    folderIdRaw === null || folderIdRaw === undefined || folderIdRaw === ""
      ? null
      : String(folderIdRaw).trim() || null;
  const sortOrder = Number.isFinite(o.sortOrder) ? Number(o.sortOrder) : index;
  const createdAt = String(o.createdAt ?? new Date().toISOString());
  return { id, folderId, title, url, sortOrder, createdAt };
}

export function sanitizeBookmarkState(input: unknown): BookmarkState | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (o.version !== 1) return null;

  const folders = Array.isArray(o.folders)
    ? o.folders
        .map((item, i) => sanitizeFolder(item, i))
        .filter((f): f is BookmarkFolder => f !== null)
    : [];
  const links = Array.isArray(o.links)
    ? o.links
        .map((item, i) => sanitizeLink(item, i))
        .filter((l): l is BookmarkLink => l !== null)
    : [];

  const folderIds = new Set(folders.map((f) => f.id));
  const normalizedLinks = links.map((link) => ({
    ...link,
    folderId: link.folderId && folderIds.has(link.folderId) ? link.folderId : null,
  }));

  folders.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  normalizedLinks.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  );

  return { version: 1, folders, links: normalizedLinks };
}

export function normalizeBookmarkUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return `https://${trimmed}`;
}

export async function loadBookmarkStateForUser(userId: string): Promise<BookmarkState> {
  const row = await prisma.userBookmarkState.findUnique({
    where: { userId },
  });
  if (!row) return emptyBookmarkState();
  return sanitizeBookmarkState(row.state as unknown) ?? emptyBookmarkState();
}

export async function saveBookmarkStateForUser(
  userId: string,
  input: unknown,
): Promise<BookmarkState> {
  const state = sanitizeBookmarkState(input);
  if (!state) throw new Error("收藏夹数据格式不合法");
  const json = state as unknown as Prisma.InputJsonValue;
  await prisma.userBookmarkState.upsert({
    where: { userId },
    create: { userId, state: json },
    update: { state: json },
  });
  return state;
}

import { normalizeEventColor } from "@/lib/data/eventPresentation";
import { milestoneToStoredEvent, parseMilestoneIngestJson, type CompanyMilestone, type LocalEventImportTarget } from "./companyMilestones";

export type LocalEventPack = {
  id: string; name: string; target: LocalEventImportTarget | "assets"; symbols?: string[];
  enabled: boolean; color?: string; version?: string; importedAt: string;
  events: Record<string, unknown>[];
};
export type EventPackMetadata = { id?: string; name?: string; fallbackName?: string; version?: string; color?: string; symbols?: string[] };
export type EventImportReceipt = {
  packId: string; packName: string; externalIds: string[]; importedAt: string;
  added: number; updated: number; unchanged: number; retained: number; otherPackIds: number;
};

export function localPackEventId(packId: string, externalId: string): string {
  return `local-pack:${encodeURIComponent(packId)}:${encodeURIComponent(externalId)}`;
}
export function packAppliesToSymbol(pack: LocalEventPack, symbol: string): boolean {
  return pack.target === "all-assets" || Boolean(pack.symbols?.includes(symbol.trim().toUpperCase()));
}
export function decodeLocalEventPack(pack: LocalEventPack): CompanyMilestone[] {
  return parseMilestoneIngestJson({ events: pack.events }).milestones.map(m => ({ ...m,
    id: localPackEventId(pack.id, m.externalId),
    record: { ...m.record, packId: pack.id, packName: pack.name, packColor: pack.color },
    color: normalizeEventColor(m.record?.color) || normalizeEventColor(pack.color) || m.color,
  }));
}
export function selectLocalPackEvents(packs: LocalEventPack[], symbol: string) {
  const applicable = packs.filter(p => p.enabled && packAppliesToSymbol(p, symbol));
  const events = applicable.flatMap(decodeLocalEventPack).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  return { events, allAssetEvents: applicable.filter(p => p.target === "all-assets").flatMap(decodeLocalEventPack) };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))) : item);
}
function normalizedRecord(record: Record<string, unknown>) {
  const parsed = parseMilestoneIngestJson({ events: [record] });
  return parsed.milestones.length ? milestoneToStoredEvent(parsed.milestones[0]) : record;
}

/** Preview and commit share the same package-scoped, additive import transaction. */
export function prepareEventPackImport(previous: LocalEventPack[], items: CompanyMilestone[], target: LocalEventImportTarget, symbol: string, metadata: EventPackMetadata = {}, now = new Date().toISOString()) {
  const symbols = [...new Set((metadata.symbols?.length ? metadata.symbols : target === "symbol" ? [symbol] : []).map(s => s.trim().toUpperCase()).filter(Boolean))];
  if (target === "symbol" && !symbols.length) throw new Error("请先选择标的或在文件中指定显示范围");
  if (!items.length) throw new Error("事件包中没有可导入的有效事件");
  const id = metadata.id?.trim() || `${target}:${metadata.name || "imported"}:${target === "symbol" ? symbols.join(",") : "*"}`;
  const existing = previous.find(p => p.id === id);
  const records = new Map((existing?.events ?? []).map(e => [String(e.externalId ?? e.id), e]));
  const incomingIds = new Set<string>();
  const receipt: EventImportReceipt = { packId: id, packName: metadata.name || existing?.name || metadata.fallbackName || "导入事件", externalIds: [], importedAt: now, added: 0, updated: 0, unchanged: 0, retained: 0, otherPackIds: 0 };
  const changes: { externalId: string; title: string; kind: "added" | "updated" | "unchanged" }[] = [];
  for (const item of items) {
    if (incomingIds.has(item.externalId)) throw new Error(`同一文件中 externalId 重复：${item.externalId}`);
    incomingIds.add(item.externalId);
    const record = milestoneToStoredEvent(item), old = records.get(item.externalId);
    const kind = !old ? "added" : canonical(normalizedRecord(old)) === canonical(record) ? "unchanged" : "updated";
    receipt[kind]++; changes.push({ externalId: item.externalId, title: item.title, kind });
    if (kind !== "unchanged") records.set(item.externalId, record);
  }
  receipt.externalIds = [...incomingIds];
  receipt.retained = (existing?.events ?? []).filter(e => !incomingIds.has(String(e.externalId ?? e.id))).length;
  const otherIds = new Set(previous.filter(p => p.id !== id).flatMap(p => p.events.map(e => String(e.externalId ?? e.id))));
  receipt.otherPackIds = receipt.externalIds.filter(id => otherIds.has(id)).length;
  const pack: LocalEventPack = {
    id, name: receipt.packName, target: metadata.symbols?.length ? "assets" : target,
    symbols, enabled: existing?.enabled ?? true,
    color: normalizeEventColor(metadata.color) || existing?.color,
    version: metadata.version ?? existing?.version, importedAt: now, events: [...records.values()],
  };
  return { pack, receipt, changes, packs: [...previous.filter(p => p.id !== id), pack] };
}

export function resolveEventPackFileMetadata(raw: Record<string, unknown>, fileName: string, parsedTarget: LocalEventImportTarget, fileSymbol: string | null, mode: "file" | LocalEventImportTarget) {
  if (raw.pack !== undefined && (!raw.pack || typeof raw.pack !== "object" || Array.isArray(raw.pack))) throw new Error("pack 必须是对象");
  const pack = (raw.pack ?? {}) as Record<string, unknown>;
  const query = (raw.query && typeof raw.query === "object" ? raw.query : {}) as Record<string, unknown>;
  for (const key of ["id", "name", "version"]) if (pack[key] !== undefined && (typeof pack[key] !== "string" || !pack[key].trim())) throw new Error(`pack.${key} 必须是非空字符串`);
  if (pack.symbols !== undefined && (!Array.isArray(pack.symbols) || pack.symbols.some(s => typeof s !== "string" || !s.trim()))) throw new Error("pack.symbols 必须是非空资产代码组成的数组");
  if (pack.color !== undefined && !normalizeEventColor(pack.color)) throw new Error("pack.color 必须是 #RRGGBB 颜色");
  const fileSymbols = Array.isArray(pack.symbols) ? pack.symbols as string[] : [];
  const target = mode === "file" ? fileSymbols.length ? "symbol" : parsedTarget : mode;
  const metadata: EventPackMetadata = {
    id: typeof pack.id === "string" ? pack.id.trim() : fileName,
    name: typeof pack.name === "string" ? pack.name : typeof query.topic === "string" ? query.topic : undefined,
    fallbackName: fileName,
    version: typeof pack.version === "string" ? pack.version : undefined,
    color: normalizeEventColor(pack.color),
    symbols: mode === "file" ? fileSymbols.length ? fileSymbols : target === "symbol" && fileSymbol ? [fileSymbol] : undefined : undefined,
  };
  return { target, metadata };
}

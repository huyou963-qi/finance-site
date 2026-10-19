/** Shared event presentation contract. Persisted in MarketEvent.payload; no parallel fact store. */
export type EventLink = { url: string; title?: string; note?: string; language?: string };
export type EventPresentation = { color?: string | null; sources?: EventLink[]; readingLinks?: EventLink[] };

export function isValidEventTime(value: unknown, precision: string = "DATE"): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) return false;
  const day = value.slice(0, 10), ms = Date.parse(day);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) return false;
  return precision === "DATE" || (precision === "DATETIME" && value.includes("T") && /(Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)));
}

export function eventRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeEventColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined;
}

export function safeEventUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.toString() : undefined; } catch { return undefined; }
}

export function eventLinks(value: unknown): EventLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    const row = eventRecord(item), url = safeEventUrl(row.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{ url, title: typeof row.title === "string" ? row.title : undefined,
      note: typeof row.note === "string" ? row.note : undefined,
      language: typeof row.language === "string" ? row.language : undefined }];
  });
}

export function readEventPresentation(payload: unknown): EventPresentation {
  const p = eventRecord(payload);
  return { color: normalizeEventColor(p.color), sources: eventLinks(p.sources), readingLinks: eventLinks(p.readingLinks) };
}

export function withEventPresentation(payload: unknown, fields: EventPresentation): Record<string, unknown> {
  const p = { ...eventRecord(payload) };
  if (fields.color !== undefined) {
    if (fields.color !== null && !normalizeEventColor(fields.color)) throw new Error("color 须为 #RRGGBB");
    if (fields.color === null) delete p.color; else p.color = normalizeEventColor(fields.color);
  }
  for (const key of ["sources", "readingLinks"] as const) {
    if (fields[key] !== undefined) {
      if (fields[key]!.some(link => !safeEventUrl(link.url))) throw new Error(`${key} 仅支持 HTTP(S) 链接`);
      p[key] = eventLinks(fields[key]);
    }
  }
  return p;
}

import { GUIDANCE_PARSER_VERSION } from "./managementGuidance";
export function earningsItem(items: string | null): boolean {
  return Boolean(items?.split(",").some(item => item.trim() === "2.02"));
}
export function guidanceBackfillReady(release: unknown): boolean {
  if (!release || typeof release !== "object") return false;
  const r = release as { attachments?: { text?: string }[]; managementGuidance?: { parserVersion?: number; records?: unknown[]; sourceStatus?: string } };
  return r.managementGuidance?.parserVersion === GUIDANCE_PARSER_VERSION && Array.isArray(r.managementGuidance.records)
    && ["available", "no_eligible_attachment"].includes(r.managementGuidance.sourceStatus ?? "")
    && !(r.attachments ?? []).some(a => a.text?.length === 20_000);
}
export function guidanceHistoryStart(explicit: string | undefined, oldest: Date | null): string {
  if (explicit) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit) || !Number.isFinite(Date.parse(explicit)) || new Date(explicit).toISOString().slice(0, 10) !== explicit) throw new Error("--from 必须为 YYYY-MM-DD");
    return explicit;
  }
  return oldest?.toISOString().slice(0, 10) ?? "2005-01-01";
}

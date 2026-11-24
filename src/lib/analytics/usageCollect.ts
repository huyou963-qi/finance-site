import { USAGE_EVENT_KINDS, MAX_USAGE_ACTIVE_MS, MAX_USAGE_EVENTS_PER_REQUEST, MAX_USAGE_GUEST_ID_LEN, MAX_USAGE_SESSION_ID_LEN, type UsageEventKind } from "@/lib/analytics/usageTypes";
import { normalizeUsagePath, usageFeatureIdForPath } from "@/lib/analytics/usagePath";

export type IncomingUsageEvent = {
  kind: UsageEventKind;
  sessionId: string;
  guestId: string | null;
  path: string;
  featureId: string | null;
  activeMs: number;
};

function isKind(v: unknown): v is UsageEventKind {
  return typeof v === "string" && (USAGE_EVENT_KINDS as readonly string[]).includes(v);
}

function clipId(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > max) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return null;
  return t;
}

/**
 * 校验客户端埋点 payload；非法整包拒绝。
 * 返回已规范化、可入库的事件列表（可能为空数组）。
 */
export function parseUsageCollectBody(body: unknown): IncomingUsageEvent[] {
  if (!body || typeof body !== "object") throw new Error("请求体无效");
  const eventsRaw = (body as { events?: unknown }).events;
  if (!Array.isArray(eventsRaw)) throw new Error("events 须为数组");
  if (eventsRaw.length === 0) return [];
  if (eventsRaw.length > MAX_USAGE_EVENTS_PER_REQUEST) {
    throw new Error(`单次最多 ${MAX_USAGE_EVENTS_PER_REQUEST} 条事件`);
  }

  const out: IncomingUsageEvent[] = [];
  for (let i = 0; i < eventsRaw.length; i++) {
    const item = eventsRaw[i];
    if (!item || typeof item !== "object") throw new Error(`events[${i}] 不合法`);
    const o = item as Record<string, unknown>;
    if (!isKind(o.kind)) throw new Error(`events[${i}].kind 无效`);
    const sessionId = clipId(o.sessionId, MAX_USAGE_SESSION_ID_LEN);
    if (!sessionId) throw new Error(`events[${i}].sessionId 无效`);

    let guestId: string | null = null;
    if (o.guestId != null && o.guestId !== "") {
      guestId = clipId(o.guestId, MAX_USAGE_GUEST_ID_LEN);
      if (!guestId) throw new Error(`events[${i}].guestId 无效`);
    }

    const path = normalizeUsagePath(typeof o.path === "string" ? o.path : "");
    if (!path) continue; // 静默跳过 /admin 等不可统计路径

    let activeMs = 0;
    if (o.activeMs != null) {
      if (typeof o.activeMs !== "number" || !Number.isFinite(o.activeMs) || o.activeMs < 0) {
        throw new Error(`events[${i}].activeMs 无效`);
      }
      activeMs = Math.min(Math.floor(o.activeMs), MAX_USAGE_ACTIVE_MS);
    }
    if (o.kind === "page_view") activeMs = 0;

    out.push({
      kind: o.kind,
      sessionId,
      guestId,
      path,
      featureId: usageFeatureIdForPath(path),
      activeMs,
    });
  }
  return out;
}

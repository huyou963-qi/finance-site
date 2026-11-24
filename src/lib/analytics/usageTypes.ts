/** 产品使用埋点：事件类型与受众口径（纯类型 / 常量，无 DB）。 */

export const USAGE_EVENT_KINDS = ["page_view", "heartbeat", "session_end"] as const;
export type UsageEventKind = (typeof USAGE_EVENT_KINDS)[number];

export const USAGE_AUDIENCES = ["guest", "standard", "pro", "admin"] as const;
export type UsageAudience = (typeof USAGE_AUDIENCES)[number];

/** 管理端产品指标默认排除的受众 */
export const PRODUCT_USAGE_AUDIENCES = ["guest", "standard", "pro"] as const satisfies readonly UsageAudience[];

export const USAGE_EVENT_RETENTION_DAYS = 30;
export const USAGE_HEARTBEAT_MS = 30_000;
export const GUEST_ANALYTICS_COOKIE = "guest_analytics_id";
export const USAGE_SESSION_STORAGE_KEY = "finance_usage_session_id";

export const MAX_USAGE_PATH_LEN = 512;
export const MAX_USAGE_SESSION_ID_LEN = 64;
export const MAX_USAGE_GUEST_ID_LEN = 64;
export const MAX_USAGE_EVENTS_PER_REQUEST = 40;
export const MAX_USAGE_ACTIVE_MS = 5 * 60_000;

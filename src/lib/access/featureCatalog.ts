/**
 * 功能页权限目录（纯函数，无 DB / 无 React）。
 *
 * 四类用户：游客（未登录）、普通用户（已注册，无 Pro 权益）、Pro 用户（付费未过期或
 * 7 天试用期内）、管理员。管理员永远拥有最高权限，不受任何配置影响。
 *
 * 每个功能页处于两种状态之一，由管理员在 `/admin/feature-access` 配置：
 *
 * - 开发中（development）：按「游客 / 普通用户 / Pro 用户」三列分别控制是否可见（预览）。
 *   不可见的身份在导航里看不到入口，直达 URL 显示「开发中」占位页。
 * - 已上线（released）：对所有人可见（导航里都有入口），只配置「是否 Pro 专属」。
 *   Pro 专属时：Pro/试用用户正常使用；游客被引导注册（注册即送 7 天 Pro 试用）；
 *   普通用户（试用已过或从未试用）被引导升级 Pro。
 *
 * 策略落 `public.feature_access_policy` 单例。本策略只管「页面入口」；页面内部更细的
 * Pro 内容门禁（周报全文、策略保存、回测积分）仍由各自 API 的 `requireProUser` 决定。
 */

export type FeatureStatus = "development" | "released";

/** 开发中预览可配置的三类身份（管理员不在其中：永远可见） */
export type FeatureAudience = "visitor" | "standard" | "pro";

export type FeaturePreview = Record<FeatureAudience, boolean>;

export type FeatureRule = {
  status: FeatureStatus;
  /** 开发中：各身份是否可见。已上线时不生效，但保留以便切回开发中时不丢配置 */
  preview: FeaturePreview;
  /** 已上线：是否 Pro 专属。开发中时不生效，但保留以便切回已上线时不丢配置 */
  proOnly: boolean;
};

export type FeatureDefinition = {
  id: string;
  label: string;
  /** 管理页分组标题 */
  group: string;
  /** 覆盖的路由：精确路径或前缀（`/x` 命中 `/x` 与 `/x/...`） */
  paths: readonly string[];
  description: string;
  /** 锁定为管理员专属：永远是「开发中、对任何非管理员不可见」，管理页不可编辑 */
  adminOnly?: boolean;
  defaults: FeatureRule;
};

const NO_PREVIEW: FeaturePreview = { visitor: false, standard: false, pro: false };

const RELEASED: FeatureRule = { status: "released", proOnly: false, preview: NO_PREVIEW };
const RELEASED_PRO: FeatureRule = { status: "released", proOnly: true, preview: NO_PREVIEW };
const IN_DEVELOPMENT: FeatureRule = { status: "development", proOnly: false, preview: NO_PREVIEW };

export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  {
    id: "macro",
    label: "宏观数据",
    group: "宏观",
    paths: ["/macro"],
    description: "宏观图表工作台与指标目录",
    defaults: RELEASED,
  },
  {
    id: "macro-framework",
    label: "宏观框架",
    group: "宏观",
    paths: ["/macro/framework"],
    description: "宏观分析框架编辑（管理员专属，不可开放）",
    adminOnly: true,
    defaults: IN_DEVELOPMENT,
  },
  {
    id: "equity-sectors",
    label: "美股行业",
    group: "美股",
    paths: ["/equity/sectors"],
    description: "GICS 行业收益、财报与经营叙事",
    defaults: RELEASED,
  },
  {
    id: "equity-ownership",
    label: "持股监控",
    group: "美股",
    paths: ["/equity/ownership"],
    description: "Form 4 内部人交易与持股证据",
    defaults: RELEASED,
  },
  {
    id: "markets",
    label: "行情",
    group: "美股",
    paths: ["/markets", "/equity/stocks"],
    description: "K 线行情与个股下钻",
    defaults: RELEASED,
  },
  {
    id: "investments",
    label: "投资记录",
    group: "美股",
    paths: ["/investments"],
    description: "投资案例与交易记录",
    defaults: RELEASED,
  },
  {
    id: "quant-regime",
    label: "量化 · 宏观 Regime",
    group: "量化",
    paths: ["/quant/regime", "/equity/regime"],
    description: "增长/通胀四象限与方向判定",
    defaults: RELEASED,
  },
  {
    id: "quant-screener",
    label: "量化 · 选股器",
    group: "量化",
    paths: ["/quant/screener", "/equity/screener"],
    description: "因子选股（保存策略仍需 Pro）",
    defaults: RELEASED,
  },
  {
    id: "quant-backtest",
    label: "量化 · 回测",
    group: "量化",
    paths: ["/quant/backtest", "/equity/backtest"],
    description: "策略回测报告（非 Pro 运行消耗积分）",
    defaults: RELEASED,
  },
  {
    id: "quant-factor-research",
    label: "量化 · 因子研究",
    group: "量化",
    paths: ["/quant/factor-research", "/equity/factor-research"],
    description: "IC/IR、分层收益与因子相关性",
    defaults: RELEASED_PRO,
  },
  {
    id: "quant-robustness",
    label: "量化 · 过拟合检验",
    group: "量化",
    paths: ["/quant/robustness", "/equity/robustness"],
    description: "DSR/PSR 与多重检验校正",
    defaults: RELEASED_PRO,
  },
  {
    id: "events",
    label: "时间线",
    group: "内容",
    paths: ["/events"],
    description: "历史经济时代与市场事件时间线",
    defaults: RELEASED,
  },
  {
    id: "weekly",
    label: "AI周度观察",
    group: "内容",
    paths: ["/weekly"],
    description: "周度跨资产观察（全文仍需 Pro）",
    defaults: RELEASED,
  },
  {
    id: "articles",
    label: "专题文章",
    group: "内容",
    paths: ["/articles"],
    description: "专题文章列表与详情",
    defaults: RELEASED,
  },
  {
    id: "tools-kline-range",
    label: "工具 · K线区间统计",
    group: "工具",
    paths: ["/markets-tools"],
    description: "区间涨跌幅与统计",
    defaults: IN_DEVELOPMENT,
  },
  {
    id: "tools-statistical-analysis",
    label: "工具 · 统计分析",
    group: "工具",
    paths: ["/tools/statistical-analysis"],
    description: "序列统计分析工具",
    defaults: IN_DEVELOPMENT,
  },
  {
    id: "tools-futures-positions",
    label: "工具 · 期货持仓报告",
    group: "工具",
    paths: ["/tools/futures-positions"],
    description: "CFTC 持仓报告工具",
    defaults: IN_DEVELOPMENT,
  },
] as const;

export const FEATURE_GROUP_ORDER: readonly string[] = ["宏观", "美股", "量化", "内容", "工具"];

export const FEATURE_AUDIENCE_LABELS: Record<FeatureAudience, string> = {
  visitor: "游客",
  standard: "普通用户",
  pro: "Pro 用户",
};

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  development: "开发中",
  released: "已上线",
};

export type FeatureAccessPolicy = {
  version: 2;
  features: Record<string, FeatureRule>;
};

export type FeatureViewer = {
  /** null = 未登录游客 */
  role: "admin" | "user" | null;
  /** Pro 权益：付费未过期或 7 天试用期内（管理员恒为 true） */
  hasProAccess: boolean;
  /** 是否用过试用（试用已结束）。仅用于锁定页文案区分「试用已结束」与「升级 Pro」 */
  trialEnded?: boolean;
};

/**
 * 访问判定：
 * - allowed：可以正常使用
 * - hidden：开发中且对该身份不可见（导航无入口，直达显示「开发中」）
 * - needs-register：已上线的 Pro 专属功能，游客 → 引导注册（送 7 天试用）
 * - needs-upgrade：已上线的 Pro 专属功能，普通用户 → 引导升级 Pro
 */
export type FeatureAccessState = "allowed" | "hidden" | "needs-register" | "needs-upgrade";

const byId = new Map(FEATURE_CATALOG.map((f) => [f.id, f]));

export function getFeatureDefinition(featureId: string): FeatureDefinition | null {
  return byId.get(featureId) ?? null;
}

function cloneRule(rule: FeatureRule): FeatureRule {
  return { status: rule.status, proOnly: rule.proOnly, preview: { ...rule.preview } };
}

export function defaultFeatureAccessPolicy(): FeatureAccessPolicy {
  const features: Record<string, FeatureRule> = {};
  for (const f of FEATURE_CATALOG) features[f.id] = cloneRule(f.defaults);
  return { version: 2, features };
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * v1 旧格式 `{ standard, pro }`（两列可见性）→ v2：
 * 普通可见 = 已上线非 Pro；仅 Pro 可见 = 已上线 Pro 专属；都不可见 = 开发中无人可见。
 */
function fromLegacy(obj: Record<string, unknown>, def: FeatureDefinition): FeatureRule | null {
  if (typeof obj.standard !== "boolean" && typeof obj.pro !== "boolean") return null;
  const standard = obj.standard === true;
  const pro = obj.pro === true || standard;
  if (standard) return { ...cloneRule(def.defaults), status: "released", proOnly: false };
  if (pro) return { ...cloneRule(def.defaults), status: "released", proOnly: true };
  return { ...cloneRule(def.defaults), status: "development", preview: { ...NO_PREVIEW } };
}

function coerceRule(raw: unknown, def: FeatureDefinition): FeatureRule {
  if (def.adminOnly) return cloneRule(IN_DEVELOPMENT);
  if (!raw || typeof raw !== "object") return cloneRule(def.defaults);
  const obj = raw as Record<string, unknown>;
  if (!("status" in obj)) return fromLegacy(obj, def) ?? cloneRule(def.defaults);
  const status: FeatureStatus =
    obj.status === "development" || obj.status === "released" ? obj.status : def.defaults.status;
  const p = (obj.preview && typeof obj.preview === "object" ? obj.preview : {}) as Record<
    string,
    unknown
  >;
  return {
    status,
    proOnly: bool(obj.proOnly, def.defaults.proOnly),
    preview: {
      visitor: bool(p.visitor, def.defaults.preview.visitor),
      standard: bool(p.standard, def.defaults.preview.standard),
      pro: bool(p.pro, def.defaults.preview.pro),
    },
  };
}

/**
 * 把任意存储/入参归一化成完整策略：补齐目录里的每一项、丢弃已下线的 id、
 * 兼容 v1 旧格式、强制管理员专属项。非法输入退化为默认值而不是抛错，
 * 保证策略表损坏时站点仍按默认规则工作。
 */
export function normalizeFeatureAccessPolicy(raw: unknown): FeatureAccessPolicy {
  const input =
    raw && typeof raw === "object"
      ? ((raw as { features?: unknown }).features as Record<string, unknown> | undefined)
      : undefined;
  const map = input && typeof input === "object" ? input : undefined;
  const features: Record<string, FeatureRule> = {};
  for (const def of FEATURE_CATALOG) {
    features[def.id] = coerceRule(map?.[def.id], def);
  }
  return { version: 2, features };
}

export function featureRuleFor(policy: FeatureAccessPolicy, featureId: string): FeatureRule | null {
  const def = byId.get(featureId);
  if (!def) return null;
  return policy.features[featureId] ?? cloneRule(def.defaults);
}

export function viewerAudience(viewer: FeatureViewer): FeatureAudience | "admin" {
  if (viewer.role === "admin") return "admin";
  if (viewer.role === null) return "visitor";
  return viewer.hasProAccess ? "pro" : "standard";
}

export function resolveFeatureAccess(
  policy: FeatureAccessPolicy,
  featureId: string,
  viewer: FeatureViewer,
): FeatureAccessState {
  const rule = featureRuleFor(policy, featureId);
  if (!rule) return "allowed"; // 未登记的页面不受管控
  const audience = viewerAudience(viewer);
  if (audience === "admin") return "allowed";
  if (rule.status === "development") return rule.preview[audience] ? "allowed" : "hidden";
  if (!rule.proOnly || audience === "pro") return "allowed";
  return audience === "visitor" ? "needs-register" : "needs-upgrade";
}

/** 导航是否展示入口：开发中不可见的隐藏；已上线的 Pro 专属仍展示（点进去是升级引导）。 */
export function isFeatureListedFor(
  policy: FeatureAccessPolicy,
  featureId: string,
  viewer: FeatureViewer,
): boolean {
  return resolveFeatureAccess(policy, featureId, viewer) !== "hidden";
}

export type ViewerFeatureMap = {
  /** 导航里应展示的功能 id */
  listed: string[];
  /** 展示但当前身份需要 Pro（导航上加 Pro 标记） */
  locked: string[];
};

export function viewerFeatureMap(
  policy: FeatureAccessPolicy,
  viewer: FeatureViewer,
): ViewerFeatureMap {
  const listed: string[] = [];
  const locked: string[] = [];
  for (const f of FEATURE_CATALOG) {
    const state = resolveFeatureAccess(policy, f.id, viewer);
    if (state === "hidden") continue;
    listed.push(f.id);
    if (state !== "allowed") locked.push(f.id);
  }
  return { listed, locked };
}

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** 路由 → feature id；取最长匹配前缀（`/macro/framework` 不会落到 `/macro`）。 */
export function featureIdForPath(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const f of FEATURE_CATALOG) {
    for (const p of f.paths) {
      if (pathMatches(pathname, p) && (!best || p.length > best.len)) {
        best = { id: f.id, len: p.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * 功能页可见性目录（纯函数，无 DB / 无 React）。
 *
 * 一条 feature = 导航上的一个功能入口 + 它覆盖的路由前缀。管理员在
 * `/admin/feature-access` 上按「普通用户 / Pro 用户」两列开关，结果存成
 * `FeatureAccessPolicy` 落 `public.feature_access_policy` 单例。
 *
 * 语义约定：
 * - 管理员始终可见全部功能，不受策略影响。
 * - 未登录访客按「普通用户」列判定（不额外配置一列，避免出现「访客能看、注册用户看不到」）。
 * - 单调约束：普通用户可见 ⇒ Pro 用户必然可见（保存时强制修正）。
 * - 本策略只管「页面入口是否可见/可进」；页面内部更细的 Pro 内容门禁（如周报全文、
 *   回测积分）仍由各自 API 的 `requirePro` / `userCanAccessProFeatures` 决定。
 */

export type FeatureAudience = "standard" | "pro";

export type FeatureVisibility = { standard: boolean; pro: boolean };

export type FeatureDefinition = {
  id: string;
  label: string;
  /** 管理页分组标题 */
  group: string;
  /** 覆盖的路由：精确路径或前缀（`/x` 命中 `/x` 与 `/x/...`） */
  paths: readonly string[];
  description: string;
  /** 锁定项不可在管理页修改（始终管理员专属） */
  adminOnly?: boolean;
  defaults: FeatureVisibility;
};

const ALL: FeatureVisibility = { standard: true, pro: true };
const PRO_ONLY: FeatureVisibility = { standard: false, pro: true };
const ADMIN_ONLY: FeatureVisibility = { standard: false, pro: false };

export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  {
    id: "macro",
    label: "宏观数据",
    group: "宏观",
    paths: ["/macro"],
    description: "宏观图表工作台与指标目录",
    defaults: ALL,
  },
  {
    id: "macro-framework",
    label: "宏观框架",
    group: "宏观",
    paths: ["/macro/framework"],
    description: "宏观分析框架编辑（管理员专属，不可开放）",
    adminOnly: true,
    defaults: ADMIN_ONLY,
  },
  {
    id: "equity-sectors",
    label: "美股行业",
    group: "美股",
    paths: ["/equity/sectors"],
    description: "GICS 行业收益、财报与经营叙事",
    defaults: ALL,
  },
  {
    id: "equity-ownership",
    label: "持股监控",
    group: "美股",
    paths: ["/equity/ownership"],
    description: "Form 4 内部人交易与持股证据",
    defaults: ALL,
  },
  {
    id: "markets",
    label: "行情",
    group: "美股",
    paths: ["/markets", "/equity/stocks"],
    description: "K 线行情与个股下钻",
    defaults: ALL,
  },
  {
    id: "investments",
    label: "投资记录",
    group: "美股",
    paths: ["/investments"],
    description: "投资案例与交易记录",
    defaults: ALL,
  },
  {
    id: "quant-regime",
    label: "量化 · 宏观 Regime",
    group: "量化",
    paths: ["/quant/regime", "/equity/regime"],
    description: "增长/通胀四象限与方向判定",
    defaults: ALL,
  },
  {
    id: "quant-screener",
    label: "量化 · 选股器",
    group: "量化",
    paths: ["/quant/screener", "/equity/screener"],
    description: "因子选股（保存策略仍需 Pro）",
    defaults: ALL,
  },
  {
    id: "quant-backtest",
    label: "量化 · 回测",
    group: "量化",
    paths: ["/quant/backtest", "/equity/backtest"],
    description: "策略回测报告（非 Pro 运行消耗积分）",
    defaults: ALL,
  },
  {
    id: "quant-factor-research",
    label: "量化 · 因子研究",
    group: "量化",
    paths: ["/quant/factor-research", "/equity/factor-research"],
    description: "IC/IR、分层收益与因子相关性",
    defaults: PRO_ONLY,
  },
  {
    id: "quant-robustness",
    label: "量化 · 过拟合检验",
    group: "量化",
    paths: ["/quant/robustness", "/equity/robustness"],
    description: "DSR/PSR 与多重检验校正",
    defaults: PRO_ONLY,
  },
  {
    id: "events",
    label: "时间线",
    group: "内容",
    paths: ["/events"],
    description: "历史经济时代与市场事件时间线",
    defaults: ALL,
  },
  {
    id: "weekly",
    label: "AI周度观察",
    group: "内容",
    paths: ["/weekly"],
    description: "周度跨资产观察（全文仍需 Pro）",
    defaults: ALL,
  },
  {
    id: "articles",
    label: "专题文章",
    group: "内容",
    paths: ["/articles"],
    description: "专题文章列表与详情",
    defaults: ALL,
  },
  {
    id: "tools-kline-range",
    label: "工具 · K线区间统计",
    group: "工具",
    paths: ["/markets-tools"],
    description: "区间涨跌幅与统计",
    defaults: ADMIN_ONLY,
  },
  {
    id: "tools-statistical-analysis",
    label: "工具 · 统计分析",
    group: "工具",
    paths: ["/tools/statistical-analysis"],
    description: "序列统计分析工具",
    defaults: ADMIN_ONLY,
  },
  {
    id: "tools-futures-positions",
    label: "工具 · 期货持仓报告",
    group: "工具",
    paths: ["/tools/futures-positions"],
    description: "CFTC 持仓报告工具",
    defaults: ADMIN_ONLY,
  },
] as const;

export const FEATURE_GROUP_ORDER: readonly string[] = ["宏观", "美股", "量化", "内容", "工具"];

export const FEATURE_AUDIENCE_LABELS: Record<FeatureAudience, string> = {
  standard: "普通用户",
  pro: "Pro 用户",
};

export type FeatureAccessPolicy = {
  version: 1;
  features: Record<string, FeatureVisibility>;
};

export type FeatureViewer = {
  /** null = 未登录访客 */
  role: "admin" | "user" | null;
  hasProAccess: boolean;
};

const byId = new Map(FEATURE_CATALOG.map((f) => [f.id, f]));

export function getFeatureDefinition(featureId: string): FeatureDefinition | null {
  return byId.get(featureId) ?? null;
}

export function defaultFeatureAccessPolicy(): FeatureAccessPolicy {
  const features: Record<string, FeatureVisibility> = {};
  for (const f of FEATURE_CATALOG) features[f.id] = { ...f.defaults };
  return { version: 1, features };
}

function coerceVisibility(
  raw: unknown,
  def: FeatureDefinition,
): FeatureVisibility {
  if (def.adminOnly) return { standard: false, pro: false };
  const obj = (raw ?? {}) as Record<string, unknown>;
  const standard =
    typeof obj.standard === "boolean" ? obj.standard : def.defaults.standard;
  const proRaw = typeof obj.pro === "boolean" ? obj.pro : def.defaults.pro;
  // 单调：普通用户可见则 Pro 必然可见
  return { standard, pro: standard || proRaw };
}

/**
 * 把任意存储/入参归一化成完整策略：补齐目录里的每一项、丢弃已下线的 id、
 * 强制管理员专属项与单调约束。任何非法输入都退化为默认值而不是抛错，
 * 保证策略表损坏时站点仍按默认可见性工作。
 */
export function normalizeFeatureAccessPolicy(raw: unknown): FeatureAccessPolicy {
  const input =
    raw && typeof raw === "object"
      ? ((raw as { features?: unknown }).features as Record<string, unknown> | undefined)
      : undefined;
  const features: Record<string, FeatureVisibility> = {};
  for (const def of FEATURE_CATALOG) {
    features[def.id] = coerceVisibility(input?.[def.id], def);
  }
  return { version: 1, features };
}

export function featureVisibilityFor(
  policy: FeatureAccessPolicy,
  featureId: string,
): FeatureVisibility | null {
  const def = byId.get(featureId);
  if (!def) return null;
  return policy.features[featureId] ?? { ...def.defaults };
}

/** 管理员看全部；Pro/试用看 pro 列；普通用户与未登录访客看 standard 列。 */
export function isFeatureVisibleTo(
  policy: FeatureAccessPolicy,
  featureId: string,
  viewer: FeatureViewer,
): boolean {
  const def = byId.get(featureId);
  if (!def) return true; // 未登记的页面不受管控
  if (viewer.role === "admin") return true;
  const vis = policy.features[featureId] ?? def.defaults;
  return viewer.hasProAccess ? vis.pro : vis.standard;
}

export function visibleFeatureIds(
  policy: FeatureAccessPolicy,
  viewer: FeatureViewer,
): string[] {
  return FEATURE_CATALOG.filter((f) => isFeatureVisibleTo(policy, f.id, viewer)).map(
    (f) => f.id,
  );
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

/** 该功能是否「只有 Pro 能看」——用于给普通用户的锁定页展示升级引导。 */
export function isProOnlyFeature(
  policy: FeatureAccessPolicy,
  featureId: string,
): boolean {
  const vis = featureVisibilityFor(policy, featureId);
  return Boolean(vis && !vis.standard && vis.pro);
}

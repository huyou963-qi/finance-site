import type { ReviewPayload, TradingPlan } from "./ownershipTypes";
export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function validateReviewPayload(raw: unknown): ReviewPayload {
  check(raw && typeof raw === "object" && !Array.isArray(raw), "缺少审核内容");
  const p = raw as Record<string, unknown>;
  const str = (key: string) => check(typeof p[key] === "string" && (p[key] as string).trim().length > 0 && (p[key] as string).length <= 256, `${key} 必须填写`);
  const shares = () => check(typeof p.shares === "number" && Number.isFinite(p.shares) && p.shares >= 0, "股数必须是非负有限数值");
  if (p.kind === "account" || p.kind === "transaction") {
    check(Array.isArray(p.lineIds) && p.lineIds.length > 0 && p.lineIds.length <= 1000 && p.lineIds.every(v => typeof v === "string" && v.length <= 100), "请选择交易行");
    check(new Set(p.lineIds).size === p.lineIds.length, "交易行不能重复");
    if (p.kind === "account") { str("account"); str("security"); str("ownerCik"); }
    else {
      check(["merge", "separate", "replace", "exclude"].includes(String(p.action)), "未知交易裁定");
      if (p.action === "merge" || p.action === "replace") check(p.lineIds.length >= 2 && p.lineIds.includes(p.canonicalId), "合并/更正需要至少两行，并从中指定保留行");
      else check(p.canonicalId === null, "独立/排除不应指定保留行");
    }
  } else if (p.kind === "baseline" || p.kind === "float") {
    str("security"); shares(); check(isDay(p.date), "基准日期无效");
    if (p.kind === "baseline") { str("account"); str("ownerCik"); str("label"); }
    else check((p.shares as number) > 0, "流通股必须大于零");
  } else if (p.kind === "role") {
    str("ownerCik"); check(["Founder / Executive", "Director", "VC / PE", "Strategic investor", "10% owner", "Employee"].includes(String(p.role)), "未知持有人分类");
  } else if (p.kind === "plan") {
    const plan = p.plan as TradingPlan;
    check(plan && typeof plan === "object", "缺少计划");
    check(typeof plan.id === "string" && plan.id.length > 0 && plan.id.length <= 256 && typeof plan.ownerName === "string" && plan.ownerName.length > 0, "计划 ID / 姓名缺失");
    for (const key of ["adopted", "start", "end", "terminated"] as const) check(plan[key] === null || isDay(plan[key]), `计划 ${key} 日期无效`);
    check(isDay(plan.filedAt), "计划披露日无效");
    check(plan.maxShares === null || (Number.isFinite(plan.maxShares) && plan.maxShares >= 0), "计划数量无效");
    check(plan.adopted && plan.adopted <= plan.filedAt, "计划必须有不晚于披露日的建立日期");
    check(!plan.start || plan.start >= plan.adopted, "执行开始早于计划建立");
    check(!plan.end || plan.end >= (plan.start || plan.adopted), "计划结束日期错误");
    check(!plan.terminated || plan.terminated >= plan.adopted, "终止日期早于建立日期");
    check(["adopted","modified","terminated"].includes(plan.status), "审核计划状态无效");
    check(plan.status !== "terminated" || !!plan.terminated, "终止计划需要终止日");
    for (const key of ["ownerCik", "account", "security"] as const) check(plan[key] === null || typeof plan[key] === "string", `计划 ${key} 无效`);
    check(typeof plan.conditions === "string" && (plan.rule10b51 === true || plan.rule10b51 === false || plan.rule10b51 === null), "计划条款无效");
  } else throw new Error("未知审核类型");
  return p as ReviewPayload;
}
export type ReviewInput = { symbol: string; key: string; expectedRevision: number; payload: ReviewPayload; sourceUrl: string; quote: string; availableAt: string };
export function validateReviewInput(raw: unknown): ReviewInput {
  check(raw && typeof raw === "object", "缺少审核输入");
  const r = raw as ReviewInput;
  check(typeof r.symbol === "string" && /^[A-Z0-9.\-]{1,16}$/.test(r.symbol), "标的无效");
  check(typeof r.key === "string" && /^[a-zA-Z0-9:_ .\-]{1,160}$/.test(r.key), "证据键无效");
  check(Number.isInteger(r.expectedRevision) && r.expectedRevision >= 0, "缺少预期版本");
  const url = new URL(r.sourceUrl);
  check(url.protocol === "https:" && !url.username && !url.password && !url.search.includes("apikey") && r.sourceUrl.length <= 1024, "需要公开 HTTPS 证据链接");
  check(typeof r.quote === "string" && r.quote.trim().length >= 20 && r.quote.length <= 30000, "请提供 20–30000 字符的原文证据");
  check(isDay(r.availableAt) && r.availableAt <= new Date().toISOString().slice(0,10), "证据可见日无效");
  const payload = validateReviewPayload(r.payload);
  if (payload.kind === "float" || payload.kind === "baseline") check(payload.date <= r.availableAt, "基准不能晚于证据可见日");
  if (payload.kind === "plan") check(payload.plan.filedAt === r.availableAt, "计划披露日必须等于证据可见日");
  return { ...r, payload };
}

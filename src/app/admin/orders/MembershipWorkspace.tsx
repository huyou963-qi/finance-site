"use client";

import { useEffect, useState } from "react";
import { AdminOrdersClient } from "./AdminOrdersClient";
import { billingConfigSchema, defaultBillingConfig, quotePrice, membershipProducts, type BillingConfig } from "@/lib/billing/config";
import { hasAdminPermission } from "@/lib/auth/types";

const field = "mt-2 w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm text-fs-text focus:outline-none focus:ring-2 focus:ring-fs-accent";
const button = "rounded-lg border border-fs-border px-4 py-2.5 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-40";

export function MembershipWorkspace() {
  const [tab, setTab] = useState("orders");
  const [plans, setPlans] = useState<BillingConfig["plans"]>(defaultBillingConfig.plans);
  const [campaign, setCampaign] = useState<BillingConfig["campaign"]>(defaultBillingConfig.campaign);
  const [selected, setSelected] = useState(2);
  const [customer, setCustomer] = useState("new");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [live, setLive] = useState<BillingConfig>(defaultBillingConfig);
  const [history, setHistory] = useState<{ id: string; actorUsername: string; action: string; reason: string; createdAt: string }[]>([]);
  const canOrders = hasAdminPermission(role, "orders:write");
  const canPricing = hasAdminPermission(role, "membership:write");
  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" }).then(r => r.json()).then(data => {
      const r = data.user?.role ?? ""; setRole(r);
      if (!hasAdminPermission(r, "orders:write") && hasAdminPermission(r, "membership:write")) setTab("plans");
      if (hasAdminPermission(r, "membership:write")) void restore();
    }).catch(() => setNotice("无法读取后台权限，请重新登录。"));
  }, []);
  const plan = plans[selected];
  const valid = billingConfigSchema.safeParse({ plans, campaign }).success;
  const quote = valid ? quotePrice({ plans, campaign }, revision, membershipProducts[selected], customer as "new" | "renew") : null;
  const discount = (quote?.discountCents ?? 0) / 100;
  const due = (quote?.amountCents ?? 0) / 100;
  const eligible = Boolean(quote?.campaign);
  function updatePlan(index: number, patch: Partial<typeof plan>) {
    setPlans(items => items.map((p, i) => i === index ? { ...p, ...patch } : p) as BillingConfig["plans"]); setDirty(true);
  }
  function updateCampaign(patch: Partial<typeof campaign>) { setCampaign(c => ({ ...c, ...patch })); setDirty(true); }
  async function restore() {
    try {
      const res = await fetch("/api/admin/billing-config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "读取配置失败");
      setPlans(data.draft.plans); setCampaign(data.draft.campaign); setRevision(data.revision); setLive(data.live); setHistory(data.history ?? []); setDirty(false); setReady(true);
    } catch (e) { setReady(false); setNotice(e instanceof Error ? e.message : "配置载入失败"); }
  }
  async function save(action: "save" | "publish" | "stop") {
    if (!valid || !ready) return;
    if (!reason.trim() || !password || totp.length !== 6) { setNotice("请填写变更原因、管理员密码及六位动态码。"); return; }
    if (action !== "save" && !window.confirm(action === "publish" ? "发布当前套餐与活动？将立即用于新订单，历史订单金额不变。" : "立即停用线上营销活动？已生成订单的优惠保留。")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/billing-config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision, config: { plans, campaign }, reason, adminPassword: password, adminTotpCode: totp }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      await restore(); setReason("");
      setNotice(action === "save" ? "草稿已保存到服务器，线上配置保持不变。" : action === "publish" ? "套餐与活动已发布，新订单按生效规则结算。" : "线上活动已停用，已生成订单价格保持不变。");
    } catch (e) { setNotice(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); setPassword(""); setTotp(""); }
  }
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold tracking-widest text-fs-accent-text">GEKKOTECH / 会员运营</p><h1 className="mt-3 text-2xl font-semibold text-fs-text sm:text-3xl">会员与订单管理</h1><p className="mt-2 text-sm text-fs-muted">从套餐定价到营销优惠，灵活设计你的会员增长策略。</p></div>
      {tab !== "orders" && <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => { if (!dirty || window.confirm("载入服务器草稿会覆盖当前未保存修改，继续？")) void restore(); }}>重新载入</button><button className="rounded-lg bg-fs-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40" disabled={!valid || !ready || busy} onClick={() => void save("save")}>保存草稿{dirty ? " *" : ""}</button><button className={button} disabled={!valid || !ready || busy} onClick={() => void save("publish")}>发布上线</button><button className={button} disabled={!ready || busy || !live.campaign.enabled || !valid} onClick={() => void save("stop")}>停用线上活动</button></div>}
    </div>
    {tab !== "orders" && <div className="mt-6 rounded-lg border border-fs-border bg-fs-elevated px-4 py-3 text-sm text-fs-secondary">配置版本 {revision} · 当前线上活动：{live.campaign.enabled ? `${live.campaign.name}（${live.campaign.start} 至 ${live.campaign.end}，北京时间；日期内生效）` : "未启用"}。编辑及保存草稿不改变收费，发布后仅影响新订单。</div>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-fs-elevated p-3 text-sm text-fs-text">{notice}</p>}
    <nav aria-label="会员管理" className="mt-7 flex gap-6 overflow-x-auto border-b border-fs-border">
      {[["orders", "订单管理"], ["plans", "套餐设置"], ["marketing", "营销折扣"]].filter(([id]) => id === "orders" ? canOrders : canPricing).map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium ${tab === id ? "border-fs-accent text-fs-accent-text" : "border-transparent text-fs-muted"}`}>{label}</button>)}
    </nav>
    {tab === "orders" && canOrders ? <AdminOrdersClient /> : !canPricing ? <p className="py-6 text-sm text-fs-muted">请使用有订单处理或会员运营权限的账号登录。</p> : <div className="mt-7 grid items-start gap-6 xl:grid-cols-[1fr_300px]">
      <section className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-fs-text">{tab === "plans" ? "为不同节奏，提供不同选择" : "让优惠在合适的时机发生"}</h2><p className="mt-1 text-sm text-fs-muted">{tab === "plans" ? "会员权益保持一致，独立设置每个周期的价格和展示状态。" : "支持折扣或直减，按适用人群、套餐与时间精确控制。"}</p></div><span className="rounded-full bg-fs-elevated px-3 py-1 text-xs text-fs-muted">{tab === "plans" ? "3 种付费周期" : "活动草稿"}</span></div>
        {tab === "plans" ? <>
          <div className="grid gap-4 md:grid-cols-3">{plans.map((p, i) => <article key={p.months} className={`relative rounded-xl border bg-fs-bg p-5 ${i === 2 ? "border-fs-accent" : "border-fs-border"}`}>
            <div className="flex items-center justify-between"><span className="text-xs text-fs-muted">PRO / {String(i + 1).padStart(2, "0")}</span><button role="switch" aria-checked={p.enabled} aria-label={`${p.name}展示`} onClick={() => updatePlan(i, { enabled: !p.enabled })} className={`rounded-full px-2.5 py-1 text-xs ${p.enabled ? "bg-fs-accent-soft text-fs-accent-text" : "bg-fs-elevated text-fs-muted"}`}>{p.enabled ? "展示中" : "已隐藏"}</button></div>
            <h3 className="mt-5 text-lg font-semibold text-fs-text">{p.name}</h3><p className="mt-1 text-xs text-fs-muted">一次支付 · {p.months} 个月权益</p>
            <label className="mt-6 block text-xs text-fs-secondary">套餐价格（元）<input type="number" min="0.01" max="100000" step="0.01" className={field + " !text-2xl font-semibold"} value={Number.isNaN(p.price) ? "" : p.price} onChange={e => updatePlan(i, { price: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
            <p className="mt-3 text-xs text-fs-muted">折合 ¥{Number.isFinite(p.price) ? (p.price / p.months).toFixed(2) : "—"} / 月</p>
            <label className="mt-5 block text-xs text-fs-secondary">展示文案<input maxLength={60} className={field} value={p.tagline} onChange={e => updatePlan(i, { tagline: e.target.value })} /></label>
          </article>)}</div>
          <div className="mt-5 rounded-xl border border-fs-border bg-fs-elevated/40 p-5"><h3 className="text-sm font-medium text-fs-text">价格调整规则</h3><p className="mt-2 text-sm leading-7 text-fs-muted">新价格仅用于发布后创建的订单。历史订单保留成交价格与权益快照；隐藏套餐不影响已购买会员的剩余权益。当前按一次性购买设计，不自动扣费。</p></div>
        </> : <div className="rounded-xl border border-fs-border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-fs-text">活动规则</h3><label className="flex items-center gap-2 text-sm text-fs-secondary"><input type="checkbox" checked={campaign.enabled} onChange={e => updateCampaign({ enabled: e.target.checked })} />启用活动</label></div>
          <label className="mt-5 block text-sm text-fs-secondary">活动名称<input className={field} maxLength={60} value={campaign.name} onChange={e => updateCampaign({ name: e.target.value })} /></label>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm text-fs-secondary">优惠方式<select className={field} value={campaign.type} onChange={e => updateCampaign({ type: e.target.value as "percent" | "fixed", value: 20 })}><option value="percent">百分比折扣</option><option value="fixed">固定金额直减</option></select></label>
            <label className="text-sm text-fs-secondary">{campaign.type === "percent" ? "减免比例（20 表示打八折）" : "直减金额（元）"}<input type="number" min="0.01" step="0.01" max={campaign.type === "percent" ? 99.99 : 100000} className={field} value={Number.isNaN(campaign.value) ? "" : campaign.value} onChange={e => updateCampaign({ value: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
            <label className="text-sm text-fs-secondary">适用人群<select className={field} value={campaign.target} onChange={e => updateCampaign({ target: e.target.value as BillingConfig["campaign"]["target"] })}><option value="new">首次付费用户</option><option value="renew">续费会员</option><option value="all">全部用户</option></select></label>
            <label className="text-sm text-fs-secondary">适用套餐<select className={field} value={campaign.plan} onChange={e => updateCampaign({ plan: e.target.value as BillingConfig["campaign"]["plan"] })}><option value="all">全部套餐</option>{plans.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select></label>
            <label className="text-sm text-fs-secondary">开始日期（北京时间）<input type="date" className={field} value={campaign.start} onChange={e => updateCampaign({ start: e.target.value })} /></label>
            <label className="text-sm text-fs-secondary">结束日期（含当日）<input type="date" min={campaign.start} className={field} value={campaign.end} onChange={e => updateCampaign({ end: e.target.value })} /></label>
          </div><p className="mt-5 border-t border-fs-border pt-4 text-xs leading-6 text-fs-muted">按套餐价格计算优惠，不叠加其他活动。优惠后最低实付 ¥0.01，不生成零元订单。首次付费以历史会员收款记录判断，待支付的首购优惠订单会暂时占用首购资格。</p>
        </div>}
      </section>
      <aside className="rounded-xl border border-fs-border bg-fs-elevated/40 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-fs-text">下单效果试算</h2><span className="text-xs text-fs-muted">实时预览</span></div><p className="mt-2 text-xs leading-6 text-fs-muted">以北京时间今天为准，检查活动资格和实付金额。</p>
        <label className="mt-4 block text-xs text-fs-secondary">选择套餐<select className={field} value={selected} onChange={e => setSelected(Number(e.target.value))}>{plans.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select></label>
        <label className="mt-4 block text-xs text-fs-secondary">模拟用户<select className={field} value={customer} onChange={e => setCustomer(e.target.value)}><option value="new">首次付费用户</option><option value="renew">续费会员</option></select></label>
        <div className="mt-6 rounded-lg border border-fs-border bg-fs-bg p-4"><p className="text-xs text-fs-accent-text">GEKKOTECH PRO</p><h3 className="mt-3 font-semibold text-fs-text">{plan.name}</h3><p className="mt-2 break-words text-xs leading-6 text-fs-muted">{plan.tagline}</p><div className="mt-5 flex justify-between text-sm text-fs-secondary"><span>套餐价</span><span>¥{Number.isFinite(plan.price) ? plan.price.toFixed(2) : "—"}</span></div><div className="mt-3 flex justify-between text-sm text-fs-secondary"><span>活动优惠</span><span>− ¥{Number.isFinite(discount) ? discount.toFixed(2) : "—"}</span></div><div className="mt-5 flex items-center justify-between border-t border-fs-border pt-4"><span className="text-sm text-fs-text">预计实付</span><strong className="text-2xl text-fs-accent-text">¥{valid ? due.toFixed(2) : "—"}</strong></div></div>
        <p className="mt-4 text-xs leading-6 text-fs-muted">{!plan.enabled ? "该套餐已隐藏，用户端不可购买。" : !valid ? "请先修正配置后查看试算。" : eligible ? `已匹配「${campaign.name}」` : "未匹配有效活动，按套餐价格试算。"}</p>
      </aside>
    </div>}
    {canPricing && tab !== "orders" && <section className="mt-6 rounded-xl border border-fs-border p-5"><h2 className="font-medium text-fs-text">变更验证与发布记录</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs text-fs-secondary">变更原因<input className={field} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><label className="text-xs text-fs-secondary">管理员密码<input type="password" autoComplete="current-password" className={field} value={password} onChange={e => setPassword(e.target.value)} /></label><label className="text-xs text-fs-secondary">动态验证码<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={field} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ""))} /></label></div><p className="mt-3 text-xs text-fs-muted">填妥后使用页面上方的保存、发布或停用按钮。试算基于编辑中的配置；实际成交以服务器生成的订单为准。</p><ul className="mt-4 space-y-2 text-xs text-fs-muted">{history.map(h => <li key={h.id}>{new Date(h.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · {h.actorUsername} · {{ save: "保存草稿", publish: "发布上线", stop: "停用活动" }[h.action] ?? h.action} · {h.reason}</li>)}</ul></section>}
  </div>;
}

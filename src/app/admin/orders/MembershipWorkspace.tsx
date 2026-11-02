"use client";

import { useState } from "react";
import { AdminOrdersClient } from "./AdminOrdersClient";
import { PRICE_MONTHLY_CNY, PRICE_YEARLY_CNY } from "@/lib/billing/pricing";

const initialPlans = [
  { name: "月付会员", months: 1, price: PRICE_MONTHLY_CNY, enabled: true, tagline: "低门槛体验，随时开始" },
  { name: "季付会员", months: 3, price: 109, enabled: true, tagline: "持续研究，更从容的选择" },
  { name: "年付会员", months: 12, price: PRICE_YEARLY_CNY, enabled: true, tagline: "长期陪伴，让研究积累价值" },
];
const field = "mt-2 w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-2.5 text-sm text-fs-text focus:outline-none focus:ring-2 focus:ring-fs-accent";
const button = "rounded-lg border border-fs-border px-4 py-2.5 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-40";

export function MembershipWorkspace() {
  const [tab, setTab] = useState("orders");
  const [plans, setPlans] = useState(initialPlans);
  const [campaign, setCampaign] = useState({ name: "新会员专享", type: "percent", value: 20, target: "new", plan: "all", start: "", end: "", enabled: false });
  const [selected, setSelected] = useState(2);
  const [customer, setCustomer] = useState("new");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const plan = plans[selected];
  const valid = plans.every(p => Number.isFinite(p.price) && p.price > 0 && p.price <= 100000 && Math.abs(Math.round(p.price * 100) - p.price * 100) < 0.000001)
    && Number.isFinite(campaign.value) && campaign.value > 0 && (campaign.type !== "percent" || campaign.value < 100)
    && (!campaign.enabled || Boolean(campaign.start && campaign.end && campaign.end >= campaign.start && campaign.name.trim()));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const eligible = campaign.enabled && campaign.start <= today && campaign.end >= today && (campaign.plan === "all" || Number(campaign.plan) === selected) && (campaign.target === "all" || campaign.target === customer);
  const discount = eligible ? Math.min(plan.price, campaign.type === "percent" ? plan.price * campaign.value / 100 : campaign.value) : 0;
  const due = Math.round((plan.price - discount) * 100) / 100;
  function updatePlan(index: number, patch: Partial<typeof plan>) {
    setPlans(items => items.map((p, i) => i === index ? { ...p, ...patch } : p)); setDirty(true);
  }
  function updateCampaign(patch: Partial<typeof campaign>) { setCampaign(c => ({ ...c, ...patch })); setDirty(true); }
  function save() {
    if (!valid) { setNotice("请检查价格（最多两位小数）、优惠力度与活动起止日期。"); return; }
    try {
      localStorage.setItem("gekkotech-membership-design-v1", JSON.stringify({ plans, campaign }));
      setSaved(true); setDirty(false); setNotice("设计草稿已保存到此浏览器，尚未应用到线上收费。");
    } catch { setNotice("浏览器存储不可用，草稿未保存。请保留当前页面。"); }
  }
  function restore() {
    try {
      const raw = localStorage.getItem("gekkotech-membership-design-v1");
      if (!raw) { setNotice("此浏览器还没有保存的草稿。"); return; }
      const draft = JSON.parse(raw);
      if (!Array.isArray(draft.plans) || draft.plans.length !== 3 || !draft.plans.every((p: typeof plan) => typeof p.price === "number" && typeof p.enabled === "boolean" && typeof p.tagline === "string") || !draft.campaign || !["percent", "fixed"].includes(draft.campaign.type) || typeof draft.campaign.value !== "number") throw new Error();
      setPlans(draft.plans); setCampaign(draft.campaign); setDirty(false); setSaved(true); setNotice("已载入此浏览器保存的设计草稿。");
    } catch { setNotice("无法读取草稿，请重新设置。"); }
  }
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold tracking-widest text-fs-accent-text">GEKKOTECH / 会员运营</p><h1 className="mt-3 text-2xl font-semibold text-fs-text sm:text-3xl">会员与订单管理</h1><p className="mt-2 text-sm text-fs-muted">从套餐定价到营销优惠，灵活设计你的会员增长策略。</p></div>
      {tab !== "orders" && <div className="flex flex-wrap gap-2"><button className={button} onClick={restore}>载入草稿</button><button className="rounded-lg bg-fs-accent px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40" disabled={!valid} onClick={save}>保存设计草稿{dirty ? " *" : ""}</button></div>}
    </div>
    {tab !== "orders" && <div className="mt-6 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-900">设计预览 · 套餐和活动仅在本页试算，{saved ? "草稿已在此浏览器保存。" : "保存后仅存于此浏览器。"}线上仍按现有定价收费；季付为拟新增方案。</div>}
    {notice && <p role="status" className="mt-3 rounded-lg bg-fs-elevated p-3 text-sm text-fs-text">{notice}</p>}
    <nav aria-label="会员管理" className="mt-7 flex gap-6 overflow-x-auto border-b border-fs-border">
      {[["orders", "订单管理"], ["plans", "套餐设置"], ["marketing", "营销折扣"]].map(([id, label]) => <button key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-1 pb-4 text-sm font-medium ${tab === id ? "border-fs-accent text-fs-accent-text" : "border-transparent text-fs-muted"}`}>{label}</button>)}
    </nav>
    {tab === "orders" ? <AdminOrdersClient /> : <div className="mt-7 grid items-start gap-6 xl:grid-cols-[1fr_300px]">
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
          <div className="mt-5 rounded-xl border border-fs-border bg-fs-elevated/40 p-5"><h3 className="text-sm font-medium text-fs-text">价格调整规则</h3><p className="mt-2 text-sm leading-7 text-fs-muted">建议新价格仅用于生效后创建的订单。历史订单保留成交价格与权益快照；隐藏套餐不影响已购买会员的剩余权益。当前按一次性购买设计，不自动扣费。</p></div>
        </> : <div className="rounded-xl border border-fs-border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-fs-text">活动规则</h3><label className="flex items-center gap-2 text-sm text-fs-secondary"><input type="checkbox" checked={campaign.enabled} onChange={e => updateCampaign({ enabled: e.target.checked })} />参与试算</label></div>
          <label className="mt-5 block text-sm text-fs-secondary">活动名称<input className={field} maxLength={60} value={campaign.name} onChange={e => updateCampaign({ name: e.target.value })} /></label>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="text-sm text-fs-secondary">优惠方式<select className={field} value={campaign.type} onChange={e => updateCampaign({ type: e.target.value, value: 20 })}><option value="percent">百分比折扣</option><option value="fixed">固定金额直减</option></select></label>
            <label className="text-sm text-fs-secondary">{campaign.type === "percent" ? "减免比例（20 表示打八折）" : "直减金额（元）"}<input type="number" min="0.01" step="0.01" max={campaign.type === "percent" ? 99.99 : 100000} className={field} value={Number.isNaN(campaign.value) ? "" : campaign.value} onChange={e => updateCampaign({ value: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
            <label className="text-sm text-fs-secondary">适用人群<select className={field} value={campaign.target} onChange={e => updateCampaign({ target: e.target.value })}><option value="new">首次付费用户</option><option value="renew">续费会员</option><option value="all">全部用户</option></select></label>
            <label className="text-sm text-fs-secondary">适用套餐<select className={field} value={campaign.plan} onChange={e => updateCampaign({ plan: e.target.value })}><option value="all">全部套餐</option>{plans.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select></label>
            <label className="text-sm text-fs-secondary">开始日期（北京时间）<input type="date" className={field} value={campaign.start} onChange={e => updateCampaign({ start: e.target.value })} /></label>
            <label className="text-sm text-fs-secondary">结束日期（含当日）<input type="date" min={campaign.start} className={field} value={campaign.end} onChange={e => updateCampaign({ end: e.target.value })} /></label>
          </div><p className="mt-5 border-t border-fs-border pt-4 text-xs leading-6 text-fs-muted">按套餐价格计算优惠，不叠加其他活动。直减最多抵扣至 ¥0；零元订单的审核与权益发放流程需在正式接入时单独确认。</p>
        </div>}
      </section>
      <aside className="rounded-xl border border-fs-border bg-fs-elevated/40 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-fs-text">下单效果试算</h2><span className="text-xs text-fs-muted">实时预览</span></div><p className="mt-2 text-xs leading-6 text-fs-muted">以北京时间今天为准，检查活动资格和实付金额。</p>
        <label className="mt-4 block text-xs text-fs-secondary">选择套餐<select className={field} value={selected} onChange={e => setSelected(Number(e.target.value))}>{plans.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select></label>
        <label className="mt-4 block text-xs text-fs-secondary">模拟用户<select className={field} value={customer} onChange={e => setCustomer(e.target.value)}><option value="new">首次付费用户</option><option value="renew">续费会员</option></select></label>
        <div className="mt-6 rounded-lg border border-fs-border bg-fs-bg p-4"><p className="text-xs text-fs-accent-text">GEKKOTECH PRO</p><h3 className="mt-3 font-semibold text-fs-text">{plan.name}</h3><p className="mt-2 break-words text-xs leading-6 text-fs-muted">{plan.tagline}</p><div className="mt-5 flex justify-between text-sm text-fs-secondary"><span>套餐价</span><span>¥{Number.isFinite(plan.price) ? plan.price.toFixed(2) : "—"}</span></div><div className="mt-3 flex justify-between text-sm text-fs-secondary"><span>活动优惠</span><span>− ¥{Number.isFinite(discount) ? discount.toFixed(2) : "—"}</span></div><div className="mt-5 flex items-center justify-between border-t border-fs-border pt-4"><span className="text-sm text-fs-text">预计实付</span><strong className="text-2xl text-fs-accent-text">¥{valid ? due.toFixed(2) : "—"}</strong></div></div>
        <p className="mt-4 text-xs leading-6 text-fs-muted">{!plan.enabled ? "该套餐已隐藏，用户端不可购买。" : !valid ? "请先修正配置后查看试算。" : eligible ? `已匹配「${campaign.name}」` : "未匹配有效活动，按套餐价格试算。"}</p>
      </aside>
    </div>}
  </div>;
}

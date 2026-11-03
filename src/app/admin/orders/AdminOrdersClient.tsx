"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PaymentTrace } from "@/components/billing/PaymentTrace";

type OrderRow = {
  id: string; orderNo: string; username: string; email: string;
  productType: string; amountCny: number; credits: number; status: string;
  createdAt: string; paidAt: string; fulfilledAt: string; channel: string;
  pricingSnapshot?: { baseCents: number; discountCents: number; campaign?: { name: string } | null } | null;
  externalId: string; lastErrorCode: string; checkAttempts: number; lastCheckedAt: string;
};
const statuses: Record<string, string> = { pending: "待支付", paid: "已支付", expired: "已过期", review: "需核对" };
const products: Record<string, string> = { pro_month: "Pro 月付", pro_year: "Pro 年付", pro_quarter: "Pro 季付", credits: "积分包" };
const field = "mt-1 w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-2 text-sm text-fs-text";
const action = "rounded-lg border border-fs-border px-3 py-2 text-sm text-fs-text disabled:opacity-50";
function date(value: string) { return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—"; }
function manualEligible(o: OrderRow) { return o.status === "pending" && o.channel !== "zpay"; }

export function AdminOrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [query, setQuery] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "订单加载失败");
      if (id === request.current) { setOrders(data.orders ?? []); setHint(""); }
    } catch (e) { if (id === request.current) setHint(e instanceof Error ? e.message : "加载失败"); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function close() { setSelected(null); setPassword(""); setTotp(""); setReason(""); }
  function open(order: OrderRow) { close(); setSelected(order); }
  async function confirm() {
    if (!selected || !reason.trim() || !password || totp.length !== 6) { setHint("请填写确认依据、管理员密码和六位动态验证码。"); return; }
    if (!window.confirm(`已核实 ${selected.orderNo} 的 ¥${selected.amountCny} 到账，并确认开通权益？`)) return;
    setBusy(true); setHint("");
    try {
      const res = await fetch("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: selected.id, reason, adminPassword: password, adminTotpCode: totp }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "确认失败");
      close(); await load(); setHint("已确认收款并开通权益，操作已记录审计。");
    } catch (e) { setHint(e instanceof Error ? e.message : "确认失败"); }
    finally { setBusy(false); setPassword(""); setTotp(""); }
  }
  const visible = orders.filter(o => (!status || o.status === status) && (!channel || (channel === "online" ? o.channel === "zpay" : o.channel !== "zpay")) && `${o.orderNo} ${o.username} ${o.email} ${o.externalId}`.toLowerCase().includes(query.trim().toLowerCase()));
  function payment(o: OrderRow) {
    return <div className="text-xs text-fs-muted"><p>{o.pricingSnapshot ? `原价 ¥${(o.pricingSnapshot.baseCents / 100).toFixed(2)} · 优惠 ¥${(o.pricingSnapshot.discountCents / 100).toFixed(2)} · ${o.pricingSnapshot.campaign?.name ?? "无活动"}` : "历史订单 · 无价格快照"}</p><p>{o.channel === "zpay" ? "在线支付 · 自动核验" : "人工收款"}</p><p className="mt-1 break-all">流水：{o.externalId || "—"}</p><p className="mt-1">核验 {o.checkAttempts} 次 · {o.lastErrorCode || "无异常记录"}</p><p className="mt-1">最近核验：{date(o.lastCheckedAt)}</p><PaymentTrace orderId={o.id} online={o.channel === "zpay"} onRechecked={load} /></div>;
  }
  function state(o: OrderRow) {
    return <><span className={`inline-block rounded-full px-2.5 py-1 text-xs ${o.status === "paid" ? "bg-fs-accent-soft text-fs-accent-text" : "bg-fs-elevated text-fs-secondary"}`}>{statuses[o.status] ?? o.status}</span><p className="mt-2 text-xs text-fs-muted">{o.fulfilledAt ? `权益已发放 · ${date(o.fulfilledAt)}` : o.status === "review" ? "请查看核验记录后处理" : o.paidAt ? "已记录收款，权益待核对" : "尚未发放权益"}</p>{manualEligible(o) && <button className={action + " mt-3"} disabled={busy} onClick={() => open(o)}>人工确认收款</button>}</>;
  }
  return <section className="py-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-fs-text">订单管理</h2><p className="mt-2 text-sm leading-6 text-fs-muted">在线支付经平台核验后自动开通权益；历史人工收款订单在此核实到账并确认。</p></div><button className={action} disabled={loading || busy} onClick={() => void load()}>{loading ? "刷新中…" : "刷新订单"}</button></div>
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["", "最近订单"], ["paid", "已支付"], ["pending", "待支付"], ["review", "需核对"]].map(([value, label]) => <button key={label} onClick={() => setStatus(value)} className={`rounded-xl border p-4 text-left ${status === value ? "border-fs-accent bg-fs-accent-soft" : "border-fs-border"}`}><span className="text-xs text-fs-muted">{label}</span><strong className="mt-2 block text-2xl text-fs-text">{loading && !orders.length ? "—" : orders.filter(o => !value || o.status === value).length}</strong></button>)}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]"><label className="text-xs text-fs-secondary">搜索当前记录<input className={field} placeholder="订单号、用户、邮箱或支付流水" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="text-xs text-fs-secondary">订单状态<select className={field} value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-xs text-fs-secondary">收款方式<select className={field} value={channel} onChange={e => setChannel(e.target.value)}><option value="">全部方式</option><option value="online">在线支付 · 自动核验</option><option value="manual">人工收款</option></select></label></div>
    <p className="mt-3 text-xs text-fs-muted">仅展示最近 200 笔订单，统计与筛选均基于这些记录；当前匹配 {visible.length} 笔。时间均为北京时间。</p>
    {hint && <p role="status" className="mt-4 rounded-lg border border-fs-border p-3 text-sm text-fs-text">{hint}</p>}
    {selected && <form onSubmit={e => { e.preventDefault(); void confirm(); }} className="mt-5 rounded-xl border border-fs-accent/40 bg-fs-elevated/40 p-5"><h3 className="font-medium text-fs-text">人工收款核实 · {selected.orderNo}</h3><p className="mt-2 text-sm text-fs-muted">{selected.username} · ¥{selected.amountCny}。仅用于人工收款订单，在线支付请使用平台查单。</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-fs-secondary">确认依据<input required maxLength={500} className={field} value={reason} onChange={e => setReason(e.target.value)} placeholder="到账流水及核实依据" /></label><label className="text-xs text-fs-secondary">管理员密码<input required autoComplete="current-password" type="password" className={field} value={password} onChange={e => setPassword(e.target.value)} /></label><label className="text-xs text-fs-secondary">动态验证码<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={field} value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, ""))} /></label></div><div className="mt-4 flex gap-3"><button disabled={busy} className="rounded-lg bg-fs-accent px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "确认中…" : "确认到账并开通权益"}</button><button type="button" disabled={busy} onClick={close} className={action}>取消</button></div></form>}
    <div className="mt-5 hidden overflow-x-auto rounded-xl border border-fs-border md:block"><table className="w-full text-left text-sm"><thead className="bg-fs-elevated text-xs text-fs-muted"><tr>{["订单 / 用户", "商品 / 金额", "支付核验", "状态 / 权益"].map(label => <th key={label} className="p-4">{label}</th>)}</tr></thead><tbody>{visible.map(o => <tr key={o.id} className="border-t border-fs-border align-top"><td className="p-4"><strong className="break-all font-mono text-xs text-fs-text">{o.orderNo}</strong><p className="mt-2 text-fs-text">{o.username}</p><p className="break-all text-xs text-fs-muted">{o.email}</p><p className="mt-2 text-xs text-fs-muted">创建：{date(o.createdAt)}</p><p className="mt-1 text-xs text-fs-muted">支付：{date(o.paidAt)}</p></td><td className="p-4 text-fs-text">{products[o.productType] ?? o.productType}<p className="mt-2 font-semibold">¥{o.amountCny.toFixed(2)}</p>{o.credits > 0 && <p className="mt-1 text-xs text-fs-muted">{o.credits} 积分</p>}</td><td className="p-4">{payment(o)}</td><td className="p-4">{state(o)}</td></tr>)}</tbody></table></div>
    <div className="mt-5 space-y-3 md:hidden">{visible.map(o => <article key={o.id} className="rounded-xl border border-fs-border p-4"><strong className="break-all font-mono text-sm text-fs-text">{o.orderNo}</strong><p className="mt-3 text-sm text-fs-text">{o.username} · {products[o.productType] ?? o.productType} · ¥{o.amountCny.toFixed(2)}</p>{o.credits > 0 && <p className="text-xs text-fs-muted">{o.credits} 积分</p>}<p className="mt-1 break-all text-xs text-fs-muted">{o.email}</p><p className="mt-2 text-xs text-fs-muted">创建：{date(o.createdAt)}<br />支付：{date(o.paidAt)}</p><div className="mt-3">{state(o)}</div><div className="mt-3 border-t border-fs-border pt-3">{payment(o)}</div></article>)}</div>
    {!visible.length && <p className="mt-4 rounded-lg border border-fs-border p-8 text-center text-sm text-fs-muted">{loading ? "正在加载订单…" : hint ? "订单未能加载，请刷新重试。" : "没有匹配的订单"}</p>}
  </section>;
}

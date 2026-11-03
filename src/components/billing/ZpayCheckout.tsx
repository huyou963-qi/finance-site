"use client";
import { useEffect, useState } from "react";

export type OnlineOrder = { id: string; orderNo: string; amountCny: number; status: string; expiresAt: string; fulfilledAt: string; channel?: string; pricingSnapshot?: { baseCents: number; discountCents: number; campaign?: { name: string } | null } | null };
export type OnlineCheckout = { order: OnlineOrder; checkout?: { action: string; fields: Record<string, string> } };
const STORAGE_KEY = "gekkotech.pending-payment";
export const PAYMENT_STATUS: Record<string, string> = { pending: "等待付款", paid: "已支付", expired: "付款入口已过期", review: "付款需人工核对", cancelled: "已取消" };

export function ZpayCheckout({ initial, onPaid }: { initial: OnlineCheckout | null; onPaid: () => void }) {
  const [active, setActive] = useState<OnlineCheckout | null>(initial);
  const [hint, setHint] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (initial) {
      setActive(initial); setHint("");
      try { sessionStorage.setItem(STORAGE_KEY, initial.order.id); } catch { /* payment still works */ }
    }
  }, [initial]);
  useEffect(() => {
    const controller = new AbortController();
    let id: string | null = null;
    try { id = sessionStorage.getItem(STORAGE_KEY); } catch { return; }
    if (id) void fetch(`/api/billing/orders/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal }).then(async res => {
      if (!res.ok) return;
      const data = await res.json();
      setActive(previous => previous ?? { order: data.order });
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const orderId = active?.order.id;
  const settled = active?.order.status === "paid" && Boolean(active.order.fulfilledAt);
  useEffect(() => {
    if (!orderId || settled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    let iterations = 0;
    const poll = async () => {
      try {
        if (document.visibilityState !== "hidden") {
          const res = await fetch(`/api/billing/orders/${encodeURIComponent(orderId)}`, {
            method: iterations % 6 === 0 ? "POST" : "GET", cache: "no-store", signal: controller.signal,
          });
          if (res.status === 401 || res.status === 404) { setActive(null); return; }
          if (res.ok) {
            const data = await res.json();
            if (!stopped) setActive(previous => previous?.order.id === orderId ? { ...previous, order: data.order } : previous);
            if (data.order.status === "paid" && data.order.fulfilledAt) {
              try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
              onPaid(); return;
            }
          }
        }
      } catch { /* keep pending: a network error never means payment failure */ }
      if (!stopped && ++iterations < 120) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 1000);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [orderId, settled, onPaid]);

  async function check() {
    if (!active) return;
    setChecking(true); setHint("");
    try {
      const res = await fetch(`/api/billing/orders/${encodeURIComponent(active.order.id)}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "暂时无法核验，请稍后再试");
      setActive(previous => previous ? { ...previous, order: data.order } : null);
      if (data.order.status === "paid" && data.order.fulfilledAt) onPaid();
      else setHint("尚未确认开通。若已扣款请勿重复购买，稍后再核验或提供订单号联系客服。");
    } catch (e) { setHint(e instanceof Error ? e.message : "暂时无法核验"); }
    finally { setChecking(false); }
  }
  if (!active) return null;
  const { order, checkout } = active;
  const payable = order.status === "pending" && new Date(order.expiresAt).getTime() > Date.now();
  return <section className="mt-6 rounded-xl border border-fs-accent/40 bg-fs-accent-soft/30 p-4 sm:p-6" aria-label="在线支付订单">
    <h2 className="text-lg font-semibold text-fs-text">{settled ? "付款成功，权益已开通" : "在线支付订单"}</h2>
    <p className="mt-2 break-all text-sm text-fs-secondary">订单号：<span className="font-mono">{order.orderNo}</span></p>
    <p className="mt-2 text-sm text-fs-text">¥{order.amountCny} · {PAYMENT_STATUS[order.status] ?? order.status}</p>
    {order.pricingSnapshot && <p className="mt-2 text-xs text-fs-muted">订单原价 ¥{(order.pricingSnapshot.baseCents / 100).toFixed(2)} · 优惠 ¥{(order.pricingSnapshot.discountCents / 100).toFixed(2)}{order.pricingSnapshot.campaign ? ` · ${order.pricingSnapshot.campaign.name}` : ""}。金额已锁定，以此订单实付为准。</p>}
    <p className="mt-2 text-xs text-fs-muted">{payable ? `付款入口有效至 ${new Date(order.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）` : "若已经扣款，请先核验此订单，避免重复购买。"}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {checkout && payable && checkout.action === "https://zpayz.cn/submit.php" ? <form method="post" action={checkout.action} target="_blank" rel="noopener noreferrer">
        {Object.entries(checkout.fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <button type="submit" className="rounded-md bg-fs-accent px-4 py-2.5 text-sm text-white">前往 ZPAY 付款</button>
      </form> : null}
      {!settled ? <button type="button" onClick={() => void check()} disabled={checking} className="rounded-md border border-fs-border px-4 py-2.5 text-sm text-fs-text disabled:opacity-50">{checking ? "核验中…" : "我已付款，核验开通"}</button> : null}
    </div>
    <p className="mt-3 text-xs text-fs-muted">在支付页面扫码或调起支付应用；付款后可返回本页查看结果。按次购买，到期不自动扣款。</p>
    {hint ? <p role="status" className="mt-3 text-sm text-fs-secondary">{hint}</p> : null}
  </section>;
}

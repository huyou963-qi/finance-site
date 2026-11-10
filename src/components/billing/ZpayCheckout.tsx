"use client";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { INTL_LOCALE } from "@/i18n/locales";
import { formatNumber } from "@/lib/i18n/format";

export type OnlineOrder = { id: string; orderNo: string; amountCny: number; status: string; expiresAt: string; fulfilledAt: string; channel?: string; pricingSnapshot?: { baseCents: number; discountCents: number; campaign?: { name: string } | null } | null };
export type OnlineCheckout = { order: OnlineOrder; checkout?: { action: string; fields: Record<string, string> } };
const STORAGE_KEY = "gekkotech.pending-payment";
const PAYMENT_STATUSES = ["pending", "paid", "expired", "review", "cancelled"] as const;

/** 订单状态 → 当前语言的文案（未知状态原样显示） */
export function usePaymentStatusLabel(): (status: string) => string {
  const t = useTranslations("payment.status");
  return useCallback(
    (status: string) =>
      (PAYMENT_STATUSES as readonly string[]).includes(status)
        ? t(status as (typeof PAYMENT_STATUSES)[number])
        : status,
    [t],
  );
}

export function ZpayCheckout({ initial, onPaid }: { initial: OnlineCheckout | null; onPaid: () => void }) {
  const t = useTranslations("payment");
  const locale = useLocale();
  const statusLabel = usePaymentStatusLabel();
  const money = (yuan: number) => formatNumber(yuan, locale, { style: "currency", currency: "CNY" });
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
      if (!res.ok) throw new Error(data.error ?? t("checkFailed"));
      setActive(previous => previous ? { ...previous, order: data.order } : null);
      if (data.order.status === "paid" && data.order.fulfilledAt) onPaid();
      else setHint(t("notYet"));
    } catch (e) { setHint(e instanceof Error ? e.message : t("checkFailedShort")); }
    finally { setChecking(false); }
  }
  if (!active) return null;
  const { order, checkout } = active;
  const payable = order.status === "pending" && new Date(order.expiresAt).getTime() > Date.now();
  return <section className="mt-6 rounded-xl border border-fs-accent/40 bg-fs-accent-soft/30 p-4 sm:p-6" aria-label={t("sectionLabel")}>
    <h2 className="text-lg font-semibold text-fs-text">{settled ? t("success") : t("sectionLabel")}</h2>
    <p className="mt-2 break-all text-sm text-fs-secondary">{t.rich("orderNo", { no: () => <span className="font-mono">{order.orderNo}</span> })}</p>
    <p className="mt-2 text-sm text-fs-text">{money(order.amountCny)} · {statusLabel(order.status)}</p>
    {order.pricingSnapshot && <p className="mt-2 text-xs text-fs-muted">{t("snapshot", { base: money(order.pricingSnapshot.baseCents / 100), discount: money(order.pricingSnapshot.discountCents / 100), campaign: order.pricingSnapshot.campaign && locale !== "en" ? ` · ${order.pricingSnapshot.campaign.name}` : "" })}</p>}
    <p className="mt-2 text-xs text-fs-muted">{payable ? t("validUntil", { time: new Date(order.expiresAt).toLocaleString(INTL_LOCALE[locale], { timeZone: "Asia/Shanghai" }) }) : t("alreadyCharged")}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {checkout && payable && checkout.action === "https://zpayz.cn/submit.php" ? <form method="post" action={checkout.action} target="_blank" rel="noopener noreferrer">
        {Object.entries(checkout.fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <button type="submit" className="rounded-md bg-fs-accent px-4 py-2.5 text-sm text-white">{t("goPay")}</button>
      </form> : null}
      {!settled ? <button type="button" onClick={() => void check()} disabled={checking} className="rounded-md border border-fs-border px-4 py-2.5 text-sm text-fs-text disabled:opacity-50">{checking ? t("checking") : t("iPaid")}</button> : null}
    </div>
    <p className="mt-3 text-xs text-fs-muted">{t("howTo")}</p>
    {hint ? <p role="status" className="mt-3 text-sm text-fs-secondary">{hint}</p> : null}
  </section>;
}

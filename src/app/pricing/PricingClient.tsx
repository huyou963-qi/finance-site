"use client";

import type { quotePrice } from "@/lib/billing/config";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/i18n/format";
import { randomUUID } from "@/lib/randomId";
import { ZpayCheckout, usePaymentStatusLabel, type OnlineCheckout } from "@/components/billing/ZpayCheckout";
import {
  CREDIT_PACK_CNY,
  CREDIT_PACK_CREDITS,
  PLAN_FEATURES,
  TRIAL_DAYS,
} from "@/lib/billing/pricing";

const PERIOD_DAYS = { month: 30, quarter: 90, year: 365 } as const;
const TIERS = ["visitor", "standard", "pro"] as const;

type Order = {
  id: string;
  orderNo: string;
  productType: string;
  amountCny: number;
  status: string;
  createdAt: string;
  channel: string;
  paymentMethod: string;
  expiresAt: string;
};

type PaymentHints = {
  wechatHint: string;
  alipayHint: string;
  transferHint: string;
  wechatQrUrl: string;
  alipayQrUrl: string;
};

export function PricingClient() {
  const t = useTranslations("pricing");
  const locale = useLocale();
  const statusLabel = usePaymentStatusLabel();
  const money = (yuan: number) => formatNumber(yuan, locale, { style: "currency", currency: "CNY" });
  // 套餐名与卖点由管理员用中文配置；英文界面按产品类型显示固定英文
  const offerName = (o: ReturnType<typeof quotePrice>) =>
    locale === "en" ? t(`offers.${o.productType}.name`) : o.name;
  const offerTagline = (o: ReturnType<typeof quotePrice>) =>
    locale === "en" ? t(`offers.${o.productType}.tagline`) : o.tagline;
  const campaignName = (name: string | undefined) => (locale === "en" ? t("promotion") : name);
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasPro, setHasPro] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{
    order: Order;
    payment: PaymentHints;
  } | null>(null);
  const [offers, setOffers] = useState<ReturnType<typeof quotePrice>[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [onlineMethods, setOnlineMethods] = useState<string[]>([]);
  const [method, setMethod] = useState("alipay");
  const [onlineCheckout, setOnlineCheckout] = useState<OnlineCheckout | null>(null);
  const [requestKey, setRequestKey] = useState<{ product: string; method: string; key: string } | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setLoggedIn(false);
        setHasPro(false);
        return;
      }
      const j = (await res.json()) as {
        user?: { hasProAccess?: boolean; trialEndsAt?: string | null };
      };
      setLoggedIn(Boolean(j.user));
      setHasPro(Boolean(j.user?.hasProAccess));
      setTrialEndsAt(j.user?.trialEndsAt ?? null);
    } catch {
      setLoggedIn(false);
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/orders", { cache: "no-store" });
      if (!res.ok) throw new Error(t("catalogFailed"));
      const j = (await res.json()) as { orders?: Order[]; onlineMethods?: string[]; offers?: ReturnType<typeof quotePrice>[] };
      setOffers(j.offers ?? []); setCatalogReady(true);
      setOrders(j.orders ?? []);
      setOnlineMethods(j.onlineMethods ?? []);
    } catch {
      setCatalogReady(false); setHint(t("catalogRetry"));
    }
  }, [t]);

  useEffect(() => {
    void refreshMe();
    void refreshOrders();
  }, [refreshMe, refreshOrders]);

  const onPaid = useCallback(() => { void refreshMe(); void refreshOrders(); }, [refreshMe, refreshOrders]);

  async function resumeOrder(orderId: string) {
    setBusy(orderId); setHint(null);
    try {
      const res = await fetch("/api/billing/zpay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("resumeFailedCheck"));
      setOnlineCheckout(data); setCheckout(null);
    } catch (e) { setHint(e instanceof Error ? e.message : t("resumeFailed")); }
    finally { setBusy(null); }
  }

  const createOrder = async (productType: "pro_month" | "pro_quarter" | "pro_year" | "credits") => {
    setHint(null);
    if (!loggedIn) {
      setHint(t("loginFirst"));
      return;
    }
    setBusy(productType);
    try {
      if (onlineMethods.length) {
        const selected = onlineMethods.includes(method) ? method : onlineMethods[0];
        const pending = orders.find(o => o.productType === productType && o.channel === "zpay" && o.status === "pending" && o.paymentMethod === selected && new Date(o.expiresAt).getTime() > Date.now());
        if (pending) { await resumeOrder(pending.id); return; }
        const key = requestKey?.product === productType && requestKey.method === selected ? requestKey.key : randomUUID();
        setRequestKey({ product: productType, method: selected, key });
        const res = await fetch("/api/billing/zpay/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productType, method: selected, idempotencyKey: key }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("orderIncomplete"));
        setOnlineCheckout(data); setCheckout(null); setRequestKey(null);
        await refreshOrders(); return;
      }
      const res = await fetch("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productType }),
      });
      const j = (await res.json()) as {
        order?: Order;
        payment?: PaymentHints;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      if (!j.order || !j.payment) throw new Error(t("orderFailed"));
      setCheckout({ order: j.order, payment: j.payment });
      await refreshOrders();
    } catch (e) {
      setHint(e instanceof Error ? e.message : t("orderFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-fs-muted">
        GekkoTech Pro
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fs-text">
        {t("headline")}
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fs-secondary">
        {t("intro", { days: TRIAL_DAYS })}
      </p>
      {locale === "en" ? (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fs-secondary">{t("currencyNote")}</p>
      ) : null}
      {hasPro ? (
        <p className="mt-3 rounded-md border border-fs-accent/30 bg-fs-accent-soft px-3 py-2 text-sm text-fs-accent-text">
          {t("hasPro")}
          {trialEndsAt ? t("trialUntil", { date: trialEndsAt.slice(0, 10) }) : ""}
          {t.rich("seeExpiry", {
            link: (chunks) => (
              <Link href="/auth" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-fs-secondary">
        {onlineMethods.length ? <><span>{t("onlineMethod")}</span><select aria-label={t("onlineMethod")} value={onlineMethods.includes(method) ? method : onlineMethods[0]} onChange={e => setMethod(e.target.value)} className="rounded border border-fs-border bg-white px-3 py-2">{onlineMethods.map(v => <option key={v} value={v}>{v === "alipay" ? t("alipay") : t("wechatPay")}</option>)}</select><span className="text-xs">{t("autoActivate")}</span></> : <span>{t("manualOnly")}</span>}
      </div>
      <ZpayCheckout initial={onlineCheckout} onPaid={onPaid} />
      {!catalogReady && <p className="mt-6 text-sm text-fs-muted">{t("loadingPlans")}</p>}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {offers.map(offer => <article key={offer.productType} className="rounded-xl border border-fs-border bg-fs-bg p-6"><h2 className="text-sm font-medium text-fs-text">{offerName(offer)}</h2><p className="mt-2 text-3xl font-semibold text-fs-text">{money(offer.amountCents / 100)}</p><p className="mt-2 text-xs text-fs-muted">{t("period", { days: PERIOD_DAYS[offer.period ?? "year"] })}</p>{offer.discountCents > 0 && <p className="mt-2 text-xs text-fs-accent-text"><del className="mr-2 text-fs-muted">{money(offer.baseCents / 100)}</del>{campaignName(offer.campaign?.name)} · {t("save", { amount: money(offer.discountCents / 100) })}</p>}<p className="mt-3 text-xs text-fs-muted">{offerTagline(offer)}</p><button disabled={busy !== null || !catalogReady} onClick={() => void createOrder(offer.productType)} className="mt-5 w-full rounded-lg bg-fs-accent px-4 py-2.5 text-sm text-white disabled:opacity-50">{busy === offer.productType ? t("creatingOrder") : t("choose", { name: offerName(offer) })}</button></article>)}
      </div>
      <p className="mt-3 text-xs text-fs-muted">{t("offerNote")}</p>

      <div className="mt-4 rounded-xl border border-fs-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-fs-text">{t("creditPack")}</p>
            <p className="mt-1 text-xs text-fs-muted">
              {t("creditPackDetail", { credits: CREDIT_PACK_CREDITS, price: money(CREDIT_PACK_CNY) })}
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null || !catalogReady}
            onClick={() => void createOrder("credits")}
            className="rounded-md border border-fs-border px-4 py-2 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-50"
          >
            {busy === "credits" ? t("creatingOrder") : t("buyCredits")}
          </button>
        </div>
      </div>

      {!loggedIn ? (
        <p className="mt-4 text-sm text-fs-muted">
          {t.rich("loginToOrder", {
            days: TRIAL_DAYS,
            login: (chunks) => (
              <Link href="/auth" className="text-fs-accent-text underline">
                {chunks}
              </Link>
            ),
            register: (chunks) => (
              <Link href="/auth?register=1" className="text-fs-accent-text underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      {hint ? <p className="mt-3 text-sm text-fs-negative">{hint}</p> : null}

      {checkout ? (
        <div className="mt-8 rounded-xl border border-fs-border bg-fs-elevated/50 p-6">
          <h2 className="text-lg font-semibold text-fs-text">{t("paymentGuide")}</h2>
          <p className="mt-2 text-sm text-fs-secondary">
            {t.rich("orderLine", {
              no: () => (
                <span className="font-mono text-base font-semibold text-fs-text">
                  {checkout.order.orderNo}
                </span>
              ),
              amount: () => <strong>{money(checkout.order.amountCny)}</strong>,
            })}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-fs-secondary">
            <li>{checkout.payment.wechatHint}</li>
            <li>{checkout.payment.alipayHint}</li>
            <li className="font-medium text-fs-text">{checkout.payment.transferHint}</li>
          </ul>
          {(checkout.payment.wechatQrUrl || checkout.payment.alipayQrUrl) && (
            <div className="mt-4 flex flex-wrap gap-4">
              {checkout.payment.wechatQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={checkout.payment.wechatQrUrl}
                  alt={t("wechatQr")}
                  className="h-40 w-40 rounded-md border border-fs-border bg-white object-contain"
                />
              ) : null}
              {checkout.payment.alipayQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={checkout.payment.alipayQrUrl}
                  alt={t("alipayQr")}
                  className="h-40 w-40 rounded-md border border-fs-border bg-white object-contain"
                />
              ) : null}
            </div>
          )}
          <p className="mt-4 text-xs text-fs-muted">
            {t("transferNote")}
          </p>
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {TIERS.map((tier) => (
          <div key={tier} className="rounded-lg border border-fs-border p-4">
            <h3 className="text-sm font-semibold text-fs-text">
              {tier === "visitor" ? t("tierVisitor") : tier === "standard" ? t("tierStandard") : t("tierPro")}
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-fs-secondary">
              {PLAN_FEATURES[tier].map((_, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fs-accent" />
                  <span>{t(`features.${tier}.${i}` as Parameters<typeof t>[0])}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-fs-muted">
        {t("disclaimer")}
      </p>

      {orders.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-fs-text">{t("myOrders")}</h2>
          <ul className="mt-3 divide-y divide-fs-border rounded-lg border border-fs-border">
            {orders.slice(0, 8).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-fs-secondary"
              >
                <span className="font-mono text-fs-text">{o.orderNo}</span>
                <span>
                  {o.productType} · {money(o.amountCny)}
                </span>
                <span>{statusLabel(o.status)}</span>
                {o.channel === "zpay" ? <div className="flex flex-wrap gap-2">{o.status === "pending" ? <button type="button" disabled={busy !== null} onClick={() => void resumeOrder(o.id)} className="rounded border border-fs-border px-2 py-2 disabled:opacity-50">{t("continuePayment")}</button> : null}<button type="button" onClick={() => { void fetch(`/api/billing/orders/${encodeURIComponent(o.id)}`, { method: "POST" }).then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); setOnlineCheckout({ order: data.order }); onPaid(); }).catch(() => setHint(t("checkFailed"))); }} className="rounded border border-fs-border px-2 py-2">{t("checkStatus")}</button></div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

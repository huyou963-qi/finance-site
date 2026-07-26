"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CREDIT_PACK_CNY,
  CREDIT_PACK_CREDITS,
  PLAN_FEATURES,
  PRICE_MONTHLY_CNY,
  PRICE_YEARLY_CNY,
  PRICE_YEARLY_LIST_CNY,
  TRIAL_DAYS,
} from "@/lib/billing/pricing";

type Order = {
  id: string;
  orderNo: string;
  productType: string;
  amountCny: number;
  status: string;
  createdAt: string;
};

type PaymentHints = {
  wechatHint: string;
  alipayHint: string;
  transferHint: string;
  wechatQrUrl: string;
  alipayQrUrl: string;
};

export function PricingClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [hasPro, setHasPro] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<{
    order: Order;
    payment: PaymentHints;
  } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

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
      if (!res.ok) return;
      const j = (await res.json()) as { orders?: Order[] };
      setOrders(j.orders ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshMe();
    void refreshOrders();
  }, [refreshMe, refreshOrders]);

  const createOrder = async (productType: "pro_month" | "pro_year" | "credits") => {
    setHint(null);
    if (!loggedIn) {
      setHint("请先登录后再下单");
      return;
    }
    setBusy(productType);
    try {
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
      if (!j.order || !j.payment) throw new Error("下单失败");
      setCheckout({ order: j.order, payment: j.payment });
      await refreshOrders();
    } catch (e) {
      setHint(e instanceof Error ? e.message : "下单失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-fs-muted">
        Finova Pro
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fs-text">
        美股研究工作台 · 宏观到因子
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fs-secondary">
        面向中文用户的美股研究订阅。非实时行情、不含交易下单。新账户注册后享{" "}
        {TRIAL_DAYS} 天 Pro 试用；早期价，功能持续完善后可能调整。
      </p>
      {hasPro ? (
        <p className="mt-3 rounded-md border border-fs-accent/30 bg-fs-accent-soft px-3 py-2 text-sm text-fs-accent-text">
          当前已具备 Pro 能力
          {trialEndsAt ? `（试用至 ${trialEndsAt.slice(0, 10)}）` : ""}。可在{" "}
          <Link href="/auth" className="underline">
            个人账户
          </Link>{" "}
          查看到期日。
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-fs-border bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-fs-muted">月付</p>
          <p className="mt-2 text-3xl font-semibold text-fs-text">
            ¥{PRICE_MONTHLY_CNY}
            <span className="text-base font-normal text-fs-muted"> / 月</span>
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void createOrder("pro_month")}
            className="mt-5 w-full rounded-md bg-fs-text px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "pro_month" ? "创建订单…" : "选择月付"}
          </button>
        </div>
        <div className="rounded-xl border border-fs-accent/40 bg-fs-accent-soft/40 p-6 shadow-sm ring-1 ring-fs-accent/20">
          <p className="text-sm font-medium text-fs-accent-text">年付 · 省 10%</p>
          <p className="mt-2 text-3xl font-semibold text-fs-text">
            ¥{PRICE_YEARLY_CNY}
            <span className="text-base font-normal text-fs-muted"> / 年</span>
          </p>
          <p className="mt-1 text-xs text-fs-muted line-through">¥{PRICE_YEARLY_LIST_CNY}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void createOrder("pro_year")}
            className="mt-5 w-full rounded-md bg-fs-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "pro_year" ? "创建订单…" : "选择年付"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-fs-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-fs-text">回测积分包</p>
            <p className="mt-1 text-xs text-fs-muted">
              {CREDIT_PACK_CREDITS} 次回测 · ¥{CREDIT_PACK_CNY}（非 Pro 可用积分抵扣回测）
            </p>
          </div>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void createOrder("credits")}
            className="rounded-md border border-fs-border px-4 py-2 text-sm text-fs-text hover:bg-fs-elevated disabled:opacity-50"
          >
            {busy === "credits" ? "创建订单…" : "购买积分"}
          </button>
        </div>
      </div>

      {!loggedIn ? (
        <p className="mt-4 text-sm text-fs-muted">
          下单前请先{" "}
          <Link href="/auth" className="text-fs-accent-text underline">
            登录
          </Link>{" "}
          或{" "}
          <Link href="/auth?register=1" className="text-fs-accent-text underline">
            注册
          </Link>
          （注册即送 {TRIAL_DAYS} 天试用）。
        </p>
      ) : null}
      {hint ? <p className="mt-3 text-sm text-fs-negative">{hint}</p> : null}

      {checkout ? (
        <div className="mt-8 rounded-xl border border-fs-border bg-fs-elevated/50 p-6">
          <h2 className="text-lg font-semibold text-fs-text">付款指引</h2>
          <p className="mt-2 text-sm text-fs-secondary">
            订单号{" "}
            <span className="font-mono text-base font-semibold text-fs-text">
              {checkout.order.orderNo}
            </span>
            ，金额 <strong>¥{checkout.order.amountCny}</strong>
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
                  alt="微信收款码"
                  className="h-40 w-40 rounded-md border border-fs-border bg-white object-contain"
                />
              ) : null}
              {checkout.payment.alipayQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={checkout.payment.alipayQrUrl}
                  alt="支付宝收款码"
                  className="h-40 w-40 rounded-md border border-fs-border bg-white object-contain"
                />
              ) : null}
            </div>
          )}
          <p className="mt-4 text-xs text-fs-muted">
            转账后请保留截图；管理员确认到账后自动开通。也可在个人账户查看订单状态。
          </p>
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {(
          [
            ["访客", PLAN_FEATURES.visitor],
            ["免费登录", PLAN_FEATURES.standard],
            ["Pro", PLAN_FEATURES.pro],
          ] as const
        ).map(([title, items]) => (
          <div key={title} className="rounded-lg border border-fs-border p-4">
            <h3 className="text-sm font-semibold text-fs-text">{title}</h3>
            <ul className="mt-3 space-y-2 text-xs text-fs-secondary">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fs-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-fs-muted">
        免责声明：本站内容与工具仅供研究学习，不构成任何投资建议。投资有风险，决策需独立判断。
      </p>

      {orders.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-fs-text">我的订单</h2>
          <ul className="mt-3 divide-y divide-fs-border rounded-lg border border-fs-border">
            {orders.slice(0, 8).map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-fs-secondary"
              >
                <span className="font-mono text-fs-text">{o.orderNo}</span>
                <span>
                  {o.productType} · ¥{o.amountCny}
                </span>
                <span>{o.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

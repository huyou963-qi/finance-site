"use client";

import { useCallback, useEffect, useState } from "react";

type OrderRow = {
  id: string;
  orderNo: string;
  username: string;
  email: string;
  productType: string;
  amountCny: number;
  credits: number;
  status: string;
  createdAt: string;
  paidAt: string;
};

export function AdminOrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("pending");
  const [hint, setHint] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orderNoInput, setOrderNoInput] = useState("");

  const load = useCallback(async () => {
    setHint(null);
    const sp = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await fetch(`/api/admin/orders${sp}`, { cache: "no-store" });
    const j = (await res.json()) as { orders?: OrderRow[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    setOrders(j.orders ?? []);
  }, [status]);

  useEffect(() => {
    load().catch((e) => setHint(e instanceof Error ? e.message : "加载失败"));
  }, [load]);

  const confirm = async (orderId?: string, orderNo?: string) => {
    setBusyId(orderId ?? orderNo ?? "x");
    setHint(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderId ? { orderId } : { orderNo }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setHint("已确认收款并开通");
      setOrderNoInput("");
      await load();
    } catch (e) {
      setHint(e instanceof Error ? e.message : "确认失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-xl font-semibold text-fs-text">订单确认</h1>
      <p className="mt-1 text-sm text-fs-muted">
        用户个人转账后，在此按订单号确认收款并开通 Pro / 积分。
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-fs-secondary">
          状态筛选
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ml-2 rounded border border-fs-border bg-white px-2 py-1.5 text-sm"
          >
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="expired">expired</option>
            <option value="">全部</option>
          </select>
        </label>
        <label className="text-sm text-fs-secondary">
          按订单号确认
          <input
            value={orderNoInput}
            onChange={(e) => setOrderNoInput(e.target.value.toUpperCase())}
            placeholder="FN-XXXXXX"
            className="ml-2 rounded border border-fs-border px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!orderNoInput.trim() || busyId !== null}
          onClick={() => void confirm(undefined, orderNoInput.trim())}
          className="rounded-md bg-fs-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          确认开通
        </button>
      </div>

      {hint ? <p className="mt-3 text-sm text-fs-muted">{hint}</p> : null}

      <div className="mt-6 overflow-x-auto rounded-lg border border-fs-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-fs-elevated text-xs text-fs-muted">
            <tr>
              <th className="px-3 py-2">订单号</th>
              <th className="px-3 py-2">用户</th>
              <th className="px-3 py-2">商品</th>
              <th className="px-3 py-2">金额</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-fs-border">
                <td className="px-3 py-2 font-mono text-xs">{o.orderNo}</td>
                <td className="px-3 py-2">
                  {o.username}
                  <div className="text-xs text-fs-muted">{o.email}</div>
                </td>
                <td className="px-3 py-2">
                  {o.productType}
                  {o.credits ? ` (+${o.credits}分)` : ""}
                </td>
                <td className="px-3 py-2">¥{o.amountCny}</td>
                <td className="px-3 py-2">{o.status}</td>
                <td className="px-3 py-2 text-xs text-fs-muted">
                  {o.createdAt.slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-3 py-2">
                  {o.status === "pending" ? (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void confirm(o.id)}
                      className="rounded border border-fs-accent/40 px-2 py-1 text-xs text-fs-accent-text hover:bg-fs-accent-soft disabled:opacity-50"
                    >
                      {busyId === o.id ? "…" : "确认收款"}
                    </button>
                  ) : (
                    <span className="text-xs text-fs-muted">{o.paidAt ? o.paidAt.slice(0, 10) : "—"}</span>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-fs-muted">
                  暂无订单
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

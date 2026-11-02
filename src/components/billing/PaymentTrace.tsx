"use client";
import { useState } from "react";
type Event = { id: string; kind: string; source: string; code: string; details: unknown; createdAt: string };
export function PaymentTrace({ orderId, online }: { orderId: string; online: boolean }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(recheck = false) {
    setBusy(true); setHint("");
    try {
      const url = `/api/admin/orders/${encodeURIComponent(orderId)}/events`;
      if (recheck) { const res = await fetch(url, { method: "POST" }); if (!res.ok) throw new Error("平台查单失败，请稍后重试"); }
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "读取失败");
      setEvents(data.events);
      if (recheck) setHint("已向平台核验，请刷新列表查看订单状态。");
    } catch (e) { setHint(e instanceof Error ? e.message : "读取失败"); }
    finally { setBusy(false); }
  }
  return <div className="mt-2 max-w-lg text-xs">
    <div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded border border-fs-border px-2 py-2" onClick={() => events ? setEvents(null) : void load()}>支付跟踪</button>{online ? <button disabled={busy} className="rounded border border-fs-border px-2 py-2" onClick={() => void load(true)}>平台查单</button> : null}</div>
    {hint ? <p role="status" className="mt-2">{hint}</p> : null}
    {events ? <ol className="mt-2 max-h-72 space-y-2 overflow-auto">{events.map(e => <li key={e.id} className="rounded border border-fs-border p-2"><p>{new Date(e.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · {e.kind} · {e.source} · {e.code}</p>{e.details ? <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(e.details, null, 2)}</pre> : null}</li>)}{!events.length ? <li>暂无跟踪记录（历史订单可能早于支付跟踪功能）。</li> : null}</ol> : null}
  </div>;
}

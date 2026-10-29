"use client";
import { useState } from "react";
import type { usePrivateEventPacks } from "@/lib/equity/usePrivateEventPacks";
export function PrivateEventDeliveryControls({ cloud }: { cloud: ReturnType<typeof usePrivateEventPacks> }) {
  const [packId, setPackId] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function credential(remove: boolean, id = packId) {
    setBusy(true); setToken(""); setMessage("");
    try {
      const r = await fetch("/api/user/event-packs/credential", { method: remove ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: cloud.userId, packId: id }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || "凭证操作失败");
      if (remove) setMessage(`已撤销 ${id} 的投递权限，已保存事件仍保留。`);
      else { setToken(data.token); setMessage(`凭证绑定 ${id}，30 天后过期；重新生成会立即替换旧凭证。`); }
      await cloud.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "凭证操作失败"); }
    finally { setBusy(false); }
  }
  return <section aria-label="Skill 私有投递" className="w-full space-y-2 rounded border border-fs-border p-2">
    <strong>Skill 私有投递</strong>
    {cloud.userId === "anon" ? <p>登录后可创建私有投递凭证。文件导入仍可在本浏览器使用。</p> : <>
      <div className="flex flex-wrap items-center gap-2"><span role="status">{cloud.loading ? "正在同步…" : cloud.syncedAt ? `已同步 ${cloud.packs.length} 个云端包` : "尚未完成云端同步"}</span><button className="min-h-10 rounded border border-fs-border px-2" onClick={() => void cloud.refresh()}>刷新云端事件</button></div>
      {cloud.error && <p role="alert">{cloud.error}。已加载内容可能不是最新版本；本地事件仍可使用。</p>}
      <p className="text-fs-muted">页面可见时每 30 秒检查更新。已同步不代表符合当前筛选或已经上图，具体原因请查看“结果说明”。</p>
      <label className="block">稳定包 ID<input aria-label="投递包 ID" className="mt-1 block min-h-10 w-full rounded border border-fs-border bg-fs-bg px-2" maxLength={128} placeholder="例如 gold-geopolitics" value={packId} onChange={e => { setPackId(e.target.value); setToken(""); }} /></label>
      <button className="min-h-10 rounded border border-fs-border px-2" disabled={busy || !packId} onClick={() => void credential(false)}>生成或替换投递凭证</button>
      {token && <label className="block">仅本次显示，请交给可信的 Skill 执行环境<input aria-label="新投递凭证" className="mt-1 block min-h-10 w-full rounded border border-fs-border bg-fs-bg px-2 font-mono" readOnly value={token} onFocus={e => e.currentTarget.select()} /></label>}
      {message && <p role="status" className="break-words">{message}</p>}
      {cloud.credentials.map(c => <div key={c.packId} className="flex flex-wrap items-center gap-2"><span className="break-all">{c.packId} · 有效至 {c.expiresAt.slice(0, 10)}</span><button disabled={busy} className="min-h-10 rounded border border-fs-border px-2" onClick={() => void credential(true, c.packId)}>撤销 {c.packId} 凭证</button></div>)}
      <p className="text-fs-muted">凭证只能写入绑定包，不能读取账号事件。请勿放入研究 JSON 或聊天截图。持续采集须在 Skill 执行环境另行安排任务。</p>
      <a className="inline-flex min-h-10 items-center text-fs-accent-text" href="/templates/company-milestone/PRIVATE_DELIVERY.md" target="_blank" rel="noreferrer">查看 Skill 投递协议与重试方法</a>
    </>}
  </section>;
}

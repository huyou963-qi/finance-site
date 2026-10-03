"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type User = {
  id: string; username: string; email: string; phone: string; emailVerifiedAt: string | null;
  wechatBound: boolean; role: string; tags: string[]; adminMfaEnabled: boolean; status: string; suspendedAt: string | null;
  suspensionReason: string | null; plan: string; planExpiresAt: string | null;
  trialEndsAt: string | null; creditBalance: number; sessionCount: number; createdAt: string; lastLoginAt: string | null;
};
type Detail = {
  user: User;
  orders: { orderNo: string; productType: string; status: string; amountCny: number; paidAt: string | null; confirmedBy: string | null; createdAt: string }[];
  credits: { reason: string; delta: number; balanceAfter: number; orderNo: string | null; note: string | null; createdAt: string }[];
  audits: { action: string; actorUsername: string; reason: string | null; before: unknown; after: unknown; createdAt: string }[];
  authEvents: { kind: string; createdAt: string }[];
};

const inputClass = "mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-sm text-fs-text";

function localDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function localDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

const ACTION_LABELS: Record<string, string> = {
  create: "创建用户", update: "修改资料或权益", suspend: "停用账号",
  reactivate: "恢复账号", close: "关闭账号", "revoke-sessions": "撤销会话",
  "send-reset-link": "发送密码重置链接", "reset-admin-mfa": "重置管理员双重验证",
  "membership-set": "设置 Pro 到期日", "membership-extend": "延长 Pro", "membership-revoke": "撤销 Pro", "credit-adjust": "调整积分", "tag-add": "添加标签", "tag-remove": "移除标签", "order-confirm": "确认订单收款",
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待支付", paid: "已支付", cancelled: "已取消", expired: "已过期",
};
const PRODUCT_LABELS: Record<string, string> = {
  pro_month: "Pro 月度", pro_year: "Pro 年度", credits: "积分包",
};

export function AdminUserDetailClient({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState({ email: "", phone: "", role: "user" });
  const [membership, setMembership] = useState({ action: "set" as "set" | "extend" | "revoke", expiresOn: "", days: 30, delta: 0 });
  const [reason, setReason] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminTotpCode, setAdminTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { cache: "no-store" });
    const payload = (await response.json()) as Detail & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "加载失败");
    setDetail(payload);
    setDraft({ email: payload.user.email, phone: payload.user.phone, role: payload.user.role });
  }, [userId]);

  useEffect(() => { void load().catch((error) => setHint(error instanceof Error ? error.message : "加载失败")); }, [load]);
  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ user?: { id?: string } }>)
      .then((payload: { user?: { id?: string; role?: string } }) => { setCurrentUserId(payload.user?.id ?? null); setMyRole(payload.user?.role ?? ""); })
      .catch(() => setCurrentUserId(null));
  }, []);

  async function submit(action: "update" | "suspend" | "reactivate" | "close" | "revoke-sessions" | "send-reset-link" | "reset-admin-mfa") {
    if (!reason.trim() || !adminPassword || adminTotpCode.length !== 6) {
      setHint("请填写操作原因、你的管理员密码和动态验证码");
      return;
    }
    if (action === "suspend" && !window.confirm("停用后该用户将立即退出所有设备。确定继续？")) return;
    if (action === "close" && !window.confirm("关闭后账号将无法登录，订单与审计记录仍会保留。确定继续？")) return;
    if (action === "reset-admin-mfa" && !window.confirm("重置后该管理员须重新绑定验证器，所有设备将退出。确定继续？")) return;
    setBusy(true);
    setHint(null);
    try {
      const response = await fetch(action === "update" ? `/api/admin/users/${encodeURIComponent(userId)}` : `/api/admin/users/${encodeURIComponent(userId)}/actions`, {
        method: action === "update" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(action === "update" ? draft : { action }), reason, adminPassword, adminTotpCode }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "操作失败");
      setReason("");
      setAdminPassword("");
      setAdminTotpCode("");
      await load();
      setHint({ update: "资料已更新", suspend: "账号已停用", reactivate: "账号已恢复", close: "账号已关闭", "revoke-sessions": "所有会话已撤销", "send-reset-link": "重置链接已发送", "reset-admin-mfa": "双重验证已重置，用户下次登录须重新绑定" }[action]);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitMembership(kind: "membership" | "credits") {
    if (!reason.trim() || !adminPassword || adminTotpCode.length !== 6) { setHint("请填写操作原因、你的管理员密码和动态验证码"); return; }
    const description = kind === "credits" ? `调整 ${membership.delta} 积分` : membership.action === "revoke" ? "撤销 Pro" : membership.action === "extend" ? `延长 Pro ${membership.days} 天` : `设置 Pro 到期日为 ${membership.expiresOn}`;
    if (!window.confirm(`确认${description}？此操作将写入审计记录。`)) return;
    setBusy(true); setHint(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/membership`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...membership, reason, adminPassword, adminTotpCode }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "操作失败");
      setReason(""); setAdminPassword(""); setAdminTotpCode(""); await load(); setHint(`${description}已完成`);
    } catch (error) { setHint(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 lg:px-6">
      <Link href="/admin/users" className="text-sm text-fs-accent-text hover:underline">← 返回用户列表</Link>
      <div>
        <h1 className="text-2xl font-semibold text-fs-text">{detail?.user.username ?? "用户详情"}</h1>
        <p className="mt-1 break-all text-xs text-fs-muted">用户 ID：{userId}</p>
      </div>
      {hint ? <p role="status" className="rounded-md border border-fs-border p-3 text-sm text-fs-secondary">{hint}</p> : null}
      {!detail ? <p className="text-sm text-fs-muted">加载中…</p> : (
        <>
          <section className="grid gap-3 rounded-lg border border-fs-border p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Info label="邮箱" value={`${detail.user.email || "—"}${detail.user.emailVerifiedAt ? "（已验证）" : "（未验证）"}`} />
            <Info label="手机号" value={detail.user.phone || "—"} />
            <Info label="微信" value={detail.user.wechatBound ? "已绑定" : "未绑定"} />
            <Info label="账号状态" value={detail.user.status === "active" ? "正常" : `${detail.user.status === "closed" ? "已关闭" : "已停用"} · ${detail.user.suspensionReason ?? ""}`} />
            <Info label="会员" value={`${detail.user.plan === "pro" ? "Pro" : "普通"}${detail.user.planExpiresAt ? ` · 到期 ${localDate(detail.user.planExpiresAt)}` : ""}${detail.user.trialEndsAt ? ` · 试用至 ${localDate(detail.user.trialEndsAt)}` : ""}`} />
            <Info label="积分" value={String(detail.user.creditBalance)} />
            <Info label="有效会话" value={String(detail.user.sessionCount)} />
            <Info label="注册时间" value={localDateTime(detail.user.createdAt)} />
            <Info label="最近登录" value={detail.user.lastLoginAt ? localDateTime(detail.user.lastLoginAt) : "从未登录"} />
            <Info label="角色" value={{ admin: "最高管理员", admin_support: "客服只读", admin_membership: "会员运营", admin_orders: "订单处理", user: "普通用户" }[detail.user.role] ?? detail.user.role} />
            <Info label="标签" value={detail.user.tags.join("、") || "—"} />
            {detail.user.role.startsWith("admin") ? <Info label="双重验证" value={detail.user.adminMfaEnabled ? "已绑定" : "待绑定"} /> : null}
          </section>

          {detail.user.status === "closed" ? <p className="rounded-lg border border-fs-border p-4 text-sm text-fs-muted">账号已关闭，资料和权益不可再修改；订单与审计记录保留供核查。</p> : <>
          {myRole === "admin" ? <section className="rounded-lg border border-fs-border p-4">
            <h2 className="font-semibold text-fs-text">编辑资料与后台角色</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-fs-secondary">邮箱<input type="email" className={inputClass} value={draft.email} onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))} /></label>
              <label className="text-sm text-fs-secondary">手机号<input className={inputClass} value={draft.phone} onChange={(event) => setDraft((value) => ({ ...value, phone: event.target.value }))} /></label>
              <label className="text-sm text-fs-secondary">角色<select className={inputClass} value={draft.role} disabled={currentUserId === userId} onChange={(event) => setDraft((value) => ({ ...value, role: event.target.value }))}><option value="user">普通用户</option><option value="admin">最高管理员</option><option value="admin_support">客服只读</option><option value="admin_membership">会员运营</option><option value="admin_orders">订单处理</option></select></label>
            </div>
          </section> : null}

          {(myRole === "admin" || myRole === "admin_membership") ? <section className="rounded-lg border border-fs-border p-4">
            <h2 className="font-semibold text-fs-text">会员权益与积分</h2>
            <p className="mt-1 text-xs text-fs-muted">手工权益与付费订单分开记账；到期日按北京时间当天 23:59:59 计算。操作原因、密码与动态码填写在下方。</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-fs-secondary">Pro 操作<select className={inputClass} value={membership.action} onChange={(event) => setMembership((value) => ({ ...value, action: event.target.value as "set" | "extend" | "revoke" }))}><option value="set">设置到期日</option><option value="extend">延长天数</option><option value="revoke">撤销 Pro</option></select></label>
              {membership.action === "set" ? <label className="text-sm text-fs-secondary">到期日期<input type="date" className={inputClass} value={membership.expiresOn} onChange={(event) => setMembership((value) => ({ ...value, expiresOn: event.target.value }))} /></label> : null}
              {membership.action === "extend" ? <label className="text-sm text-fs-secondary">延长天数<input type="number" min={1} max={365} className={inputClass} value={membership.days} onChange={(event) => setMembership((value) => ({ ...value, days: Number(event.target.value) }))} /></label> : null}
              <label className="text-sm text-fs-secondary">积分增减<input type="number" min={-10000} max={10000} className={inputClass} value={membership.delta} onChange={(event) => setMembership((value) => ({ ...value, delta: Number(event.target.value) }))} /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void submitMembership("membership")} className="rounded-md bg-fs-accent px-3 py-2 text-sm text-white disabled:opacity-50">确认 Pro 操作</button><button disabled={busy} onClick={() => void submitMembership("credits")} className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary disabled:opacity-50">确认积分调整</button></div>
          </section> : null}

          {(myRole === "admin" || myRole === "admin_membership") ? <section className="rounded-lg border border-fs-border p-4">
            <h2 className="font-semibold text-fs-text">操作确认</h2>
            <p className="mt-1 text-xs text-fs-muted">以下操作需填写原因，并用你的管理员密码及验证器动态码确认。操作会记入审计记录。</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-fs-secondary sm:col-span-2">原因<input className={inputClass} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
              <label className="text-sm text-fs-secondary">你的管理员密码<input className={inputClass} type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} /></label>
              <label className="text-sm text-fs-secondary">你的动态验证码<input className={inputClass} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={adminTotpCode} onChange={(event) => setAdminTotpCode(event.target.value.replace(/\D/g, ""))} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {myRole === "admin" ? <button disabled={busy} onClick={() => void submit("update")} className="rounded-md bg-fs-accent px-3 py-2 text-sm text-white disabled:opacity-50">保存资料</button> : null}
              {myRole === "admin" ? <>
              <button disabled={busy} onClick={() => void submit("revoke-sessions")} className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary disabled:opacity-50">退出所有设备</button>
              <button disabled={busy} onClick={() => void submit("send-reset-link")} className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary disabled:opacity-50">发送密码重置链接</button>
              {detail.user.role.startsWith("admin") && detail.user.adminMfaEnabled && currentUserId !== userId ? <button disabled={busy} onClick={() => void submit("reset-admin-mfa")} className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary disabled:opacity-50">重置双重验证</button> : null}
              {detail.user.status === "active" && currentUserId !== userId ? (
                <button disabled={busy} onClick={() => void submit("suspend")} className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50">停用账号</button>
              ) : detail.user.status === "suspended" ? (
                <button disabled={busy} onClick={() => void submit("reactivate")} className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary disabled:opacity-50">恢复账号</button>
              ) : null}
              {currentUserId !== userId ? <button disabled={busy} onClick={() => void submit("close")} className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50">关闭账号</button> : null}
              </> : null}
            </div>
          </section> : null}
          </>}

          <section className="grid gap-4 lg:grid-cols-2">
            <History title="最近订单" rows={detail.orders.map((item) => `${localDate(item.createdAt)} · ${item.orderNo} · ${PRODUCT_LABELS[item.productType] ?? item.productType} · ¥${item.amountCny} · ${ORDER_STATUS_LABELS[item.status] ?? item.status}${item.paidAt ? ` · 支付 ${localDate(item.paidAt)}` : ""}${item.confirmedBy ? ` · 确认人 ${item.confirmedBy}` : ""}`)} />
            <History title="最近积分流水" rows={detail.credits.map((item) => `${localDate(item.createdAt)} · ${item.reason} · ${item.delta > 0 ? "+" : ""}${item.delta} · 余额 ${item.balanceAfter}${item.orderNo ? ` · 订单 ${item.orderNo}` : ""}${item.note ? ` · ${item.note}` : ""}`)} />
            <History title="最近账号事件" rows={detail.authEvents.map((item) => `${localDateTime(item.createdAt)} · ${{ password_login: "密码登录", wechat_login: "微信登录", recovery_code_login: "恢复码登录", admin_mfa_setup: "管理员双重验证绑定", password_reset: "密码重置" }[item.kind] ?? item.kind}`)} />
          </section>
          <section className="rounded-lg border border-fs-border p-4">
            <h2 className="font-semibold text-fs-text">管理操作审计</h2>
            <div className="mt-3 divide-y divide-fs-border text-sm">
              {detail.audits.length === 0 ? <p className="text-fs-muted">暂无记录</p> : detail.audits.map((entry, index) => <div key={`${entry.createdAt}-${index}`} className="py-3">
                <div className="text-fs-text">{ACTION_LABELS[entry.action] ?? entry.action} · {entry.actorUsername} · {localDateTime(entry.createdAt)}</div>
                <div className="mt-1 text-fs-secondary">原因：{entry.reason || "—"}</div>
                {entry.before || entry.after ? <details className="mt-1 text-xs text-fs-muted"><summary className="cursor-pointer">查看变更快照</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></details> : null}
              </div>)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-xs text-fs-muted">{label}</div><div className="mt-1 break-words text-fs-text">{value}</div></div>;
}

function History({ title, rows }: { title: string; rows: string[] }) {
  return <section className="rounded-lg border border-fs-border p-4"><h2 className="font-semibold text-fs-text">{title}</h2><div className="mt-3 space-y-2 text-sm text-fs-secondary">{rows.length ? rows.map((row, index) => <p key={index}>{row}</p>) : <p className="text-fs-muted">暂无记录</p>}</div></section>;
}

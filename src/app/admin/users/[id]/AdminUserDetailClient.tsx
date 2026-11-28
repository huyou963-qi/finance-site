"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@/i18n/navigation";
import type { AdminUserChanges } from "@/lib/auth/adminUsers";
import type { Role } from "@/lib/auth/types";

type User = {
  id: string; username: string; email: string; phone: string; emailVerifiedAt: string | null;
  wechatBound: boolean; role: string; tags: string[]; adminMfaEnabled: boolean; status: string; suspendedAt: string | null;
  suspensionReason: string | null; plan: string; planExpiresAt: string | null;
  trialEndsAt: string | null; creditBalance: number; sessionCount: number; createdAt: string; lastLoginAt: string | null;
};
type Detail = {
  user: User;
  researchQuota: { override: number | null; defaultLimit: number; limit: number; used: number; resetAt: string; paidProActive: boolean } | null;
  orders: { orderNo: string; productType: string; status: string; amountCny: number; paidAt: string | null; confirmedBy: string | null; createdAt: string }[];
  credits: { reason: string; delta: number; balanceAfter: number; orderNo: string | null; note: string | null; createdAt: string }[];
  audits: { action: string; actorUsername: string; reason: string | null; before: unknown; after: unknown; createdAt: string }[];
  authEvents: { kind: string; createdAt: string }[];
};

const inputClass = "mt-1 min-w-0 w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-sm text-fs-text disabled:opacity-50";
const primaryButton = "rounded-md bg-fs-accent px-4 py-2 text-sm text-white disabled:opacity-50";
const secondaryButton = "rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary disabled:opacity-50";
const dangerButton = "rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50";
const labelClass = "min-w-0 text-sm text-fs-secondary";
const initialMembership = { action: "" as "" | "set" | "extend" | "revoke", expiresOn: "", days: "30", delta: "", quota: "" };
const ROLE_LABELS: Record<Role, string> = {
  user: "普通用户", admin: "最高管理员", admin_support: "客服只读", admin_membership: "会员运营", admin_orders: "订单处理",
};

const ACCOUNT_ACTIONS = {
  "revoke-sessions": { label: "退出所有设备", description: "撤销该用户的所有登录会话。", success: "所有会话已撤销" },
  "send-reset-link": { label: "发送密码重置链接", description: "将重置链接发送到该用户的邮箱。", success: "重置链接已发送" },
  "reset-admin-mfa": { label: "重置双重验证", description: "该管理员会退出所有设备，下次登录时需要重新绑定验证器。", success: "双重验证已重置" },
  suspend: { label: "停用账号", description: "该用户会立即退出所有设备，恢复账号后可重新登录。", success: "账号已停用" },
  reactivate: { label: "恢复账号", description: "允许该用户重新登录。", success: "账号已恢复" },
  close: { label: "关闭账号", description: "该用户将无法登录，订单与审计记录仍会保留。", success: "账号已关闭" },
};
type AccountAction = keyof typeof ACCOUNT_ACTIONS;
type Confirmation = { changes: AdminUserChanges; summary: string[] } | { action: AccountAction };

function numberDraft(value: number | null) {
  return value === null ? "" : String(value);
}

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
  "research-quota-update": "调整 AI 月度额度",
  "membership-set": "设置 Pro 到期日", "membership-extend": "延长 Pro", "membership-revoke": "撤销 Pro", "credit-adjust": "调整积分", "tag-add": "添加标签", "tag-remove": "移除标签", "order-confirm": "确认订单收款",
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待支付", paid: "已支付", cancelled: "已取消", expired: "已过期",
};
const PRODUCT_LABELS: Record<string, string> = {
  pro_month: "Pro 月度", pro_quarter: "Pro 季度", pro_year: "Pro 年度", credits: "积分包",
};

export function AdminUserDetailClient({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState({ email: "", phone: "", role: "user" as Role });
  const [membership, setMembership] = useState(initialMembership);
  const [pending, setPending] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id?: string; role?: string }>({});
  const endpoint = `/api/admin/users/${encodeURIComponent(userId)}`;

  const load = useCallback(async (resetDraft = true) => {
    const response = await fetch(endpoint, { cache: "no-store" });
    const payload = (await response.json()) as Detail & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "加载失败");
    setDetail(payload);
    if (resetDraft) {
      setDraft({ email: payload.user.email, phone: payload.user.phone, role: payload.user.role as Role });
      setMembership({ ...initialMembership, quota: numberDraft(payload.researchQuota?.override ?? null) });
    }
  }, [endpoint]);

  useEffect(() => { void load().catch((error) => setHint(error instanceof Error ? error.message : "加载失败")); }, [load]);
  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ user?: { id?: string; role?: string } }>)
      .then((payload) => setViewer(payload.user ?? {}))
      .catch(() => setViewer({}));
  }, []);

  const user = detail?.user;
  const quota = detail?.researchQuota;
  const canEditProfile = viewer.role === "admin";
  const canEditQuota = quota && (membership.action === "set" || membership.action === "extend"
    || (membership.action !== "revoke" && quota.paidProActive));
  const quotaValue = membership.quota.trim() ? Number(membership.quota) : null;
  const changes: AdminUserChanges = {};
  const summary: string[] = [];

  if (user && canEditProfile) {
    const profile: NonNullable<AdminUserChanges["profile"]> = {};
    if (draft.email.trim() !== user.email) {
      profile.email = draft.email.trim();
      summary.push(`邮箱更新为 ${profile.email || "空"}`);
    }
    if (draft.phone.trim() !== user.phone) {
      profile.phone = draft.phone.trim();
      summary.push(`手机号更新为 ${profile.phone || "空"}`);
    }
    if (viewer.id !== userId && draft.role !== user.role) {
      profile.role = draft.role;
      summary.push(`角色调整为 ${ROLE_LABELS[draft.role]}`);
    }
    if (Object.keys(profile).length) changes.profile = profile;
  }
  if (quota) {
    if (membership.action === "set") {
      changes.membership = { action: "set", expiresOn: membership.expiresOn };
      summary.push(`设置 Pro 到期日为 ${membership.expiresOn}`);
    } else if (membership.action === "extend") {
      changes.membership = { action: "extend", days: Number(membership.days) };
      summary.push(`延长 Pro ${membership.days} 天`);
    } else if (membership.action === "revoke") {
      changes.membership = { action: "revoke" };
      summary.push("撤销 Pro");
    }
    const delta = Number(membership.delta);
    if (delta) {
      changes.creditDelta = delta;
      summary.push(delta > 0 ? `增加 ${delta} 积分` : `扣减 ${-delta} 积分`);
    }
    if (canEditQuota && quotaValue !== quota.override) {
      changes.researchMonthlyPoints = quotaValue;
      summary.push(quotaValue === null ? `恢复默认 AI 月度额度（${quota.defaultLimit} 点）` : `设置 AI 月度额度为 ${quotaValue} 点`);
    }
  }

  function openConfirmation(next: Confirmation) {
    setHint(null);
    setConfirmationError(null);
    setPending(next);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || busy) return;
    const fields = new FormData(event.currentTarget);
    const credentials = {
      reason: String(fields.get("reason") ?? "").trim(),
      adminPassword: String(fields.get("adminPassword") ?? ""),
      adminTotpCode: String(fields.get("adminTotpCode") ?? ""),
    };
    if (!credentials.reason) {
      setConfirmationError("请填写操作原因");
      return;
    }
    setBusy(true);
    setConfirmationError(null);
    const editing = "changes" in pending;
    try {
      const response = await fetch(editing ? endpoint : `${endpoint}/actions`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(editing ? { changes: pending.changes } : { action: pending.action }), ...credentials }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "操作失败");
      }
      const success = editing ? "变更已保存" : ACCOUNT_ACTIONS[pending.action].success;
      setPending(null);
      if (editing) {
        setMembership(initialMembership);
        setDetail(null);
      }
      try {
        await load(editing);
        setHint(success);
      } catch {
        setHint(`${success}。暂时无法刷新详情，请重新加载页面。`);
      }
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 lg:px-6">
      <Link href="/admin/users" className="text-sm text-fs-accent-text hover:underline">← 返回用户列表</Link>
      <div>
        <h1 className="text-2xl font-semibold text-fs-text">{detail?.user.username ?? "用户详情"}</h1>
        <p className="mt-1 break-all text-xs text-fs-muted">用户 ID：{userId}</p>
      </div>
      {hint ? <p role="status" className="rounded-md border border-fs-border p-3 text-sm text-fs-secondary">{hint}</p> : null}
      {!detail ? (!hint && <p className="text-sm text-fs-muted">加载中…</p>) : (
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
            <Info label="角色" value={ROLE_LABELS[detail.user.role as Role] ?? detail.user.role} />
            <Info label="标签" value={detail.user.tags.join("、") || "—"} />
            {detail.user.role.startsWith("admin") ? <Info label="双重验证" value={detail.user.adminMfaEnabled ? "已绑定" : "待绑定"} /> : null}
          </section>

          {detail.user.status === "closed" ? (
            <p className="rounded-lg border border-fs-border p-4 text-sm text-fs-muted">账号已关闭，资料和权益不可再修改。</p>
          ) : (canEditProfile || quota) && (
            <>
              <form
                className="divide-y divide-fs-border rounded-lg border border-fs-border"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (summary.length) openConfirmation({ changes, summary });
                }}
              >
                {canEditProfile && (
                  <section aria-labelledby="profile-heading" className="p-4 sm:p-5">
                    <h2 id="profile-heading" className="font-semibold text-fs-text">账号资料</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className={labelClass}>邮箱
                        <input type="email" autoComplete="off" className={inputClass} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                      </label>
                      <label className={labelClass}>手机号
                        <input type="tel" autoComplete="off" className={inputClass} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
                      </label>
                      <label className={labelClass}>后台角色
                        <select className={inputClass} value={draft.role} disabled={viewer.id === userId} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>
                          {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>
                )}
                {quota && (
                  <section aria-labelledby="membership-heading" className="p-4 sm:p-5">
                    <h2 id="membership-heading" className="font-semibold text-fs-text">会员管理</h2>
                    <div className="mt-3 grid gap-5 sm:grid-cols-2">
                      <div className="space-y-3">
                        <label className={`block ${labelClass}`}>Pro 会员
                          <select className={inputClass} value={membership.action} onChange={(event) => {
                            const action = event.target.value as typeof membership.action;
                            const quotaDraft = action === "revoke" || (action === "" && !quota.paidProActive)
                              ? numberDraft(quota.override) : membership.quota;
                            setMembership({ ...membership, action, quota: quotaDraft });
                          }}>
                            <option value="">保持当前状态</option>
                            <option value="set">设置到期日</option>
                            <option value="extend">延长有效期</option>
                            <option value="revoke">撤销 Pro</option>
                          </select>
                        </label>
                        {membership.action === "set" && (
                          <label className={`block ${labelClass}`}>到期日期
                            <input type="date" required className={inputClass} value={membership.expiresOn} onChange={(event) => setMembership({ ...membership, expiresOn: event.target.value })} />
                            <span className="mt-1 block text-xs text-fs-muted">有效期截至所选日期的北京时间 23:59:59。</span>
                          </label>
                        )}
                        {membership.action === "extend" && (
                          <label className={`block ${labelClass}`}>延长天数
                            <input type="number" required min={1} max={365} className={inputClass} value={membership.days} onChange={(event) => setMembership({ ...membership, days: event.target.value })} />
                          </label>
                        )}
                      </div>
                      <label className={labelClass}>积分增减
                        <input type="number" min={-10000} max={10000} className={inputClass} value={membership.delta} placeholder="0" onChange={(event) => setMembership({ ...membership, delta: event.target.value })} />
                        <span className="mt-1 block text-xs text-fs-muted">当前余额 {detail.user.creditBalance}。正数增加，负数扣减。</span>
                      </label>
                    </div>
                    <div className="mt-5 border-t border-fs-border pt-4">
                      <h3 className="text-sm font-semibold text-fs-text">Pro AI 调用额度</h3>
                      <div className="mt-2 grid items-start gap-3 sm:grid-cols-2">
                        <label className={labelClass}>每月额度（点）
                          <input type="number" min={0} max={2147483647} className={inputClass}
                            value={membership.quota} disabled={!canEditQuota}
                            placeholder={String(quota.defaultLimit)} onChange={(event) => setMembership({ ...membership, quota: event.target.value })} />
                          <span className="mt-1 block text-xs text-fs-muted">
                            {canEditQuota ? `留空使用全站默认额度（${quota.defaultLimit} 点），填 0 则暂停消耗点数的调用。`
                              : membership.action === "revoke" ? "撤销 Pro 后额度暂停生效。"
                              : "开通 Pro 后可设置额度，也可随本次开通一并提交。"}
                          </span>
                        </label>
                        <div className="text-sm text-fs-secondary">
                          <Info label="本月用量 / 当前额度" value={`${quota.used} / ${quota.limit} 点`} />
                          <p className="mt-1 text-xs text-fs-muted">下次重置（北京时间）{localDateTime(quota.resetAt)}</p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
                  <p className="text-sm text-fs-muted">{summary.length ? `待提交 ${summary.length} 项变更` : "暂无待提交的变更"}</p>
                  <button type="submit" className={primaryButton} disabled={busy || !summary.length}>提交变更</button>
                </div>
              </form>

              {canEditProfile && (
                <section aria-labelledby="actions-heading" className="rounded-lg border border-fs-border p-4 sm:p-5">
                  <h2 id="actions-heading" className="font-semibold text-fs-text">账号操作</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AccountButton action="revoke-sessions" busy={busy} onSelect={openConfirmation} />
                    <AccountButton action="send-reset-link" busy={busy} onSelect={openConfirmation} />
                    {detail.user.role.startsWith("admin") && detail.user.adminMfaEnabled && viewer.id !== userId && (
                      <AccountButton action="reset-admin-mfa" busy={busy} onSelect={openConfirmation} />
                    )}
                    {detail.user.status === "active" && viewer.id !== userId && <AccountButton action="suspend" busy={busy} onSelect={openConfirmation} />}
                    {detail.user.status === "suspended" && <AccountButton action="reactivate" busy={busy} onSelect={openConfirmation} />}
                    {viewer.id !== userId && <AccountButton action="close" busy={busy} onSelect={openConfirmation} />}
                  </div>
                </section>
              )}
            </>
          )}

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
      {pending && (
        <ConfirmationDialog
          pending={pending}
          busy={busy}
          error={confirmationError}
          onClose={() => setPending(null)}
          onSubmit={confirm}
        />
      )}
    </div>
  );
}

function AccountButton({ action, busy, onSelect }: {
  action: AccountAction;
  busy: boolean;
  onSelect: (pending: Confirmation) => void;
}) {
  return (
    <button type="button" disabled={busy} onClick={() => onSelect({ action })}
      className={action === "suspend" || action === "close" ? dangerButton : secondaryButton}>
      {ACCOUNT_ACTIONS[action].label}
    </button>
  );
}

function ConfirmationDialog({ pending, busy, error, onClose, onSubmit }: {
  pending: Confirmation;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const action = "action" in pending ? ACCOUNT_ACTIONS[pending.action] : null;
  return (
    <dialog ref={dialog} aria-labelledby="confirm-user-operation" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose();
    }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-fs-border bg-fs-bg p-0 text-fs-text shadow-xl backdrop:bg-black/40">
      <form onSubmit={onSubmit} className="space-y-4 p-4 sm:p-5">
        <h2 id="confirm-user-operation" className="text-lg font-semibold">{action?.label ?? "确认提交变更"}</h2>
        {"summary" in pending && (
          <ul className="list-disc space-y-1 break-words pl-5 text-sm text-fs-secondary">
            {pending.summary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
        {action && <p className="text-sm text-fs-secondary">{action.description}</p>}
        <p className="text-xs text-fs-muted">请验证管理员身份。本次操作和原因将写入审计记录。</p>
        <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>操作原因
            <input name="reason" autoComplete="off" required maxLength={500} className={inputClass} />
          </label>
          <label className={labelClass}>管理员密码
            <input name="adminPassword" type="password" autoComplete="current-password" required className={inputClass} />
          </label>
          <label className={labelClass}>动态验证码
            <input name="adminTotpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={inputClass} />
          </label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={secondaryButton}>取消</button>
          <button type="submit" disabled={busy} className={primaryButton}>{busy ? "处理中…" : "确认"}</button>
        </div>
      </form>
    </dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-xs text-fs-muted">{label}</div><div className="mt-1 break-words text-fs-text">{value}</div></div>;
}

function History({ title, rows }: { title: string; rows: string[] }) {
  return <section className="rounded-lg border border-fs-border p-4"><h2 className="font-semibold text-fs-text">{title}</h2><div className="mt-3 space-y-2 text-sm text-fs-secondary">{rows.length ? rows.map((row, index) => <p key={index}>{row}</p>) : <p className="text-fs-muted">暂无记录</p>}</div></section>;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type UserRow = {
  id: string; username: string; email: string; phone: string;
  role: string; status: string; plan: string;
  tags: string[];
  planExpiresAt: string | null; trialEndsAt: string | null;
  creditBalance: number; createdAt: string;
};

type PageData = { users: UserRow[]; total: number; page: number; pageSize: number };

const emptyFilters = { q: "", role: "", status: "", membership: "", tag: "", from: "", to: "", expiresFrom: "", expiresTo: "", sort: "newest" };

function membershipLabel(user: UserRow): string {
  const now = Date.now();
  if (user.plan === "pro" && (!user.planExpiresAt || Date.parse(user.planExpiresAt) > now)) return "当前 Pro";
  if (user.trialEndsAt && Date.parse(user.trialEndsAt) > now) return "试用中";
  return "普通用户";
}

function localDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}

export function AdminUsersClient() {
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [myRole, setMyRole] = useState("");
  const [batch, setBatch] = useState({ action: "add" as "add" | "remove", tag: "", reason: "", adminPassword: "", adminTotpCode: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [create, setCreate] = useState({ username: "", email: "", phone: "", password: "", role: "user", plan: "standard", reason: "", adminPassword: "", adminTotpCode: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ...filters, page: String(page), pageSize: "25" });
      const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as PageData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "加载失败");
      setData(payload);
      setHint(null);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const tag = new URLSearchParams(window.location.search).get("tag") ?? ""; if (tag) { setDraft((value) => ({ ...value, tag })); setFilters((value) => ({ ...value, tag })); } }, []);
  useEffect(() => { void fetch("/api/auth/me").then((r) => r.json()).then((body) => setMyRole(body.user?.role ?? "")).catch(() => {}); }, []);

  async function runBatch() {
    setHint(null);
    try {
      if (myRole === "admin_membership" && filters.role && filters.role !== "user") throw new Error("会员运营请筛选普通用户后再批量操作");
      const base = { filters: myRole === "admin_membership" ? { ...filters, role: "user" } : filters, action: batch.action, tag: batch.tag };
      const previewResponse = await fetch("/api/admin/users/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, mode: "preview" }) });
      const preview = await previewResponse.json() as { count?: number; sample?: string[]; token?: string; error?: string };
      if (!previewResponse.ok) throw new Error(preview.error ?? "预览失败");
      if (!preview.count) { setHint("当前筛选条件没有可处理的用户"); return; }
      if (!window.confirm(`将${batch.action === "add" ? "添加" : "移除"}标签「${batch.tag}」，影响 ${preview.count} 位用户。样本：${preview.sample?.join("、") ?? ""}。确认执行？`)) return;
      const response = await fetch("/api/admin/users/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base, mode: "commit", token: preview.token, reason: batch.reason, adminPassword: batch.adminPassword, adminTotpCode: batch.adminTotpCode }) });
      const body = await response.json() as { error?: string; matched?: number };
      if (!response.ok) throw new Error(body.error ?? "批量操作失败");
      setBatch((value) => ({ ...value, adminPassword: "", adminTotpCode: "" }));
      await load();
      setHint(`已处理 ${body.matched} 位用户`);
    } catch (error) { setHint(error instanceof Error ? error.message : "批量操作失败"); }
  }

  async function exportUsers() {
    setHint(null);
    try {
      const previewResponse = await fetch("/api/admin/users/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "preview", filters }) });
      const preview = await previewResponse.json() as { count?: number; token?: string; error?: string };
      if (!previewResponse.ok) throw new Error(preview.error ?? "导出预览失败");
      if (!window.confirm(`将导出当前筛选的 ${preview.count} 位用户，文件不含邮箱和手机号。确认继续？`)) return;
      const response = await fetch("/api/admin/users/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "commit", token: preview.token, filters, reason: batch.reason, adminPassword: batch.adminPassword, adminTotpCode: batch.adminTotpCode }) });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? "导出失败"); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setHint("已导出当前筛选结果（不含联系方式）");
      setBatch((value) => ({ ...value, adminPassword: "", adminTotpCode: "" }));
    } catch (error) { setHint(error instanceof Error ? error.message : "导出失败"); }
  }

  async function createUser() {
    setCreating(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(create),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "创建失败");
      setCreate({ username: "", email: "", phone: "", password: "", role: "user", plan: "standard", reason: "", adminPassword: "", adminTotpCode: "" });
      setPage(1);
      await load();
      setHint("用户已创建");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  const fieldClass = "w-full rounded-md border border-fs-border bg-fs-bg px-3 py-2 text-sm text-fs-text";
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));

  return (
    <div className="space-y-5 py-5">
      <div>
        <h1 className="text-2xl font-semibold text-fs-text">用户管理</h1>
        <p className="mt-1 text-sm text-fs-muted">查找账户、查看权益与订单、处置账号。列表中的联系方式已遮盖。</p>
        {myRole === "admin" || myRole === "admin_support" || myRole === "admin_membership" ? <Link className="mt-2 inline-block text-sm text-fs-accent-text hover:underline" href="/admin/users/analytics">查看用户生命周期统计 →</Link> : null}
      </div>

      <form className="grid gap-3 rounded-lg border border-fs-border bg-fs-elevated/40 p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
        <label className="text-sm text-fs-secondary sm:col-span-2">搜索用户名、邮箱、手机号或用户 ID
          <input className={fieldClass} value={draft.q} onChange={(event) => setDraft((value) => ({ ...value, q: event.target.value }))} placeholder="输入关键词" />
        </label>
        <label className="text-sm text-fs-secondary">角色
          <select className={fieldClass} value={draft.role} onChange={(event) => setDraft((value) => ({ ...value, role: event.target.value }))}>
            <option value="">全部</option><option value="user">普通用户</option><option value="admin">最高管理员</option><option value="admin_support">客服只读</option><option value="admin_membership">会员运营</option><option value="admin_orders">订单处理</option>
          </select>
        </label>
        <label className="text-sm text-fs-secondary">账号状态
          <select className={fieldClass} value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}>
            <option value="">全部</option><option value="active">正常</option><option value="suspended">已停用</option><option value="closed">已关闭</option>
          </select>
        </label>
        <label className="text-sm text-fs-secondary">会员状态
          <select className={fieldClass} value={draft.membership} onChange={(event) => setDraft((value) => ({ ...value, membership: event.target.value }))}>
            <option value="">全部</option><option value="paid">当前 Pro</option><option value="trial">试用中</option><option value="standard">普通用户</option>
          </select>
        </label>
        <label className="text-sm text-fs-secondary">标签<input className={fieldClass} value={draft.tag} onChange={(event) => setDraft((value) => ({ ...value, tag: event.target.value }))} placeholder="精确匹配" /></label>
        <label className="text-sm text-fs-secondary">注册起始日期
          <input type="date" className={fieldClass} value={draft.from} onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} />
        </label>
        <label className="text-sm text-fs-secondary">注册结束日期
          <input type="date" className={fieldClass} value={draft.to} onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} />
        </label>
        <label className="text-sm text-fs-secondary">Pro 到期起始日期
          <input type="date" className={fieldClass} value={draft.expiresFrom} onChange={(event) => setDraft((value) => ({ ...value, expiresFrom: event.target.value }))} />
        </label>
        <label className="text-sm text-fs-secondary">Pro 到期结束日期
          <input type="date" className={fieldClass} value={draft.expiresTo} onChange={(event) => setDraft((value) => ({ ...value, expiresTo: event.target.value }))} />
        </label>
        <label className="text-sm text-fs-secondary">排序
          <select className={fieldClass} value={draft.sort} onChange={(event) => setDraft((value) => ({ ...value, sort: event.target.value }))}>
            <option value="newest">最新注册</option><option value="oldest">最早注册</option>
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-md bg-fs-accent px-4 py-2 text-sm text-white">查询</button>
          <button type="button" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }} className="rounded-md border border-fs-border px-4 py-2 text-sm text-fs-secondary">清空</button>
          <span className="ml-auto text-sm text-fs-muted">共 {data?.total ?? 0} 位用户</span>
        </div>
      </form>

      {hint ? <p role="status" className="text-sm text-fs-secondary">{hint}</p> : null}
      <section className="rounded-lg border border-fs-border">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-fs-elevated text-fs-secondary"><tr>
              <th className="p-3">用户名</th><th className="p-3">邮箱</th><th className="p-3">手机号</th><th className="p-3">角色</th><th className="p-3">账号</th><th className="p-3">会员</th><th className="p-3">标签</th><th className="p-3">注册时间</th><th className="p-3">操作</th>
            </tr></thead>
            <tbody>{data?.users.map((user) => <tr key={user.id} className="border-t border-fs-border text-fs-text">
              <td className="p-3">{user.username}</td><td className="p-3">{user.email}</td><td className="p-3">{user.phone}</td>
              <td className="p-3">{{ admin: "最高管理员", admin_support: "客服只读", admin_membership: "会员运营", admin_orders: "订单处理", user: "普通用户" }[user.role] ?? user.role}</td>
              <td className="p-3">{user.status === "active" ? "正常" : user.status === "closed" ? "已关闭" : "已停用"}</td>
              <td className="p-3">{membershipLabel(user)}</td><td className="p-3">{user.tags.join("、") || "—"}</td><td className="p-3">{localDate(user.createdAt)}</td>
              <td className="p-3"><Link className="text-fs-accent-text hover:underline" href={`/admin/users/${user.id}`}>查看详情</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="divide-y divide-fs-border md:hidden">
          {data?.users.map((user) => <Link key={user.id} href={`/admin/users/${user.id}`} className="block space-y-1 p-4 text-sm">
            <div className="flex justify-between font-medium text-fs-text"><span>{user.username}</span><span>{user.status === "active" ? "正常" : user.status === "closed" ? "已关闭" : "已停用"}</span></div>
            <div className="text-fs-muted">{user.email} · {user.phone}</div>
            <div className="text-fs-secondary">{membershipLabel(user)} · {localDate(user.createdAt)}{user.tags.length ? ` · ${user.tags.join("、")}` : ""}</div>
          </Link>)}
        </div>
        {!loading && data?.users.length === 0 ? <p className="p-8 text-center text-sm text-fs-muted">没有符合条件的用户</p> : null}
      </section>
      <div className="flex items-center justify-between text-sm text-fs-secondary">
        <span>第 {page} / {totalPages} 页{loading ? " · 加载中…" : ""}</span>
        <div className="flex gap-2">
          <button className="rounded border border-fs-border px-3 py-2 disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>上一页</button>
          <button className="rounded border border-fs-border px-3 py-2 disabled:opacity-40" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>下一页</button>
        </div>
      </div>

      {(myRole === "admin" || myRole === "admin_membership") ? <section className="rounded-lg border border-fs-border p-4">
        <h2 className="font-semibold text-fs-text">批量标签与导出</h2><p className="mt-1 text-xs text-fs-muted">作用于当前筛选结果；会员运营岗位的批量操作只处理普通用户。标签操作先预览人数与样本，再二次确认；单次最多 500 人。导出最多 5000 人，文件不含邮箱和手机号。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-fs-secondary">标签操作<select className={fieldClass} value={batch.action} onChange={(event) => setBatch((value) => ({ ...value, action: event.target.value as "add" | "remove" }))}><option value="add">添加</option><option value="remove">移除</option></select></label>
          <label className="text-sm text-fs-secondary">标签<input className={fieldClass} value={batch.tag} onChange={(event) => setBatch((value) => ({ ...value, tag: event.target.value }))} maxLength={32} /></label>
          <label className="text-sm text-fs-secondary sm:col-span-2">操作原因<input className={fieldClass} value={batch.reason} onChange={(event) => setBatch((value) => ({ ...value, reason: event.target.value }))} maxLength={500} /></label>
          <label className="text-sm text-fs-secondary">你的管理员密码<input type="password" className={fieldClass} value={batch.adminPassword} onChange={(event) => setBatch((value) => ({ ...value, adminPassword: event.target.value }))} /></label>
          <label className="text-sm text-fs-secondary">动态验证码<input inputMode="numeric" maxLength={6} className={fieldClass} value={batch.adminTotpCode} onChange={(event) => setBatch((value) => ({ ...value, adminTotpCode: event.target.value.replace(/\D/g, "") }))} /></label>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2"><button type="button" onClick={() => void runBatch()} className="rounded-md bg-fs-accent px-3 py-2 text-sm text-white">预览并执行</button><button type="button" onClick={() => void exportUsers()} className="rounded-md border border-fs-border px-3 py-2 text-sm text-fs-secondary">导出当前筛选</button></div>
        </div>
      </section> : null}

      {myRole === "admin" ? <details className="rounded-lg border border-fs-border p-4">
        <summary className="cursor-pointer font-medium text-fs-text">创建用户</summary>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void createUser(); }}>
          {(["username", "email", "phone", "password"] as const).map((key) => <label key={key} className="text-sm text-fs-secondary">
            {{ username: "用户名", email: "邮箱", phone: "手机号", password: "新用户密码" }[key]}
            <input className={fieldClass} type={key === "password" ? "password" : key === "email" ? "email" : "text"} value={create[key]} onChange={(event) => setCreate((value) => ({ ...value, [key]: event.target.value }))} required={key !== "phone" || create.role !== "admin"} />
          </label>)}
          <label className="text-sm text-fs-secondary">角色<select className={fieldClass} value={create.role} onChange={(event) => setCreate((value) => ({ ...value, role: event.target.value }))}><option value="user">普通用户</option><option value="admin">最高管理员</option><option value="admin_support">客服只读</option><option value="admin_membership">会员运营</option><option value="admin_orders">订单处理</option></select></label>
          <label className="text-sm text-fs-secondary">会员类型<select className={fieldClass} value={create.plan} onChange={(event) => setCreate((value) => ({ ...value, plan: event.target.value }))}><option value="standard">普通用户</option><option value="pro">Pro 用户</option></select></label>
          <label className="text-sm text-fs-secondary sm:col-span-2">创建原因<input className={fieldClass} value={create.reason} onChange={(event) => setCreate((value) => ({ ...value, reason: event.target.value }))} required maxLength={500} /></label>
          <label className="text-sm text-fs-secondary">你的管理员密码<input className={fieldClass} type="password" autoComplete="current-password" value={create.adminPassword} onChange={(event) => setCreate((value) => ({ ...value, adminPassword: event.target.value }))} required /></label>
          <label className="text-sm text-fs-secondary">你的动态验证码<input className={fieldClass} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={create.adminTotpCode} onChange={(event) => setCreate((value) => ({ ...value, adminTotpCode: event.target.value.replace(/\D/g, "") }))} required /></label>
          <button className="rounded-md bg-fs-accent px-4 py-2 text-sm text-white disabled:opacity-50 sm:col-span-2" disabled={creating}>创建用户</button>
        </form>
      </details> : null}
    </div>
  );
}

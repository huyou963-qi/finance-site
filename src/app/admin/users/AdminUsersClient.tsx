"use client";

import { useEffect, useState } from "react";

type UserPlan = "standard" | "pro";

type User = {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: "admin" | "user";
  plan: UserPlan;
  createdAt: string;
};

const PLAN_LABELS: Record<UserPlan, string> = {
  standard: "普通用户",
  pro: "Pro 用户",
};

const emptyEdit = {
  email: "",
  phone: "",
  password: "",
  role: "user" as "admin" | "user",
  plan: "standard" as UserPlan,
};

export function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [plan, setPlan] = useState<UserPlan>("standard");
  const [hint, setHint] = useState<string | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [editDraft, setEditDraft] = useState(emptyEdit);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = (await res.json()) as { users?: User[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
    setUsers(payload.users ?? []);
  };

  useEffect(() => {
    load().catch((e) => setHint(e instanceof Error ? e.message : "未知错误"));
  }, []);

  const createUser = async () => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email, phone, role, plan }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setUsername("");
      setPassword("");
      setEmail("");
      setPhone("");
      await load();
      setHint("创建成功");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "未知错误");
    }
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setEditDraft({
      email: u.email,
      phone: u.phone,
      password: "",
      role: u.role,
      plan: u.plan,
    });
    setHint(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editDraft.email,
          phone: editDraft.phone,
          password: editDraft.password.trim() || undefined,
          role: editDraft.role,
          plan: editDraft.plan,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setEditing(null);
      await load();
      setHint(`已更新用户「${editing.username}」`);
    } catch (e) {
      setHint(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-fs-text">管理员：用户管理</h1>
        <p className="mt-1 text-sm text-fs-muted">
          可创建用户，或编辑邮箱、手机号、密码、管理员角色与会员类型。
        </p>
      </div>
      <section className="rounded-lg border border-fs-border bg-fs-bg/60 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-fs-secondary">
            用户名
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            />
          </label>
          <label className="text-sm text-fs-secondary">
            邮箱{role === "admin" ? "（选填）" : ""}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            />
          </label>
          <label className="text-sm text-fs-secondary">
            手机号{role === "admin" ? "（选填）" : ""}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={role === "admin" ? "可选" : "11位手机号"}
              className="mt-1 block rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            />
          </label>
          <label className="text-sm text-fs-secondary">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            />
          </label>
          <label className="text-sm text-fs-secondary">
            管理员角色
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              className="mt-1 block rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            >
              <option value="user">普通权限</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <label className="text-sm text-fs-secondary">
            会员类型
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as UserPlan)}
              className="mt-1 block rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            >
              <option value="standard">普通用户</option>
              <option value="pro">Pro 用户</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => createUser().catch(() => {})}
            disabled={
              !username.trim() ||
              !password ||
              (role !== "admin" && (!email.trim() || !phone.trim()))
            }
            className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-3 py-1.5 text-sm text-fs-accent-text disabled:opacity-50"
          >
            创建用户
          </button>
        </div>
      </section>
      {hint ? <p className="text-sm text-fs-secondary">{hint}</p> : null}
      <section className="rounded-lg border border-fs-border bg-fs-bg/60 p-2">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-fs-elevated text-fs-secondary">
              <tr>
                <th className="px-2 py-2 text-left">用户名</th>
                <th className="px-2 py-2 text-left">邮箱</th>
                <th className="px-2 py-2 text-left">手机号</th>
                <th className="px-2 py-2 text-left">管理员</th>
                <th className="px-2 py-2 text-left">会员类型</th>
                <th className="px-2 py-2 text-left">创建时间</th>
                <th className="px-2 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-fs-border text-fs-text">
                  <td className="px-2 py-2">{u.username}</td>
                  <td className="px-2 py-2">{u.email || "—"}</td>
                  <td className="px-2 py-2">{u.phone || "—"}</td>
                  <td className="px-2 py-2">{u.role === "admin" ? "是" : "否"}</td>
                  <td className="px-2 py-2">{PLAN_LABELS[u.plan] ?? u.plan}</td>
                  <td className="px-2 py-2">{u.createdAt.replace("T", " ").slice(0, 19)}</td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="rounded border border-fs-border px-2 py-0.5 text-xs text-fs-secondary hover:border-fs-border"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-fs-bg/75 px-4">
          <div className="w-full max-w-md rounded-lg border border-fs-border bg-fs-elevated p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-fs-text">编辑用户：{editing.username}</h3>
            <div className="mt-3 grid gap-3">
              <label className="text-sm text-fs-secondary">
                邮箱{editDraft.role === "admin" ? "（选填）" : ""}
                <input
                  type="email"
                  value={editDraft.email}
                  onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-2 py-1.5 text-fs-text"
                />
              </label>
              <label className="text-sm text-fs-secondary">
                手机号{editDraft.role === "admin" ? "（选填）" : ""}
                <input
                  type="tel"
                  value={editDraft.phone}
                  onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                  placeholder={editDraft.role === "admin" ? "可选" : "11位手机号"}
                  className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-2 py-1.5 text-fs-text"
                />
              </label>
              <label className="text-sm text-fs-secondary">
                新密码（留空不修改）
                <input
                  type="password"
                  value={editDraft.password}
                  onChange={(e) => setEditDraft((d) => ({ ...d, password: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-2 py-1.5 text-fs-text"
                />
              </label>
              <label className="text-sm text-fs-secondary">
                管理员角色
                <select
                  value={editDraft.role}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, role: e.target.value as "admin" | "user" }))
                  }
                  className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-2 py-1.5 text-fs-text"
                >
                  <option value="user">普通权限</option>
                  <option value="admin">管理员</option>
                </select>
              </label>
              <label className="text-sm text-fs-secondary">
                会员类型
                <select
                  value={editDraft.plan}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, plan: e.target.value as UserPlan }))
                  }
                  className="mt-1 w-full rounded-md border border-fs-border bg-fs-bg px-2 py-1.5 text-fs-text"
                >
                  <option value="standard">普通用户</option>
                  <option value="pro">Pro 用户</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded border border-fs-border px-3 py-1.5 text-xs text-fs-secondary"
              >
                取消
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  (editDraft.role !== "admin" &&
                    (!editDraft.email.trim() || !editDraft.phone.trim()))
                }
                onClick={() => saveEdit().catch(() => {})}
                className="rounded border border-fs-accent/40 bg-fs-accent-soft px-3 py-1.5 text-xs text-fs-accent-text disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

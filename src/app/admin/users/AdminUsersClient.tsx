"use client";

import { useEffect, useState } from "react";

type User = { id: string; username: string; role: "admin" | "user"; createdAt: string };

export function AdminUsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [hint, setHint] = useState<string | null>(null);

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
        body: JSON.stringify({ username, password, role }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setUsername("");
      setPassword("");
      await load();
      setHint("创建成功");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "未知错误");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-50">管理员：用户管理</h1>
        <p className="mt-1 text-sm text-slate-400">可创建普通用户或管理员用户。</p>
      </div>
      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-300">
            用户名
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-300">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-sm text-slate-300">
            角色
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              className="mt-1 block rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => createUser().catch(() => {})}
            className="rounded-md border border-emerald-700 bg-emerald-900/50 px-3 py-1.5 text-sm text-emerald-100"
          >
            创建用户
          </button>
        </div>
      </section>
      {hint ? <p className="text-sm text-slate-300">{hint}</p> : null}
      <section className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/70 text-slate-300">
              <tr>
                <th className="px-2 py-2 text-left">用户名</th>
                <th className="px-2 py-2 text-left">角色</th>
                <th className="px-2 py-2 text-left">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-800 text-slate-100">
                  <td className="px-2 py-2">{u.username}</td>
                  <td className="px-2 py-2">{u.role}</td>
                  <td className="px-2 py-2">{u.createdAt.replace("T", " ").slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

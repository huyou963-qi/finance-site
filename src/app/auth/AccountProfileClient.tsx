"use client";

import { useEffect, useState } from "react";

type UserProfile = {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: "admin" | "user";
  plan: "standard" | "pro";
  createdAt: string;
};

const PLAN_LABELS: Record<UserProfile["plan"], string> = {
  standard: "普通用户",
  pro: "Pro 用户",
};

export function AccountProfileClient() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("未登录");
        const j = (await r.json()) as { user?: UserProfile };
        return j.user ?? null;
      })
      .then((u) => {
        if (!u) throw new Error("未登录");
        setProfile(u);
        setEmail(u.email);
        setPhone(u.phone);
      })
      .catch((e) => setHint(e instanceof Error ? e.message : "加载失败"));
  }, []);

  const save = async () => {
    if (!profile) return;
    if (newPassword && newPassword !== confirmPassword) {
      setHint("两次输入的新密码不一致");
      return;
    }
    if (newPassword && !currentPassword) {
      setHint("修改密码需填写当前密码");
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          password: newPassword.trim() || undefined,
          currentPassword: currentPassword || undefined,
        }),
      });
      const payload = (await res.json()) as { user?: UserProfile; error?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      if (payload.user) {
        setProfile(payload.user);
        setEmail(payload.user.email);
        setPhone(payload.user.phone);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHint("账户信息已保存");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  if (!profile && !hint) {
    return <p className="text-sm text-fs-muted">加载中…</p>;
  }

  if (!profile) {
    return <p className="text-sm text-fs-muted">{hint}</p>;
  }

  return (
    <div className="space-y-4 rounded-lg border border-fs-border bg-fs-bg/60 p-4">
      <div>
        <h1 className="text-xl font-semibold text-fs-text">个人账户</h1>
        <p className="mt-1 text-sm text-fs-muted">
          修改邮箱、手机号或登录密码。用户名、会员类型与管理员权限不可自行更改。
        </p>
      </div>
      <div className="grid gap-3">
        <label className="text-sm text-fs-secondary">
          用户名
          <input
            value={profile.username}
            readOnly
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated/80 px-2 py-1.5 text-fs-muted"
          />
        </label>
        <label className="text-sm text-fs-secondary">
          会员类型
          <input
            value={PLAN_LABELS[profile.plan] ?? profile.plan}
            readOnly
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated/80 px-2 py-1.5 text-fs-muted"
          />
        </label>
        <label className="text-sm text-fs-secondary">
          管理员
          <input
            value={profile.role === "admin" ? "是" : "否"}
            readOnly
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated/80 px-2 py-1.5 text-fs-muted"
          />
        </label>
        <label className="text-sm text-fs-secondary">
          邮箱{profile.role === "admin" ? "（选填）" : ""}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            required={profile.role !== "admin"}
          />
        </label>
        <label className="text-sm text-fs-secondary">
          手机号{profile.role === "admin" ? "（选填）" : ""}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={profile.role === "admin" ? "可选" : "11位中国大陆手机号"}
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
            required={profile.role !== "admin"}
          />
        </label>
        <div className="rounded-md border border-fs-border bg-fs-elevated/40 px-3 py-2">
          <p className="text-xs font-medium text-fs-muted">修改密码（可选）</p>
          <div className="mt-2 grid gap-2">
            <label className="text-sm text-fs-secondary">
              当前密码
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
                autoComplete="current-password"
              />
            </label>
            <label className="text-sm text-fs-secondary">
              新密码
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
                autoComplete="new-password"
              />
            </label>
            <label className="text-sm text-fs-secondary">
              确认新密码
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={() => save().catch(() => {})}
          disabled={
            loading ||
            (profile.role !== "admin" && (!email.trim() || !phone.trim()))
          }
          className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-3 py-2 text-sm text-fs-accent-text disabled:opacity-50"
        >
          {loading ? "保存中…" : "保存修改"}
        </button>
      </div>
      {hint ? <p className="text-sm text-fs-secondary">{hint}</p> : null}
    </div>
  );
}

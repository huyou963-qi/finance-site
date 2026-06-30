"use client";

import { useEffect, useState } from "react";
import { AccountProfileClient } from "./AccountProfileClient";

export function AuthClient() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false));
  }, []);

  const submit = async () => {
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email, phone }),
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setHint(
        mode === "login"
          ? "登录成功，正在跳转…"
          : (payload.message ?? "注册请求已提交，请查收邮箱并点击确认链接"),
      );
      if (mode === "login") {
        window.location.href = "/markets-tools";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setHint(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loggedIn === null) {
    return <p className="text-sm text-fs-muted">加载中…</p>;
  }

  if (loggedIn) {
    return <AccountProfileClient />;
  }

  return (
    <div className="space-y-4 rounded-lg border border-fs-border bg-fs-bg/60 p-4">
      <div>
        <h1 className="text-xl font-semibold text-fs-text">账户登录 / 注册</h1>
        <p className="mt-1 text-sm text-fs-muted">
          默认管理员：`admin`，默认密码：`admin123456`（建议登录后改成你自己的管理账号策略）。
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            mode === "login"
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30"
              : "bg-fs-elevated text-fs-secondary"
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            mode === "register"
              ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/30"
              : "bg-fs-elevated text-fs-secondary"
          }`}
        >
          注册
        </button>
      </div>
      <div className="grid gap-3">
        <label className="text-sm text-fs-secondary">
          用户名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
          />
        </label>
        {mode === "register" ? (
          <>
            <label className="text-sm text-fs-secondary">
              邮箱
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
                required
              />
            </label>
            <label className="text-sm text-fs-secondary">
              手机号
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11位中国大陆手机号"
                className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
                required
              />
            </label>
          </>
        ) : null}
        <label className="text-sm text-fs-secondary">
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-fs-border bg-fs-elevated px-2 py-1.5 text-fs-text"
          />
        </label>
        <button
          type="button"
          onClick={() => submit().catch(() => {})}
          disabled={
            loading ||
            !username.trim() ||
            !password ||
            (mode === "register" && (!email.trim() || !phone.trim()))
          }
          className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-3 py-2 text-sm text-fs-accent-text disabled:opacity-50"
        >
          {loading ? "提交中..." : mode === "login" ? "登录" : "注册"}
        </button>
      </div>
      {hint ? <p className="text-sm text-fs-secondary">{hint}</p> : null}
    </div>
  );
}

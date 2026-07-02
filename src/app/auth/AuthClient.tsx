"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AuthPageShell,
  authInputClass,
} from "@/components/auth/AuthPageShell";
import { AccountProfileClient } from "./AccountProfileClient";

export function AuthClient() {
  const searchParams = useSearchParams();
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

  useEffect(() => {
    if (searchParams.get("register") === "1" || searchParams.get("mode") === "register") {
      setMode("register");
    }
  }, [searchParams]);

  const submit = async () => {
    setLoading(true);
    setHint(null);
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
        window.location.href = "/";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setHint(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loggedIn === null) {
    return (
      <AuthPageShell>
        <p className="text-sm text-fs-muted">加载中…</p>
      </AuthPageShell>
    );
  }

  if (loggedIn) {
    return <AccountProfileClient />;
  }

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">
        {mode === "login" ? "欢迎回来" : "创建账户"}
      </h1>
      <p className="mt-1 text-sm text-fs-muted">
        {mode === "login" ? "使用用户名与密码登录 Finova" : "填写信息并完成邮箱验证"}
      </p>

      <div
        className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-fs-border bg-fs-bg p-1"
        role="tablist"
        aria-label="登录或注册"
      >
        {(
          [
            { id: "login" as const, label: "登录" },
            { id: "register" as const, label: "注册" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => {
              setMode(tab.id);
              setHint(null);
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === tab.id
                ? "bg-white text-fs-text shadow-sm ring-1 ring-fs-border"
                : "text-fs-muted hover:text-fs-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit().catch(() => {});
        }}
      >
        <label className="block text-sm text-fs-secondary">
          用户名
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入用户名"
            className={authInputClass}
          />
        </label>

        {mode === "register" ? (
          <>
            <label className="block text-sm text-fs-secondary">
              邮箱
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={authInputClass}
                required
              />
            </label>
            <label className="block text-sm text-fs-secondary">
              手机号
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11 位中国大陆手机号"
                className={authInputClass}
                required
              />
            </label>
          </>
        ) : null}

        <label className="block text-sm text-fs-secondary">
          密码
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "login" ? "请输入密码" : "至少 8 位，含字母与数字"}
            className={authInputClass}
          />
        </label>

        <button
          type="submit"
          disabled={
            loading ||
            !username.trim() ||
            !password ||
            (mode === "register" && (!email.trim() || !phone.trim()))
          }
          className="w-full rounded-md bg-fs-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
        >
          {loading ? "提交中…" : mode === "login" ? "登录" : "注册并发送验证邮件"}
        </button>
      </form>

      {hint ? <p className="mt-4 text-sm text-fs-secondary">{hint}</p> : null}
    </AuthPageShell>
  );
}

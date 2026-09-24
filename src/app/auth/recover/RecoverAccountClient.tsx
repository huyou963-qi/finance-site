"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthPageShell, authInputClass } from "@/components/auth/AuthPageShell";

type RecoveryKind = "username" | "password";

export function RecoverAccountClient() {
  const searchParams = useSearchParams();
  const [kind, setKind] = useState<RecoveryKind>(
    searchParams.get("kind") === "username" ? "username" : "password",
  );
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setHint(null);
    try {
      const response = await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, kind }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setHint(payload.message ?? "请求已提交，请查收邮件");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">找回账户</h1>
      <p className="mt-1 text-sm text-fs-muted">通过注册邮箱找回用户名或重置密码。</p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-fs-border bg-fs-bg p-1">
        {([
          { id: "username" as const, label: "找回用户名" },
          { id: "password" as const, label: "重置密码" },
        ]).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setKind(item.id);
              setHint(null);
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              kind === item.id
                ? "bg-white text-fs-text shadow-sm ring-1 ring-fs-border"
                : "text-fs-muted hover:text-fs-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit().catch(() => {});
        }}
      >
        <label className="block text-sm text-fs-secondary">
          注册邮箱
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            className={authInputClass}
          />
        </label>
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full rounded-md bg-fs-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
        >
          {loading ? "发送中…" : kind === "username" ? "发送用户名邮件" : "发送密码重置邮件"}
        </button>
      </form>

      {hint ? <p className="mt-4 text-sm text-fs-secondary">{hint}</p> : null}
      <Link href="/auth" className="mt-6 inline-block text-sm text-fs-accent-text underline">
        返回登录
      </Link>
    </AuthPageShell>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthPageShell, authInputClass } from "@/components/auth/AuthPageShell";

export function ResetPasswordClient() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const submit = async () => {
    if (password !== confirmation) {
      setHint("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    setHint(null);
    try {
      const response = await fetch("/api/auth/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setComplete(true);
      setHint(payload.message ?? "密码已重置");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "重置失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">重置密码</h1>
      <p className="mt-1 text-sm text-fs-muted">设置至少 8 位的新密码。成功后所有旧登录会话将退出。</p>

      {!token ? (
        <p className="mt-6 text-sm text-fs-negative">重置链接无效，请重新申请。</p>
      ) : complete ? null : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit().catch(() => {});
          }}
        >
          <label className="block text-sm text-fs-secondary">
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
              className={authInputClass}
            />
          </label>
          <label className="block text-sm text-fs-secondary">
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              required
              className={authInputClass}
            />
          </label>
          <button
            type="submit"
            disabled={loading || password.length < 8 || confirmation.length < 8}
            className="w-full rounded-md bg-fs-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
          >
            {loading ? "重置中…" : "重置密码"}
          </button>
        </form>
      )}

      {hint ? <p className="mt-4 text-sm text-fs-secondary">{hint}</p> : null}
      <Link href="/auth" className="mt-6 inline-block text-sm text-fs-accent-text underline">
        {complete ? "使用新密码登录" : "返回登录"}
      </Link>
    </AuthPageShell>
  );
}

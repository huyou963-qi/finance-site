"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function VerifyClient() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMsg("缺少 token，请从邮件链接进入");
      return;
    }
    setStatus("loading");
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const payload = (await r.json()) as { message?: string; error?: string };
        if (!r.ok) throw new Error(payload.error ?? `${r.status}`);
        setStatus("ok");
        setMsg(payload.message ?? "验证成功");
      })
      .catch((e) => {
        setStatus("error");
        setMsg(e instanceof Error ? e.message : "未知错误");
      });
  }, [token]);

  return (
    <div className="space-y-3 rounded-lg border border-fs-border bg-fs-bg/60 p-4">
      <h1 className="text-xl font-semibold text-fs-text">邮箱确认</h1>
      <p className="text-sm text-fs-secondary">
        {status === "loading" ? "正在验证链接…" : msg || "处理中"}
      </p>
      {status === "ok" ? (
        <a className="text-sm text-fs-accent-text underline" href="/auth">
          去登录
        </a>
      ) : null}
    </div>
  );
}

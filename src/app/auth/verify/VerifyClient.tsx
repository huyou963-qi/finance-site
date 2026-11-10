"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function VerifyClient() {
  const t = useTranslations("verify");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMsg(t("missingToken"));
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
        setMsg(payload.message ?? t("success"));
      })
      .catch((e) => {
        setStatus("error");
        setMsg(e instanceof Error ? e.message : tc("unknownError"));
      });
  }, [token, t, tc]);

  return (
    <div className="space-y-3 rounded-lg border border-fs-border bg-fs-bg/60 p-4">
      <h1 className="text-xl font-semibold text-fs-text">{t("title")}</h1>
      <p className="text-sm text-fs-secondary">
        {status === "loading" ? t("verifying") : msg || t("processing")}
      </p>
      {status === "ok" ? (
        <Link className="text-sm text-fs-accent-text underline" href="/auth">
          {t("goLogin")}
        </Link>
      ) : null}
    </div>
  );
}

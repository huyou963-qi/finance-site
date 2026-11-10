"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthPageShell, authInputClass } from "@/components/auth/AuthPageShell";
import { Link } from "@/i18n/navigation";

type RecoveryKind = "username" | "password";

export function RecoverAccountClient() {
  const t = useTranslations("recover");
  const tc = useTranslations("common");
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
      setHint(payload.message ?? t("submitted"));
    } catch (error) {
      setHint(error instanceof Error ? error.message : tc("submitFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">{t("title")}</h1>
      <p className="mt-1 text-sm text-fs-muted">{t("subtitle")}</p>

      <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-fs-border bg-fs-bg p-1">
        {([
          { id: "username" as const, label: t("findUsername") },
          { id: "password" as const, label: t("resetPassword") },
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
          {t("email")}
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
          {loading ? t("sending") : kind === "username" ? t("sendUsername") : t("sendReset")}
        </button>
      </form>

      {hint ? <p className="mt-4 text-sm text-fs-secondary">{hint}</p> : null}
      <Link href="/auth" className="mt-6 inline-block text-sm text-fs-accent-text underline">
        {t("backToLogin")}
      </Link>
    </AuthPageShell>
  );
}

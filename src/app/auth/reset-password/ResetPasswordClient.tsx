"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuthPageShell, authInputClass } from "@/components/auth/AuthPageShell";
import { Link } from "@/i18n/navigation";

export function ResetPasswordClient() {
  const t = useTranslations("reset");
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const submit = async () => {
    if (password !== confirmation) {
      setHint(t("mismatch"));
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
      setHint(payload.message ?? t("done"));
    } catch (error) {
      setHint(error instanceof Error ? error.message : t("failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">{t("title")}</h1>
      <p className="mt-1 text-sm text-fs-muted">{t("subtitle")}</p>

      {!token ? (
        <p className="mt-6 text-sm text-fs-negative">{t("invalidLink")}</p>
      ) : complete ? null : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit().catch(() => {});
          }}
        >
          <label className="block text-sm text-fs-secondary">
            {t("newPassword")}
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
            {t("confirmPassword")}
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
            {loading ? t("resetting") : t("submit")}
          </button>
        </form>
      )}

      {hint ? <p className="mt-4 text-sm text-fs-secondary">{hint}</p> : null}
      <Link href="/auth" className="mt-6 inline-block text-sm text-fs-accent-text underline">
        {complete ? t("loginWithNew") : t("backToLogin")}
      </Link>
    </AuthPageShell>
  );
}

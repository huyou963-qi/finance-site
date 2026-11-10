"use client";

import { useLocale, useTranslations } from "next-intl";
import { localizeServerMessage } from "@/i18n/serverMessages";
import { useEffect, useState } from "react";
import {
  AuthPageShell,
  authInputClass,
  authReadonlyInputClass,
} from "@/components/auth/AuthPageShell";
import { WechatQrPanel } from "@/components/auth/WechatQrPanel";
import { Link } from "@/i18n/navigation";

type UserProfile = {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: "admin" | "user";
  plan: "standard" | "pro";
  planExpiresAt?: string | null;
  trialEndsAt?: string | null;
  creditBalance?: number;
  hasProAccess?: boolean;
  isTrial?: boolean;
  wechatBound?: boolean;
  wechatNickname?: string;
  hasPassword?: boolean;
  createdAt: string;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function AccountProfileClient({
  wechatStatus,
  wechatError,
}: {
  wechatStatus?: string | null;
  wechatError?: string | null;
} = {}) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const tc = useTranslations("common");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [binding, setBinding] = useState(false);
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [wechatHint, setWechatHint] = useState<string | null>(
    wechatError
      ? t("wechatFailed", { error: localizeServerMessage(wechatError, locale) })
      : wechatStatus === "welcome"
        ? t("wechatWelcome")
        : wechatStatus === "bound"
          ? t("wechatBoundOk")
          : null,
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(t("notLoggedIn"));
        const j = (await r.json()) as { user?: UserProfile };
        return j.user ?? null;
      })
      .then((u) => {
        if (!u) throw new Error(t("notLoggedIn"));
        setProfile(u);
        setEmail(u.email);
        setPhone(u.phone);
      })
      .catch((e) => setHint(e instanceof Error ? e.message : tc("loadFailed")));
    fetch("/api/auth/wechat/config?probe=1", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ enabled?: boolean }>)
      .then((j) => setWechatEnabled(!!j.enabled))
      .catch(() => setWechatEnabled(false));
  }, [t, tc]);

  const save = async () => {
    if (!profile) return;
    if (newPassword && newPassword !== confirmPassword) {
      setHint(t("passwordMismatch"));
      return;
    }
    if (newPassword && !currentPassword && profile.hasPassword !== false) {
      setHint(t("currentPasswordRequired"));
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
      const payload = (await res.json()) as {
        user?: UserProfile;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      if (payload.user) {
        setProfile(payload.user);
        setEmail(payload.user.email);
        setPhone(payload.user.phone);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHint(t("saved"));
    } catch (e) {
      setHint(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const unbind = async () => {
    if (!window.confirm(t("unbindConfirm"))) return;
    setWechatHint(null);
    try {
      const res = await fetch("/api/auth/wechat/unbind", { method: "POST" });
      const payload = (await res.json()) as {
        user?: UserProfile;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      if (payload.user) setProfile(payload.user);
      setWechatHint(t("unbound"));
    } catch (e) {
      setWechatHint(e instanceof Error ? e.message : t("unbindFailed"));
    }
  };

  if (!profile && !hint) {
    return (
      <AuthPageShell>
        <p className="text-sm text-fs-muted">{tc("loading")}</p>
      </AuthPageShell>
    );
  }

  if (!profile) {
    return (
      <AuthPageShell>
        <p className="text-sm text-fs-muted">{hint}</p>
      </AuthPageShell>
    );
  }

  // 与服务端 phoneRequiredForUser 一致：管理员、微信注册账号可不填联系方式
  const contactOptional = profile.role === "admin" || !!profile.wechatBound;
  const hasPassword = profile.hasPassword !== false;

  const membershipLabel = profile.hasProAccess
    ? profile.isTrial
      ? t("trialUntil", { date: fmtDate(profile.trialEndsAt) })
      : t("proUntil", { date: fmtDate(profile.planExpiresAt) })
    : profile.plan === "pro"
      ? t("planPro")
      : t("planStandard");

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">{t("title")}</h1>
      <p className="mt-1 text-sm text-fs-muted">
        {t("subtitle")}
      </p>

      <div className="mt-4 rounded-lg border border-fs-border bg-fs-elevated/40 px-4 py-3 text-sm">
        <p className="text-fs-text">
          {t("membershipStatus")}
          <span className="font-medium">{membershipLabel}</span>
        </p>
        <p className="mt-1 text-xs text-fs-muted">{t("credits", { count: profile.creditBalance ?? 0 })}</p>
        <Link
          href="/pricing"
          className="mt-2 inline-block text-sm font-medium text-fs-accent-text underline"
        >
          {t("upgradeRenew")}
        </Link>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save().catch(() => {});
        }}
      >
        <label className="block text-sm text-fs-secondary">
          {t("username")}
          <input value={profile.username} readOnly className={authReadonlyInputClass} />
        </label>
        <label className="block text-sm text-fs-secondary">
          {t("membershipType")}
          <input value={membershipLabel} readOnly className={authReadonlyInputClass} />
        </label>
        <label className="block text-sm text-fs-secondary">
          {t("admin")}
          <input
            value={profile.role === "admin" ? tc("yes") : tc("no")}
            readOnly
            className={authReadonlyInputClass}
          />
        </label>
        <label className="block text-sm text-fs-secondary">
          {t("email")}
          {contactOptional ? t("optionalSuffix") : ""}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            required={!contactOptional}
          />
        </label>
        <label className="block text-sm text-fs-secondary">
          {t("phone")}
          {contactOptional ? t("optionalSuffix") : ""}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={contactOptional ? t("optional") : t("phonePlaceholder")}
            className={authInputClass}
            required={!contactOptional}
          />
        </label>

        <div className="rounded-lg border border-fs-border bg-fs-bg px-4 py-3">
          <p className="text-xs font-medium text-fs-muted">
            {hasPassword ? t("changePassword") : t("setPassword")}
          </p>
          <div className="mt-3 space-y-3">
            {hasPassword ? (
              <label className="block text-sm text-fs-secondary">
                {t("currentPassword")}
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={authInputClass}
                  autoComplete="current-password"
                />
              </label>
            ) : null}
            <label className="block text-sm text-fs-secondary">
              {t("newPassword")}
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={authInputClass}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm text-fs-secondary">
              {t("confirmPassword")}
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={authInputClass}
                autoComplete="new-password"
              />
            </label>
          </div>
        </div>

        {hint ? <p className="text-sm text-fs-muted">{hint}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-fs-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {loading ? tc("saving") : tc("save")}
        </button>
      </form>

      {wechatEnabled || profile.wechatBound ? (
        <section className="mt-8 rounded-lg border border-fs-border bg-fs-bg px-4 py-3">
          <p className="text-xs font-medium text-fs-muted">{t("wechatLogin")}</p>
          {profile.wechatBound ? (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-fs-text">
                {profile.wechatNickname
                  ? t("wechatBoundAs", { name: profile.wechatNickname })
                  : t("wechatBound")}
              </span>
              <button
                type="button"
                onClick={() => unbind().catch(() => {})}
                className="rounded-md border border-fs-border px-3 py-1.5 text-xs text-fs-secondary hover:bg-fs-elevated"
              >
                {t("unbind")}
              </button>
            </div>
          ) : binding ? (
            <div className="mt-3">
              <WechatQrPanel mode="bind" />
              <button
                type="button"
                onClick={() => setBinding(false)}
                className="mt-2 w-full text-xs text-fs-muted underline"
              >
                {tc("cancel")}
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-fs-muted">{t("wechatNotBound")}</span>
              <button
                type="button"
                onClick={() => {
                  setBinding(true);
                  setWechatHint(null);
                }}
                className="rounded-md border border-fs-border px-3 py-1.5 text-xs text-fs-secondary hover:bg-fs-elevated"
              >
                {t("bindWechat")}
              </button>
            </div>
          )}
          {wechatHint ? <p className="mt-2 text-sm text-fs-secondary">{wechatHint}</p> : null}
        </section>
      ) : null}
    </AuthPageShell>
  );
}

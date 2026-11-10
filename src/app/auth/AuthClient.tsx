"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localizeHref } from "@/i18n/locales";
import { localizeServerMessage } from "@/i18n/serverMessages";

const MFA_SESSION_EXPIRED = "设置会话已过期，请重新登录"; // i18n-ignore: 服务端错误原文
import { Link } from "@/i18n/navigation";
import { AuthPageShell, authInputClass } from "@/components/auth/AuthPageShell";
import { WechatQrPanel } from "@/components/auth/WechatQrPanel";
import { AccountProfileClient } from "./AccountProfileClient";

export function AuthClient() {
  const searchParams = useSearchParams();
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const home = localizeHref("/", locale);
  // 英文站面向海外用户：可只用邮箱注册（服务端同样按功能权限校验，见 phonePolicy）
  const phoneOptional = locale === "en";
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [method, setMethod] = useState<"password" | "wechat">("password");
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ token: string; secret: string; uri: string } | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginLock, setLoginLock] = useState<{ identifier: string; until: number } | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const remainingLockSeconds = mode === "login" && loginLock?.identifier === username.trim().toLowerCase()
    ? Math.max(0, Math.ceil((loginLock.until - clockNow) / 1000))
    : 0;
  const remainingLockLabel = `${String(Math.floor(remainingLockSeconds / 60)).padStart(2, "0")}:${String(remainingLockSeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => setLoggedIn(r.ok))
      .catch(() => setLoggedIn(false));
    fetch("/api/auth/wechat/config?probe=1", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ enabled?: boolean }>)
      .then((j) => setWechatEnabled(!!j.enabled))
      .catch(() => setWechatEnabled(false));
  }, []);

  useEffect(() => {
    if (searchParams.get("register") === "1" || searchParams.get("mode") === "register") {
      setMode("register");
    }
    const wechatError = searchParams.get("wechat_error");
    if (wechatError) {
      setMethod("wechat");
      setHint(t("wechatFailed", { error: localizeServerMessage(wechatError, locale) }));
    }
  }, [searchParams, t, locale]);

  useEffect(() => {
    if (!loginLock) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClockNow(now);
      if (now >= loginLock.until) {
        setLoginLock(null);
        setHint(t("lockEnded"));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loginLock, t]);

  const submit = async () => {
    setLoading(true);
    setHint(null);
    try {
      const endpoint = mfaSetup ? "/api/auth/admin-mfa-setup" : mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mfaSetup ? { setupToken: mfaSetup.token, code: totpCode } : mode === "login" ? { identifier: username } : { username }),
          password,
          totpCode,
          email,
          phone,
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        message?: string;
        mfaRequired?: boolean;
        mfaSetup?: boolean;
        setupToken?: string;
        secret?: string;
        uri?: string;
        recoveryCodes?: string[];
        retryAfterSeconds?: number;
      };
      if (res.status === 429) {
        const headerSeconds = Number(res.headers.get("Retry-After"));
        const seconds = Number.isFinite(payload.retryAfterSeconds) && payload.retryAfterSeconds! > 0
          ? payload.retryAfterSeconds!
          : headerSeconds;
        if (Number.isFinite(seconds) && seconds > 0) {
          const now = Date.now();
          setClockNow(now);
          setLoginLock({ identifier: username.trim().toLowerCase(), until: now + seconds * 1000 });
          setMfaSetup(null);
          setMfaRequired(false);
          setTotpCode("");
          setHint(null);
          return;
        }
      }
      if (!res.ok) {
        if (mfaSetup && payload.error && payload.error === localizeServerMessage(MFA_SESSION_EXPIRED, locale)) {
          setMfaSetup(null);
          setTotpCode("");
        }
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      if (payload.mfaRequired) {
        setMfaRequired(true);
        setHint(t("enterTotp"));
        return;
      }
      if (payload.mfaSetup && payload.setupToken && payload.secret && payload.uri) {
        setMfaSetup({ token: payload.setupToken, secret: payload.secret, uri: payload.uri });
        setHint(t("adminMfaSetup"));
        return;
      }
      if (payload.recoveryCodes) {
        setRecoveryCodes(payload.recoveryCodes);
        return;
      }
      setHint(
        mode === "login"
          ? t("loginSuccess")
          : (payload.message ?? t("registerSubmitted")),
      );
      if (mode === "login") {
        window.location.href = home;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : tc("unknownError");
      setHint(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loggedIn === null) {
    return (
      <AuthPageShell>
        <p className="text-sm text-fs-muted">{tc("loading")}</p>
      </AuthPageShell>
    );
  }

  if (recoveryCodes) {
    return <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">{t("recoveryTitle")}</h1>
      <p className="mt-3 text-sm text-fs-secondary">{t("recoveryBody")}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-md border border-fs-border bg-fs-elevated p-4 font-mono text-sm text-fs-text">
        {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
      </div>
      <button type="button" onClick={() => { window.location.href = home; }} className="mt-5 rounded-md bg-fs-accent px-4 py-2 text-sm text-white">{t("recoverySaved")}</button>
    </AuthPageShell>;
  }

  if (loggedIn) {
    return (
      <AccountProfileClient
        wechatStatus={searchParams.get("wechat")}
        wechatError={searchParams.get("wechat_error")}
      />
    );
  }

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">
        {mode === "login" ? t("welcomeBack") : t("createAccount")}
      </h1>
      <p className="mt-1 text-sm text-fs-muted">
        {method === "wechat"
          ? t("wechatSubtitle")
          : mode === "login"
            ? t("loginSubtitle")
            : t("registerSubtitle")}
      </p>

      <div
        className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-fs-border bg-fs-bg p-1"
        role="tablist"
        aria-label={t("tabsLabel")}
      >
        {(
          [
            { id: "login" as const, label: t("login") },
            { id: "register" as const, label: t("register") },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => {
              setMode(tab.id);
              setMfaRequired(false);
              setMfaSetup(null);
              setUseRecoveryCode(false);
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

      {method === "wechat" ? (
        <div className="mt-6">
          <WechatQrPanel mode="login" />
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit().catch(() => {});
          }}
        >
          <label className="block text-sm text-fs-secondary">
            {mode === "login" ? t("account") : t("username")}
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === "login" ? t("identifierPlaceholder") : t("usernamePlaceholder")}
              className={authInputClass}
            />
          </label>

          {mode === "register" ? (
            <>
              <label className="block text-sm text-fs-secondary">
                {t("email")}
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
                {t("phone")}
                {phoneOptional ? t("optionalSuffix") : ""}
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={phoneOptional ? t("phoneOptionalPlaceholder") : t("phonePlaceholder")}
                  className={authInputClass}
                  required={!phoneOptional}
                />
              </label>
            </>
          ) : null}

          {mfaSetup ? (
            <div className="rounded-md border border-fs-border bg-fs-elevated p-3 text-sm text-fs-secondary">
              <p>{t("mfaKeyLabel")}</p>
              <code className="mt-1 block break-all text-fs-text">{mfaSetup.secret}</code>
              <p className="mt-2 text-xs">{t("mfaKeyHelp")}</p>
            </div>
          ) : null}

          <label className="block text-sm text-fs-secondary">
            {t("password")}
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "login" ? t("passwordPlaceholder") : t("newPasswordPlaceholder")}
              className={authInputClass}
              disabled={!!mfaSetup}
            />
          </label>

          {mfaRequired || mfaSetup ? (
            <label className="block text-sm text-fs-secondary">
              {t("mfaCode")}
              <input
                inputMode={useRecoveryCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                pattern={useRecoveryCode ? "[A-Fa-f0-9]{16}" : "[0-9]{6}"}
                maxLength={useRecoveryCode ? 16 : 6}
                value={totpCode}
                onChange={(e) => setTotpCode(useRecoveryCode ? e.target.value.replace(/[^a-fA-F0-9]/g, "").toUpperCase() : e.target.value.replace(/\D/g, ""))}
                placeholder={useRecoveryCode ? t("recoveryCodePlaceholder") : t("totpPlaceholder")}
                className={authInputClass}
                required
              />
            </label>
          ) : null}
          {mfaRequired && !mfaSetup ? <button type="button" className="text-sm text-fs-accent-text" onClick={() => { setUseRecoveryCode((value) => !value); setTotpCode(""); }}>{useRecoveryCode ? t("useTotp") : t("useRecovery")}</button> : null}

          <button
            type="submit"
            disabled={
              loading ||
              remainingLockSeconds > 0 ||
              !username.trim() ||
              (!password && !mfaSetup) ||
              ((mfaRequired || mfaSetup) && totpCode.length !== (useRecoveryCode ? 16 : 6)) ||
              (mode === "register" && (!email.trim() || (!phoneOptional && !phone.trim())))
            }
            className="w-full rounded-md bg-fs-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
          >
            {loading ? tc("submitting") : remainingLockSeconds > 0 ? t("waitFor", { time: remainingLockLabel }) : mfaSetup ? t("verifyAndLogin") : mode === "login" ? t("login") : t("registerAndSend")}
          </button>

          {mode === "login" ? (
            <div className="flex items-center justify-between text-sm">
              <Link href="/auth/recover?kind=username" className="text-fs-accent-text hover:underline">
                {t("findUsername")}
              </Link>
              <Link href="/auth/recover?kind=password" className="text-fs-accent-text hover:underline">
                {t("forgotPassword")}
              </Link>
            </div>
          ) : null}
        </form>
      )}

      {wechatEnabled ? (
        <>
          <div className="mt-6 flex items-center gap-3 text-xs text-fs-muted">
            <span className="h-px flex-1 bg-fs-border" />
            {t("or")}
            <span className="h-px flex-1 bg-fs-border" />
          </div>
          <button
            type="button"
            onClick={() => {
              setMethod(method === "wechat" ? "password" : "wechat");
              setHint(null);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-fs-border px-4 py-2.5 text-sm font-medium text-fs-secondary transition hover:bg-fs-elevated"
          >
            {method === "wechat" ? (
              mode === "login" ? (
                t("usePassword")
              ) : (
                t("useEmailRegister")
              )
            ) : (
              <>
                <WechatIcon />
                {mode === "login" ? t("wechatLogin") : t("wechatRegister")}
              </>
            )}
          </button>
        </>
      ) : null}

      {remainingLockSeconds > 0 ? (
        <p role="status" className="mt-4 break-words rounded-md border border-fs-border bg-fs-elevated p-3 text-sm text-fs-secondary">
          {t.rich("lockedNotice", {
            time: () => <strong className="tabular-nums text-fs-text">{remainingLockLabel}</strong>,
          })}
        </p>
      ) : hint ? <p className="mt-4 text-sm text-fs-secondary">{hint}</p> : null}
    </AuthPageShell>
  );
}

function WechatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#07C160]" aria-hidden>
      <path d="M8.7 3C4.9 3 2 5.6 2 8.8c0 1.8 1 3.4 2.5 4.5l-.6 1.9 2.2-1.1c.8.2 1.6.4 2.6.4h.6a5.3 5.3 0 0 1-.2-1.5c0-3.1 2.9-5.6 6.5-5.6h.6C15.6 4.8 12.5 3 8.7 3Zm-2.3 3a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM15.8 8.4c-3.2 0-5.8 2.2-5.8 4.9s2.6 4.9 5.8 4.9c.7 0 1.4-.1 2-.3l1.9 1-.5-1.6c1.4-.9 2.3-2.4 2.3-4 0-2.7-2.6-4.9-5.7-4.9Zm-2 2.9a.7.7 0 1 1 0 1.5.7.7 0 0 1 0-1.5Zm4 0a.7.7 0 1 1 0 1.5.7.7 0 0 1 0-1.5Z" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AuthPageShell,
  authInputClass,
  authReadonlyInputClass,
} from "@/components/auth/AuthPageShell";
import { WechatQrPanel } from "@/components/auth/WechatQrPanel";

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

const PLAN_LABELS: Record<UserProfile["plan"], string> = {
  standard: "普通用户",
  pro: "Pro 用户",
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
      ? `微信操作失败：${wechatError}`
      : wechatStatus === "welcome"
        ? "微信注册成功，已赠送 Pro 试用。建议补充邮箱、手机号并设置密码。"
        : wechatStatus === "bound"
          ? "微信绑定成功，之后可直接扫码登录"
          : null,
  );

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("未登录");
        const j = (await r.json()) as { user?: UserProfile };
        return j.user ?? null;
      })
      .then((u) => {
        if (!u) throw new Error("未登录");
        setProfile(u);
        setEmail(u.email);
        setPhone(u.phone);
      })
      .catch((e) => setHint(e instanceof Error ? e.message : "加载失败"));
    fetch("/api/auth/wechat/config?probe=1", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ enabled?: boolean }>)
      .then((j) => setWechatEnabled(!!j.enabled))
      .catch(() => setWechatEnabled(false));
  }, []);

  const save = async () => {
    if (!profile) return;
    if (newPassword && newPassword !== confirmPassword) {
      setHint("两次输入的新密码不一致");
      return;
    }
    if (newPassword && !currentPassword && profile.hasPassword !== false) {
      setHint("修改密码需填写当前密码");
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
      setHint("账户信息已保存");
    } catch (e) {
      setHint(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  const unbind = async () => {
    if (!window.confirm("解绑后将无法使用该微信扫码登录，确定解绑？")) return;
    setWechatHint(null);
    try {
      const res = await fetch("/api/auth/wechat/unbind", { method: "POST" });
      const payload = (await res.json()) as {
        user?: UserProfile;
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      if (payload.user) setProfile(payload.user);
      setWechatHint("已解绑微信");
    } catch (e) {
      setWechatHint(e instanceof Error ? e.message : "解绑失败");
    }
  };

  if (!profile && !hint) {
    return (
      <AuthPageShell>
        <p className="text-sm text-fs-muted">加载中…</p>
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
      ? `试用中（至 ${fmtDate(profile.trialEndsAt)}）`
      : `Pro（至 ${fmtDate(profile.planExpiresAt)}）`
    : (PLAN_LABELS[profile.plan] ?? profile.plan);

  return (
    <AuthPageShell>
      <h1 className="text-xl font-semibold text-fs-text">个人账户</h1>
      <p className="mt-1 text-sm text-fs-muted">
        修改邮箱、手机号或登录密码。会员续费请前往定价页。
      </p>

      <div className="mt-4 rounded-lg border border-fs-border bg-fs-elevated/40 px-4 py-3 text-sm">
        <p className="text-fs-text">
          会员状态：<span className="font-medium">{membershipLabel}</span>
        </p>
        <p className="mt-1 text-xs text-fs-muted">回测积分余额：{profile.creditBalance ?? 0}</p>
        <Link
          href="/pricing"
          className="mt-2 inline-block text-sm font-medium text-fs-accent-text underline"
        >
          升级 / 续费 Pro
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
          用户名
          <input value={profile.username} readOnly className={authReadonlyInputClass} />
        </label>
        <label className="block text-sm text-fs-secondary">
          会员类型
          <input value={membershipLabel} readOnly className={authReadonlyInputClass} />
        </label>
        <label className="block text-sm text-fs-secondary">
          管理员
          <input
            value={profile.role === "admin" ? "是" : "否"}
            readOnly
            className={authReadonlyInputClass}
          />
        </label>
        <label className="block text-sm text-fs-secondary">
          邮箱{contactOptional ? "（选填）" : ""}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            required={!contactOptional}
          />
        </label>
        <label className="block text-sm text-fs-secondary">
          手机号{contactOptional ? "（选填）" : ""}
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={contactOptional ? "可选" : "11 位中国大陆手机号"}
            className={authInputClass}
            required={!contactOptional}
          />
        </label>

        <div className="rounded-lg border border-fs-border bg-fs-bg px-4 py-3">
          <p className="text-xs font-medium text-fs-muted">
            {hasPassword ? "修改密码（可选）" : "设置登录密码（可选，设置后也可用用户名密码登录）"}
          </p>
          <div className="mt-3 space-y-3">
            {hasPassword ? (
              <label className="block text-sm text-fs-secondary">
                当前密码
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
              新密码
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={authInputClass}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-sm text-fs-secondary">
              确认新密码
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
          {loading ? "保存中…" : "保存"}
        </button>
      </form>

      {wechatEnabled || profile.wechatBound ? (
        <section className="mt-8 rounded-lg border border-fs-border bg-fs-bg px-4 py-3">
          <p className="text-xs font-medium text-fs-muted">微信登录</p>
          {profile.wechatBound ? (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-fs-text">
                已绑定
                {profile.wechatNickname ? `：${profile.wechatNickname}` : ""}
              </span>
              <button
                type="button"
                onClick={() => unbind().catch(() => {})}
                className="rounded-md border border-fs-border px-3 py-1.5 text-xs text-fs-secondary hover:bg-fs-elevated"
              >
                解绑
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
                取消
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-fs-muted">未绑定，绑定后可扫码登录本账号</span>
              <button
                type="button"
                onClick={() => {
                  setBinding(true);
                  setWechatHint(null);
                }}
                className="rounded-md border border-fs-border px-3 py-1.5 text-xs text-fs-secondary hover:bg-fs-elevated"
              >
                绑定微信
              </button>
            </div>
          )}
          {wechatHint ? <p className="mt-2 text-sm text-fs-secondary">{wechatHint}</p> : null}
        </section>
      ) : null}
    </AuthPageShell>
  );
}

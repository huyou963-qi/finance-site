"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  phone: string;
  emailVerifiedAt: string;
  role: "admin" | "user";
  plan: "standard" | "pro";
};

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

function MenuSection({ title }: { title: string }) {
  return (
    <div className="mt-1 border-t border-fs-border px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-fs-muted first:mt-0 first:border-t-0">
      {title}
    </div>
  );
}

function MenuRow({
  label,
  hint,
  href,
  onClick,
  danger,
  active,
}: {
  label: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  const cls = `flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-fs-elevated ${
    danger ? "text-fs-negative" : active ? "bg-fs-accent-soft text-fs-accent-text" : "text-fs-text"
  }`;
  const inner = (
    <>
      <span>{label}</span>
      {hint ? <span className="text-xs text-fs-muted">{hint}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

function GuestMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-72 overflow-hidden rounded-lg border border-fs-border bg-fs-bg shadow-xl">
      <div className="border-b border-fs-border px-4 py-3">
        <p className="text-sm font-medium text-fs-text">账户</p>
        <p className="mt-0.5 text-xs text-fs-muted">登录后同步宏观模板与偏好</p>
      </div>
      <MenuRow label="登录" href="/auth" onClick={onClose} />
      <MenuRow label="注册" href="/auth?register=1" onClick={onClose} />
      <div className="border-t border-fs-border px-4 py-2.5 text-xs text-fs-muted">
        忘记密码请在登录页联系管理员
      </div>
    </div>
  );
}

function UserMenu({
  user,
  pathname,
  onClose,
  onLogout,
}: {
  user: AuthUser;
  pathname: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const verified = Boolean(user.emailVerifiedAt);
  const isAdmin = user.role === "admin";
  const authActive = pathname === "/auth" || pathname.startsWith("/auth/");
  const adminDataActive =
    pathname === "/admin/data-catalog" || pathname.startsWith("/admin/data-catalog/");
  const adminUsersActive = pathname === "/admin/users" || pathname.startsWith("/admin/users/");
  const adminErrorsActive =
    pathname === "/admin/error-reports" || pathname.startsWith("/admin/error-reports/");

  const displayEmail = user.email || user.username;

  return (
    <div className="w-80 overflow-hidden rounded-lg border border-fs-border bg-fs-bg shadow-xl">
      <div className="flex items-center gap-3 border-b border-fs-border px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fs-accent-soft text-fs-accent-text">
          <UserIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fs-text">{displayEmail}</p>
          <p className="text-xs text-fs-muted">
            {user.username}
            {isAdmin ? " · 管理员" : ""}
            {verified ? " · 已验证" : " · 未验证邮箱"}
          </p>
        </div>
      </div>

      <MenuSection title="账户" />
      <MenuRow label="个人资料" href="/auth" active={authActive} onClick={onClose} />
      {!verified ? <MenuRow label="验证邮箱" href="/auth/verify" onClick={onClose} /> : null}

      <MenuSection title="偏好" />
      <MenuRow label="宏观图表" href="/macro" onClick={onClose} />

      {isAdmin ? (
        <>
          <MenuSection title="管理" />
          <MenuRow
            label="数据更新目录"
            href="/admin/data-catalog"
            active={adminDataActive}
            onClick={onClose}
          />
          <MenuRow
            label="用户管理"
            href="/admin/users"
            active={adminUsersActive}
            onClick={onClose}
          />
          <MenuRow
            label="用户反馈"
            href="/admin/error-reports"
            active={adminErrorsActive}
            onClick={onClose}
          />
        </>
      ) : null}

      <MenuSection title="通用" />
      <MenuRow
        label="退出登录"
        danger
        onClick={() => {
          onClose();
          onLogout();
        }}
      />
    </div>
  );
}

export function UserAccountMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const j = (await res.json()) as { user?: AuthUser };
      setUser(j.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadUser().catch(() => {});
  }, [pathname, loadUser]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/auth";
  };

  const authActive = pathname === "/auth" || pathname.startsWith("/auth/");

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? "账户菜单" : "登录"}
        title={user ? `账户：${user.username}` : "登录"}
        onClick={() => setOpen((v) => !v)}
        className={`rounded-md p-2 transition outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50 ${
          open || (authActive && !user)
            ? "bg-fs-accent-soft text-fs-accent-text ring-1 ring-fs-accent/25"
            : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
        }`}
      >
        <UserIcon className="h-5 w-5" />
      </button>
      {open && loaded ? (
        <div className="absolute right-0 top-full z-50 mt-2" role="menu">
          {user ? (
            <UserMenu user={user} pathname={pathname} onClose={() => setOpen(false)} onLogout={logout} />
          ) : (
            <GuestMenu onClose={() => setOpen(false)} />
          )}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/** 微信官方内嵌二维码脚本；实例化后在容器里渲染一个 iframe，扫码确认后顶层窗口跳到 redirect_uri */
const WX_LOGIN_SCRIPT = "https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js";
/** state cookie 10 分钟过期，提前刷新二维码以免扫了一个服务端已不认的码 */
const REFRESH_MS = 8 * 60 * 1000;

type WxLoginCtor = new (opts: {
  self_redirect: boolean;
  id: string;
  appid: string;
  scope: string;
  redirect_uri: string;
  state: string;
  style?: "black" | "white";
  stylelite?: number;
}) => unknown;

type WechatConfig =
  | { enabled: false }
  | { enabled: true; appId: string; redirectUri: string; state: string };

let scriptPromise: Promise<void> | null = null;

function loadWxLogin(): Promise<void> {
  if ((window as unknown as { WxLogin?: WxLoginCtor }).WxLogin) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = WX_LOGIN_SCRIPT;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scriptPromise = null;
        reject(new Error("微信二维码加载失败"));
      };
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

export function WechatQrPanel({ mode }: { mode: "login" | "bind" }) {
  const containerId = `wx-qr-${mode}`;
  const [status, setStatus] = useState<"loading" | "ready" | "disabled" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setStatus("loading");
    setError(null);

    (async () => {
      const res = await fetch(`/api/auth/wechat/config?mode=${mode}`, { cache: "no-store" });
      const cfg = (await res.json()) as WechatConfig & { error?: string };
      if (!res.ok) throw new Error(cfg.error ?? `HTTP ${res.status}`);
      if (!cfg.enabled) {
        if (mounted.current) setStatus("disabled");
        return;
      }
      await loadWxLogin();
      if (!mounted.current) return;
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = "";
      const WxLogin = (window as unknown as { WxLogin: WxLoginCtor }).WxLogin;
      new WxLogin({
        self_redirect: false,
        id: containerId,
        appid: cfg.appId,
        scope: "snsapi_login",
        redirect_uri: encodeURIComponent(cfg.redirectUri),
        state: cfg.state,
        style: "black",
        stylelite: 1,
      });
      setStatus("ready");
    })().catch((e) => {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "加载失败");
      setStatus("error");
    });

    const timer = window.setTimeout(() => setNonce((n) => n + 1), REFRESH_MS);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
    };
  }, [mode, containerId, nonce]);

  if (status === "disabled") {
    return <p className="py-6 text-center text-sm text-fs-muted">微信登录暂未开放</p>;
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full">
        <div id={containerId} className="flex min-h-[300px] w-full justify-center" />
        {status !== "ready" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-fs-muted">
            {status === "error" ? (
              <span>
                {error}，
                <button
                  type="button"
                  onClick={() => setNonce((n) => n + 1)}
                  className="text-fs-accent-text underline"
                >
                  重试
                </button>
              </span>
            ) : (
              "二维码加载中…"
            )}
          </div>
        ) : null}
      </div>
      <a
        href={`/api/auth/wechat/start?mode=${mode}`}
        className="mt-2 text-xs text-fs-muted underline hover:text-fs-secondary"
      >
        二维码无法显示？在微信官方页面扫码
      </a>
    </div>
  );
}

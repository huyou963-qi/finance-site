import Script from "next/script";
import { baiduTongjiId } from "@/lib/analytics/baiduTongji";

/**
 * 加载百度统计 hm.js。自动 PV 关闭：所有 PV 由 PageViewTracker 在路由切换时统一发送
 * （首屏也由它发），与自建统计口径一致、且不会首屏重复计数。
 * 注意：百度统计后台「单页应用设置」保持关闭，否则会重复计数。
 */
export function BaiduTongjiScript() {
  const id = baiduTongjiId();
  if (!id) return null;
  return (
    <Script id="baidu-tongji" strategy="afterInteractive">
      {`window._hmt=window._hmt||[["_setAutoPageview",false]];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?${id}";hm.async=true;document.head.appendChild(hm);})();`}
    </Script>
  );
}

import Script from "next/script";
import { BAIDU_TONGJI_ID } from "@/lib/analytics/baiduTongji";

/**
 * 百度统计官方代码（tongji.baidu.com →「代码获取」）。next/script 以 afterInteractive
 * 注入 <head>，等效于官方说明的「加到全部页面 </head> 前」——本站所有页面共用根 layout。
 *
 * 唯一改动：关闭自动 PV。本站是单页应用，站内跳转不重新加载页面，官方代码只会统计首屏；
 * PV 统一由 BaiduPageView 在每次路由切换时发送（首屏也由它发）。
 * 因此百度后台「单页应用设置」必须保持关闭，否则同一次跳转会被计两次。
 */
export function BaiduTongjiScript() {
  return (
    <Script id="baidu-tongji" strategy="afterInteractive">
      {`var _hmt = _hmt || [];
_hmt.push(["_setAutoPageview", false]);
(function() {
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?${BAIDU_TONGJI_ID}";
  var s = document.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(hm, s);
})();`}
    </Script>
  );
}

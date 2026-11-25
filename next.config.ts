import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** 界面语言：不分路由，按 cookie 取语言（见 docs/I18N.md） */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // React 19 的 hoisted metadata 在流式插入与路由卸载交错时可能重复删除节点。
  // 所有 UA 等待 metadata 就绪，统一由 head 管理，避免 body 中的流式 metadata。
  htmlLimitedBots: /.*/,
  // 给静态资源附上部署标识，避免发布后 CDN/浏览器复用旧部署的响应。
  deploymentId: process.env.GITHUB_SHA || undefined,
  /**
   * 关闭开发模式下全局注入的左下角圆形 Next 徽标（字母 N）。
   * 仅影响 `next dev`；`next build` / `next start` 生产环境本身不会显示该按钮。
   */
  devIndicators: false,
  /** TWS Socket API（@stoqey/ib）仅服务端使用 */
  serverExternalPackages: ["@stoqey/ib"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default withNextIntl(nextConfig);

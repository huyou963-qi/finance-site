import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/** 界面语言：不分路由，按 cookie 取语言（见 docs/I18N.md） */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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

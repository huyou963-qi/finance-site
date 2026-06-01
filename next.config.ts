import type { NextConfig } from "next";

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

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** yahoo-finance2 在服务端拉 Yahoo，避免误打进浏览器 bundle */
  serverExternalPackages: ["yahoo-finance2", "@stoqey/ib"],
  /**
   * 关闭开发模式下全局注入的左下角圆形 Next 徽标（字母 N）。
   * 仅影响 `next dev`；`next build` / `next start` 生产环境本身不会显示该按钮。
   */
  devIndicators: false,
};

export default nextConfig;

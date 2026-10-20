import type { FeatureGateResult } from "./featureAccess";

const TEMPORARY_DATABASE_ERRORS = new Set(["P1001", "P1002", "P1017", "P2024"]);

/** 数据库暂时不可用时保持关闭；不能把校验失败当成游客或已授权。 */
export async function checkFeatureGateAvailability(
  featureId: string,
  check: (featureId: string) => Promise<FeatureGateResult>,
  log: (message: string, details: object) => void = console.error,
): Promise<FeatureGateResult | null> {
  try {
    return await check(featureId);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (typeof code !== "string" || !TEMPORARY_DATABASE_ERRORS.has(code)) throw error;
    // 不记录会话 token、数据库连接串或完整 Prisma 查询。
    log("[FeatureGate] 权限校验暂时不可用", { featureId, code });
    return null;
  }
}

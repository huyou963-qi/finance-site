import type { NextRequest } from "next/server";
import {
  getViewerFromRequest,
  loadFeatureAccessPolicy,
} from "@/lib/access/featureAccess";
import { resolveFeatureAccess } from "@/lib/access/featureCatalog";
import { ENGLISH_FEATURE_ID } from "@/i18n/locales";
import { requestLocale } from "@/i18n/serverMessages";
import type { SignupChannel } from "@/lib/auth/phonePolicy";

/**
 * 接口请求来自哪个站：语言取 NEXT_LOCALE cookie；cookie 为 en 时再确认英文对该访问者开放，
 * 防止手动设置 cookie 绕过中文站规则（如注册手机号必填）。中文请求不打库。
 */
export async function requestSignupChannel(req: NextRequest): Promise<SignupChannel> {
  const locale = requestLocale(req);
  if (locale !== "en") return { locale, englishAllowed: false };
  const [policy, viewer] = await Promise.all([loadFeatureAccessPolicy(), getViewerFromRequest(req)]);
  return { locale, englishAllowed: resolveFeatureAccess(policy, ENGLISH_FEATURE_ID, viewer) === "allowed" };
}

/**
 * 手机号是否必填（纯函数，有单测）。
 *
 * 中文站：注册必须填写中国大陆手机号（实名要求）。
 * 英文站面向海外用户：可只用邮箱注册（2026-11 产品决定）。「海外」以「从英文站操作且英文已对该身份开放」
 * 判定——只看 cookie 会被手动设置绕过，所以调用方要传入功能权限的结果。
 * 已有手机号的账号在英文站也不能清空手机号，避免中文账号借英文站去掉实名信息。
 */

export type SignupChannel = { locale: "zh" | "en"; englishAllowed: boolean };

/** 从英文站、且英文已对当前访问者开放 */
export function isOverseasChannel(channel: SignupChannel): boolean {
  return channel.locale === "en" && channel.englishAllowed;
}

export function registrationPhoneRequired(channel: SignupChannel): boolean {
  return !isOverseasChannel(channel);
}

/**
 * 修改资料时手机号是否必填。
 * @param baseRequired 原规则（非管理员、非微信注册账号必填）
 * @param currentPhone 账号当前手机号；有号码时不允许在英文站清空
 */
export function profilePhoneRequired(
  baseRequired: boolean,
  currentPhone: string | null | undefined,
  channel: SignupChannel,
): boolean {
  if (!baseRequired) return false;
  if (isOverseasChannel(channel) && !currentPhone) return false;
  return true;
}

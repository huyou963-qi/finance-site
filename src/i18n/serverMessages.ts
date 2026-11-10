import { LOCALE_COOKIE, parseLocale, type AppLocale } from "@/i18n/locales";

/**
 * 服务端返回给用户的提示（接口 error/message、微信回跳的 wechat_error）的英文版。
 *
 * 业务代码照旧抛中文 Error；接口在返回前用 `localizeServerMessage` 按请求语言换成英文。
 * 键是**完整的中文原文**：改了 src/lib/auth.ts 等处的报错文字，要同步改这里
 * （`serverMessages.test.ts` 会扫描 auth.ts，漏登记会失败）。查不到的原样返回中文。
 * 英文为 AI 初译，人工抽查。
 */
export const SERVER_MESSAGES_EN: Readonly<Record<string, string>> = {
  // 通用
  未知错误: "Unknown error",
  请先登录: "Please log in first",
  提交失败: "Couldn't submit",
  设置失败: "Setup failed",
  重置失败: "Couldn't reset password",
  请从本站页面操作: "Please do this from a page on this site",
  跨站来源白名单配置无效: "Invalid cross-site origin configuration",

  // 注册与资料校验（src/lib/auth.ts）
  "首次创建管理员前须配置至少 12 位 ADMIN_PASSWORD":
    "ADMIN_PASSWORD (at least 12 characters) must be set before creating the first admin",
  "用户名需为 3-32 位，可用字母数字._-": "Username must be 3–32 characters: letters, numbers, . _ -",
  "密码长度至少 8 位": "Password must be at least 8 characters",
  邮箱格式不正确: "Invalid email address",
  "手机号格式不正确，请填写11位中国大陆手机号":
    "Invalid mobile number. Please enter an 11-digit mainland China mobile number",
  请填写邮箱: "Please enter your email",
  请填写手机号: "Please enter your mobile number",
  用户名已存在: "That username is taken",
  邮箱已被注册: "That email is already registered",
  手机号已被注册: "That mobile number is already registered",
  "用户名已存在，请更换后重试": "That username is taken. Please choose another and try again",
  "邮箱已被注册，请更换后重试": "That email is already registered. Please use another and try again",
  "手机号已被注册，请更换后重试":
    "That mobile number is already registered. Please use another and try again",
  "生成用户名失败，请重试": "Couldn't create a username. Please try again",

  // 邮箱验证
  验证链接无效: "Invalid verification link",
  "验证链接已失效，请重新注册": "This verification link has expired. Please sign up again",

  // 登录与双重验证
  "该账号未设置密码，请使用微信扫码登录或通过邮箱重置密码":
    "This account has no password. Log in with WeChat or reset your password by email",
  账号或密码错误: "Incorrect account or password",
  "账号、密码或验证码错误": "Incorrect account, password or verification code",
  "设置会话已过期，请重新登录": "The setup session has expired. Please log in again",
  "验证码错误，请核对验证器时间后重试":
    "Incorrect code. Check your authenticator's clock and try again",
  管理员双重验证已经绑定: "Admin two-factor authentication is already set up",
  无管理员权限: "Admin access required",
  管理员密码或验证码错误: "Incorrect admin password or verification code",
  账号暂不可登录: "This account can't log in right now",
  管理员请使用密码与双重验证码登录: "Admins must log in with a password and two-factor code",
  "登录尝试过于频繁，请等待倒计时结束后重试": "Too many login attempts. Please wait for the countdown to finish",

  // 找回与重置
  "该账号没有邮箱，无法发送重置链接": "This account has no email, so we can't send a reset link",
  已关闭账号不能发送重置链接: "Reset links can't be sent for closed accounts",
  重置链接无效或已过期: "This reset link is invalid or has expired",
  找回类型不正确: "Invalid recovery type",
  "如果该邮箱已绑定账户，我们会向它发送恢复邮件，请检查收件箱和垃圾邮件。":
    "If that email belongs to an account, we've sent a recovery email. Please check your inbox and spam folder.",
  "密码已重置，请使用新密码登录": "Password reset. Please log in with your new password",

  // 注册结果
  "验证邮件已发送，请查收并点击确认链接完成注册":
    "Verification email sent. Click the link in it to finish signing up",
  "SMTP 未配置，验证链接已写入 .data/mail-outbox.log":
    "SMTP isn't configured; the verification link was written to .data/mail-outbox.log",
  "邮箱确认成功，账号已激活，请登录": "Email confirmed and account activated. Please log in",

  // 个人资料
  用户不存在: "User not found",
  "修改密码需提供当前密码": "Enter your current password to change it",
  当前密码不正确: "Current password is incorrect",
  无权修改角色: "You can't change roles",
  角色不合法: "Invalid role",
  无权修改会员类型: "You can't change the membership type",
  没有可更新的字段: "Nothing to update",

  // 微信
  "该微信已绑定其他账号，请先用微信登录该账号解绑":
    "This WeChat account is linked to another account. Log in with WeChat and unlink it there first",
  "当前账号已绑定其他微信，请先解绑": "This account is linked to another WeChat account. Unlink it first",
  当前账号未绑定微信: "This account isn't linked to WeChat",
  "请先设置登录密码再解绑微信，否则将无法登录":
    "Set a password before unlinking WeChat, or you won't be able to log in",
  请先补充邮箱和手机号再解绑微信: "Add an email and mobile number before unlinking WeChat",
  已取消微信授权: "WeChat authorization was cancelled",
  "二维码已过期，请刷新后重新扫码": "The QR code has expired. Refresh and scan again",
  "登录已失效，请重新登录后绑定": "Your session has expired. Log in again to link WeChat",
  微信登录失败: "WeChat login failed",
  微信登录未配置: "WeChat login isn't configured",
  请先登录再绑定微信: "Log in before linking WeChat",
};

export function localizeServerMessage(message: string, locale: AppLocale): string {
  if (locale !== "en") return message;
  return SERVER_MESSAGES_EN[message] ?? message;
}

/**
 * 接口请求的界面语言。浏览 /en 页面时 middleware 会写 NEXT_LOCALE=en，
 * 同站 fetch 会带上它；没有就是中文。只决定提示文字的语言，不涉及权限。
 */
export function requestLocale(req: { cookies: { get(name: string): { value: string } | undefined } }): AppLocale {
  return parseLocale(req.cookies.get(LOCALE_COOKIE)?.value);
}

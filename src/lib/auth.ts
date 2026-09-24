import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessSummary, userHasProAccess } from "@/lib/billing/access";
import { TRIAL_DAYS } from "@/lib/billing/pricing";
import {
  parseUserPlan,
  validateUserPlan,
  USER_PLAN_LABELS,
  type Role,
  type UserPlan,
} from "@/lib/auth/types";

export type { Role, UserPlan };
export { USER_PLAN_LABELS, parseUserPlan, userHasProAccess };

export type UserRecord = {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  emailVerifiedAt?: string;
  passHash: string;
  passSalt: string;
  role: Role;
  createdAt: string;
};

const COOKIE_NAME = "finance_sid";
const SESSION_DAYS = 30;
const REGISTER_TOKEN_MINUTES = 30;
const RECOVERY_TOKEN_MINUTES = 30;
const RECOVERY_COOLDOWN_SECONDS = 60;

export type AccountRecoveryKind = "username" | "password";

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return crypto.randomUUID();
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function safeEqHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashRecoveryToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeCookie(token: string, expiresAt: string): string {
  const maxAge = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** If DB has no users yet, create the initial admin (same behavior as former empty auth.json). */
async function ensureAdminSeed(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;
  const adminUser = process.env.ADMIN_USERNAME?.trim() || "admin";
  const adminPass = process.env.ADMIN_PASSWORD?.trim() || "admin123456";
  const salt = crypto.randomBytes(16).toString("hex");
  await prisma.user.create({
    data: {
      id: uid(),
      username: adminUser,
      passHash: hashPassword(adminPass, salt),
      passSalt: salt,
      role: "admin",
      createdAt: new Date(),
    },
  });
}

function validateUsername(username: string) {
  const u = username.trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(u)) {
    throw new Error("用户名需为 3-32 位，可用字母数字._-");
  }
  return u;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new Error("密码长度至少 8 位");
  }
  return password;
}

function validateEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new Error("邮箱格式不正确");
  }
  return e;
}

function validatePhone(phone: string) {
  let p = phone.trim().replace(/[\s-]/g, "");
  if (p.startsWith("+86")) p = p.slice(3);
  else if (p.startsWith("86") && p.length === 13) p = p.slice(2);
  if (!/^1[3-9]\d{9}$/.test(p)) {
    throw new Error("手机号格式不正确，请填写11位中国大陆手机号");
  }
  return p;
}

function parseOptionalEmail(
  emailRaw: string | undefined | null,
  options?: { required?: boolean },
): string | null {
  const trimmed = (emailRaw ?? "").trim();
  if (!trimmed) {
    if (options?.required) throw new Error("请填写邮箱");
    return null;
  }
  return validateEmail(trimmed);
}

function parseOptionalPhone(
  phoneRaw: string | undefined | null,
  options?: { required?: boolean },
): string | null {
  const trimmed = (phoneRaw ?? "").trim();
  if (!trimmed) {
    if (options?.required) throw new Error("请填写手机号");
    return null;
  }
  return validatePhone(trimmed);
}

/** 邮箱/手机号是否必填：管理员与微信扫码注册的账号可不填（后者由微信实名兜底） */
function phoneRequiredForUser(user: { role: string; wechatOpenId?: string | null }): boolean {
  return user.role !== "admin" && !user.wechatOpenId;
}

/** 微信扫码注册的账号没有密码（passHash 为空），此时不可用密码登录，设置首个密码也无需当前密码 */
function userHasPassword(user: { passHash: string }): boolean {
  return user.passHash !== "";
}

function wechatSummary(u: {
  wechatOpenId: string | null;
  wechatNickname: string | null;
  wechatBoundAt: Date | null;
  passHash: string;
}) {
  return {
    wechatBound: !!u.wechatOpenId,
    wechatNickname: u.wechatNickname ?? "",
    wechatBoundAt: u.wechatBoundAt ? u.wechatBoundAt.toISOString() : null,
    hasPassword: userHasPassword(u),
  };
}

export async function registerUser(
  usernameRaw: string,
  passwordRaw: string,
  role: Role = "user",
  emailRaw: string,
  phoneRaw: string,
  emailVerifiedAt?: string,
  planRaw: UserPlan = "standard",
): Promise<{
  id: string;
  username: string;
  role: Role;
  plan: UserPlan;
  email: string;
  phone: string;
}> {
  const username = validateUsername(usernameRaw);
  const password = validatePassword(passwordRaw);
  const isAdmin = role === "admin";
  const email = parseOptionalEmail(emailRaw, { required: !isAdmin });
  const phone = parseOptionalPhone(phoneRaw, { required: !isAdmin });
  const plan = validateUserPlan(planRaw);
  await ensureAdminSeed();

  const existsName = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  if (existsName) throw new Error("用户名已存在");

  if (email) {
    const existsEmail = await prisma.user.findFirst({ where: { email } });
    if (existsEmail) throw new Error("邮箱已被注册");
  }

  if (phone) {
    const existsPhone = await prisma.user.findFirst({ where: { phone } });
    if (existsPhone) throw new Error("手机号已被注册");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const planExpiresAt =
    plan === "pro" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;
  const user = await prisma.user.create({
    data: {
      id: uid(),
      username,
      email,
      phone,
      emailVerifiedAt: emailVerifiedAt ? new Date(emailVerifiedAt) : null,
      passHash: hashPassword(password, salt),
      passSalt: salt,
      role,
      plan,
      planExpiresAt,
      createdAt: new Date(),
    },
  });

  return {
    id: user.id,
    username: user.username,
    role: user.role as Role,
    plan: parseUserPlan(user.plan),
    email: user.email ?? "",
    phone: user.phone ?? "",
  };
}

export async function requestRegistrationVerification(
  usernameRaw: string,
  passwordRaw: string,
  emailRaw: string,
  phoneRaw: string,
): Promise<{
  token: string;
  expiresAt: string;
  username: string;
  email: string;
  phone: string;
}> {
  const username = validateUsername(usernameRaw);
  const password = validatePassword(passwordRaw);
  const email = validateEmail(emailRaw);
  const phone = validatePhone(phoneRaw);

  await ensureAdminSeed();

  const existsName = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  if (existsName) throw new Error("用户名已存在");

  const existsEmail = await prisma.user.findFirst({ where: { email } });
  if (existsEmail) throw new Error("邮箱已被注册");

  const existsPhone = await prisma.user.findFirst({ where: { phone } });
  if (existsPhone) throw new Error("手机号已被注册");

  await prisma.pendingRegistration.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  await prisma.pendingRegistration.deleteMany({
    where: {
      OR: [
        { username: { equals: username, mode: "insensitive" } },
        { email: { equals: email, mode: "insensitive" } },
        { phone },
      ],
    },
  });

  const salt = crypto.randomBytes(16).toString("hex");
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = new Date(now + REGISTER_TOKEN_MINUTES * 60 * 1000);

  await prisma.pendingRegistration.create({
    data: {
      token,
      username,
      email,
      phone,
      passHash: hashPassword(password, salt),
      passSalt: salt,
      createdAt: new Date(),
      expiresAt,
    },
  });

  return { token, expiresAt: expiresAt.toISOString(), username, email, phone };
}

export async function verifyRegistrationToken(
  token: string,
): Promise<{ id: string; username: string; role: Role; plan: UserPlan; email: string; phone: string }> {
  const t = token.trim();
  if (!/^[a-f0-9]{64}$/i.test(t)) {
    throw new Error("验证链接无效");
  }

  await prisma.pendingRegistration.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const row = await prisma.pendingRegistration.findUnique({ where: { token: t } });
  if (!row) {
    throw new Error("验证链接已失效，请重新注册");
  }

  await ensureAdminSeed();

  const existsName = await prisma.user.findFirst({
    where: { username: { equals: row.username, mode: "insensitive" } },
  });
  if (existsName) {
    await prisma.pendingRegistration.delete({ where: { token: t } });
    throw new Error("用户名已存在，请更换后重试");
  }

  const existsEmail = await prisma.user.findFirst({
    where: { email: { equals: row.email, mode: "insensitive" } },
  });
  if (existsEmail) {
    await prisma.pendingRegistration.delete({ where: { token: t } });
    throw new Error("邮箱已被注册，请更换后重试");
  }

  const existsPhone = await prisma.user.findFirst({ where: { phone: row.phone } });
  if (existsPhone) {
    await prisma.pendingRegistration.delete({ where: { token: t } });
    throw new Error("手机号已被注册，请更换后重试");
  }

  const user = await prisma.$transaction(async (tx) => {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const u = await tx.user.create({
      data: {
        id: uid(),
        username: row.username,
        email: row.email,
        phone: row.phone,
        emailVerifiedAt: new Date(),
        passHash: row.passHash,
        passSalt: row.passSalt,
        role: "user",
        plan: "standard",
        trialEndsAt,
        createdAt: new Date(),
      },
    });
    await tx.pendingRegistration.delete({ where: { token: t } });
    return u;
  });

  return {
    id: user.id,
    username: user.username,
    role: user.role as Role,
    plan: parseUserPlan(user.plan),
    email: user.email!,
    phone: user.phone!,
  };
}

export async function loginUser(
  identifierRaw: string,
  passwordRaw: string,
): Promise<{ cookie: string; user: { id: string; username: string; role: Role } }> {
  const identifier = identifierRaw.trim();
  await ensureAdminSeed();

  await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  const normalizedPhone = (() => {
    try {
      return validatePhone(identifier);
    } catch {
      return null;
    }
  })();
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { username: { equals: identifier, mode: "insensitive" } },
        { email: { equals: identifier.toLowerCase(), mode: "insensitive" } },
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    },
  });
  const user = candidates.find(
    (candidate) =>
      userHasPassword(candidate) &&
      safeEqHex(hashPassword(passwordRaw, candidate.passSalt), candidate.passHash),
  );
  if (!user) {
    if (candidates.length > 0 && candidates.every((candidate) => !userHasPassword(candidate))) {
      throw new Error("该账号未设置密码，请使用微信扫码登录或通过邮箱重置密码");
    }
    throw new Error("账号或密码错误");
  }

  return {
    cookie: await createSessionCookie(user.id),
    user: { id: user.id, username: user.username, role: user.role as Role },
  };
}

/**
 * 创建邮箱恢复请求。找不到邮箱时返回 null，由 API 统一返回成功文案，避免泄露注册状态。
 * 60 秒内的重复请求也返回 null，防止同一邮箱被连续轰炸。
 */
export async function requestAccountRecovery(
  emailRaw: string,
  kind: AccountRecoveryKind,
): Promise<{ email: string; username: string; token: string | null } | null> {
  const email = validateEmail(emailRaw);
  await ensureAdminSeed();
  await prisma.accountRecoveryRequest.deleteMany({ where: { expiresAt: { lte: new Date() } } });

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!user) return null;

  const existing = await prisma.accountRecoveryRequest.findUnique({
    where: { userId_kind: { userId: user.id, kind } },
  });
  if (
    existing &&
    Date.now() - existing.createdAt.getTime() < RECOVERY_COOLDOWN_SECONDS * 1000
  ) {
    return null;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashRecoveryToken(token);
  const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_MINUTES * 60 * 1000);
  await prisma.accountRecoveryRequest.upsert({
    where: { userId_kind: { userId: user.id, kind } },
    update: { tokenHash, createdAt: new Date(), expiresAt },
    create: { userId: user.id, kind, tokenHash, expiresAt },
  });

  return { email: user.email!, username: user.username, token: kind === "password" ? token : null };
}

/** 使用一次性邮件令牌重置密码，并注销该账户全部旧会话。 */
export async function resetPasswordWithToken(tokenRaw: string, passwordRaw: string): Promise<void> {
  const token = tokenRaw.trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("重置链接无效或已过期");
  const password = validatePassword(passwordRaw);
  const tokenHash = hashRecoveryToken(token);
  const request = await prisma.accountRecoveryRequest.findUnique({ where: { tokenHash } });
  if (!request || request.kind !== "password" || request.expiresAt.getTime() <= Date.now()) {
    if (request) await prisma.accountRecoveryRequest.delete({ where: { id: request.id } });
    throw new Error("重置链接无效或已过期");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  await prisma.$transaction([
    prisma.user.update({
      where: { id: request.userId },
      data: { passSalt: salt, passHash: hashPassword(password, salt) },
    }),
    prisma.session.deleteMany({ where: { userId: request.userId } }),
    prisma.accountRecoveryRequest.deleteMany({ where: { userId: request.userId } }),
  ]);
}

/** 为已通过身份校验的用户建会话，返回 Set-Cookie 值（密码登录与微信登录共用） */
export async function createSessionCookie(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      token,
      userId,
      createdAt: new Date(),
      expiresAt,
    },
  });
  return makeCookie(token, expiresAt.toISOString());
}

export type WechatIdentity = {
  openId: string;
  unionId: string | null;
  nickname: string | null;
};

async function findUserByWechat(identity: WechatIdentity) {
  if (identity.unionId) {
    const byUnion = await prisma.user.findUnique({ where: { wechatUnionId: identity.unionId } });
    if (byUnion) return byUnion;
  }
  return prisma.user.findUnique({ where: { wechatOpenId: identity.openId } });
}

async function generateWechatUsername(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const candidate = `wx_${crypto.randomBytes(4).toString("hex")}`;
    const exists = await prisma.user.findFirst({
      where: { username: { equals: candidate, mode: "insensitive" } },
    });
    if (!exists) return candidate;
  }
  throw new Error("生成用户名失败，请重试");
}

/**
 * 微信扫码：已绑定则登录，未绑定则自动注册（与邮箱注册一样赠送试用期）。
 * 新账号无密码、无邮箱手机号，可在个人账户页补充。
 */
export async function loginOrRegisterWechat(
  identity: WechatIdentity,
): Promise<{ cookie: string; created: boolean; user: { id: string; username: string; role: Role } }> {
  await ensureAdminSeed();
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });

  let user = await findUserByWechat(identity);
  let created = false;
  if (user) {
    // 刷新昵称；早期只有 openid 的记录补上 unionid
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        wechatNickname: identity.nickname ?? user.wechatNickname,
        wechatUnionId: user.wechatUnionId ?? identity.unionId,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        id: uid(),
        username: await generateWechatUsername(),
        passHash: "",
        passSalt: "",
        role: "user",
        plan: "standard",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        wechatOpenId: identity.openId,
        wechatUnionId: identity.unionId,
        wechatNickname: identity.nickname,
        wechatBoundAt: new Date(),
        createdAt: new Date(),
      },
    });
    created = true;
  }

  return {
    cookie: await createSessionCookie(user.id),
    created,
    user: { id: user.id, username: user.username, role: user.role as Role },
  };
}

/** 已登录用户绑定微信；该微信已绑其他账号时报错 */
export async function bindWechatToUser(userId: string, identity: WechatIdentity): Promise<void> {
  const owner = await findUserByWechat(identity);
  if (owner && owner.id !== userId) {
    throw new Error("该微信已绑定其他账号，请先用微信登录该账号解绑");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("用户不存在");
  if (user.wechatOpenId && user.wechatOpenId !== identity.openId) {
    throw new Error("当前账号已绑定其他微信，请先解绑");
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      wechatOpenId: identity.openId,
      wechatUnionId: identity.unionId,
      wechatNickname: identity.nickname,
      wechatBoundAt: user.wechatBoundAt ?? new Date(),
    },
  });
}

/** 解绑微信；没有密码的账号解绑后将无法登录，故要求先设置密码与联系方式 */
export async function unbindWechatFromUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("用户不存在");
  if (!user.wechatOpenId) throw new Error("当前账号未绑定微信");
  if (!userHasPassword(user)) throw new Error("请先设置登录密码再解绑微信，否则将无法登录");
  if (user.role !== "admin" && (!user.email || !user.phone)) {
    throw new Error("请先补充邮箱和手机号再解绑微信");
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      wechatOpenId: null,
      wechatUnionId: null,
      wechatNickname: null,
      wechatBoundAt: null,
    },
  });
}

export async function logoutByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getUserByRequest(req: NextRequest): Promise<{
  id: string;
  username: string;
  role: Role;
} | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  await ensureAdminSeed();

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return { id: user.id, username: user.username, role: user.role as Role };
}

export async function listUsers() {
  await ensureAdminSeed();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email ?? "",
    phone: u.phone ?? "",
    emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : "",
    role: u.role as Role,
    plan: parseUserPlan(u.plan),
    planExpiresAt: u.planExpiresAt ? u.planExpiresAt.toISOString() : null,
    trialEndsAt: u.trialEndsAt ? u.trialEndsAt.toISOString() : null,
    creditBalance: u.creditBalance,
    ...accessSummary({
      role: u.role as Role,
      plan: u.plan,
      planExpiresAt: u.planExpiresAt,
      trialEndsAt: u.trialEndsAt,
      creditBalance: u.creditBalance,
    }),
    wechatBound: !!u.wechatOpenId,
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function getUserProfile(userId: string) {
  await ensureAdminSeed();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("用户不存在");
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? "",
    phone: user.phone ?? "",
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : "",
    role: user.role as Role,
    plan: parseUserPlan(user.plan),
    planExpiresAt: user.planExpiresAt ? user.planExpiresAt.toISOString() : null,
    trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
    creditBalance: user.creditBalance,
    ...accessSummary({
      role: user.role as Role,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
      trialEndsAt: user.trialEndsAt,
      creditBalance: user.creditBalance,
    }),
    ...wechatSummary(user),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function updateUserAccount(
  userId: string,
  patch: {
    email?: string;
    phone?: string;
    password?: string;
    role?: Role;
    plan?: UserPlan;
  },
  options?: { currentPassword?: string; byAdmin?: boolean },
) {
  await ensureAdminSeed();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("用户不存在");

  const data: {
    email?: string | null;
    phone?: string | null;
    passHash?: string;
    passSalt?: string;
    role?: string;
    plan?: string;
    planExpiresAt?: Date | null;
    trialEndsAt?: Date | null;
    emailVerifiedAt?: Date | null;
  } = {};

  if (patch.email !== undefined) {
    const email = parseOptionalEmail(patch.email, {
      required: phoneRequiredForUser(user),
    });
    if (email) {
      const existsEmail = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      });
      if (existsEmail) throw new Error("邮箱已被注册");
      data.email = email;
      if (email !== (user.email ?? "")) {
        data.emailVerifiedAt = options?.byAdmin ? new Date() : null;
      }
    } else {
      data.email = null;
      data.emailVerifiedAt = null;
    }
  }

  if (patch.phone !== undefined) {
    const phone = parseOptionalPhone(patch.phone, {
      required: phoneRequiredForUser(user),
    });
    if (phone) {
      const existsPhone = await prisma.user.findFirst({
        where: { phone, NOT: { id: userId } },
      });
      if (existsPhone) throw new Error("手机号已被注册");
      data.phone = phone;
    } else {
      data.phone = null;
    }
  }

  if (patch.password !== undefined && patch.password.trim()) {
    const password = validatePassword(patch.password);
    if (!options?.byAdmin && userHasPassword(user)) {
      const current = options?.currentPassword ?? "";
      if (!current) throw new Error("修改密码需提供当前密码");
      const passHash = hashPassword(current, user.passSalt);
      if (!safeEqHex(passHash, user.passHash)) {
        throw new Error("当前密码不正确");
      }
    }
    const salt = crypto.randomBytes(16).toString("hex");
    data.passSalt = salt;
    data.passHash = hashPassword(password, salt);
  }

  if (patch.role !== undefined) {
    if (!options?.byAdmin) throw new Error("无权修改角色");
    if (patch.role !== "admin" && patch.role !== "user") {
      throw new Error("角色不合法");
    }
    data.role = patch.role;
  }

  if (patch.plan !== undefined) {
    if (!options?.byAdmin) throw new Error("无权修改会员类型");
    data.plan = validateUserPlan(patch.plan);
    if (data.plan === "standard") {
      data.planExpiresAt = null;
    } else if (data.plan === "pro" && !user.planExpiresAt) {
      // 管理员手工开通且无到期日：默认一年
      data.planExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      data.trialEndsAt = null;
    }
  }

  if (Object.keys(data).length === 0) {
    throw new Error("没有可更新的字段");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return {
    id: updated.id,
    username: updated.username,
    email: updated.email ?? "",
    phone: updated.phone ?? "",
    emailVerifiedAt: updated.emailVerifiedAt ? updated.emailVerifiedAt.toISOString() : "",
    role: updated.role as Role,
    plan: parseUserPlan(updated.plan),
    planExpiresAt: updated.planExpiresAt ? updated.planExpiresAt.toISOString() : null,
    trialEndsAt: updated.trialEndsAt ? updated.trialEndsAt.toISOString() : null,
    creditBalance: updated.creditBalance,
    ...accessSummary({
      role: updated.role as Role,
      plan: updated.plan,
      planExpiresAt: updated.planExpiresAt,
      trialEndsAt: updated.trialEndsAt,
      creditBalance: updated.creditBalance,
    }),
    ...wechatSummary(updated),
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function getUserAccessRecord(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role as Role,
    plan: parseUserPlan(user.plan),
    planExpiresAt: user.planExpiresAt,
    trialEndsAt: user.trialEndsAt,
    creditBalance: user.creditBalance,
  };
}

/** cookie 名（供 next/headers 的服务端组件读取会话，避免各处硬编码） */
export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * 按会话 token 取用户的权限记录（角色 + 套餐 + 试用/到期 + 积分）。
 * 服务端组件用 `cookies()` 取 token 后调用；无效/过期会话返回 null。
 */
export async function getAccessUserByToken(token: string | null | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return getUserAccessRecord(session.userId);
}

export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type Role = "admin" | "user";
export type UserPlan = "standard" | "pro";

export const USER_PLAN_LABELS: Record<UserPlan, string> = {
  standard: "普通用户",
  pro: "Pro 用户",
};

function parseUserPlan(raw: string | null | undefined): UserPlan {
  return raw === "pro" ? "pro" : "standard";
}

function validateUserPlan(plan: string): UserPlan {
  const p = plan.trim().toLowerCase();
  if (p === "pro" || p === "standard") return p;
  throw new Error("会员类型不合法");
}

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

function phoneRequiredForUser(user: { role: Role }): boolean {
  return user.role !== "admin";
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
  usernameRaw: string,
  passwordRaw: string,
): Promise<{ cookie: string; user: { id: string; username: string; role: Role } }> {
  const username = usernameRaw.trim();
  await ensureAdminSeed();

  await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  if (!user) throw new Error("用户名或密码错误");

  const passHash = hashPassword(passwordRaw, user.passSalt);
  if (!safeEqHex(passHash, user.passHash)) {
    throw new Error("用户名或密码错误");
  }

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(32).toString("hex");

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      createdAt: new Date(),
      expiresAt,
    },
  });

  return {
    cookie: makeCookie(token, expiresAt.toISOString()),
    user: { id: user.id, username: user.username, role: user.role as Role },
  };
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
    role: u.role,
    plan: parseUserPlan(u.plan),
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
    emailVerifiedAt?: Date | null;
  } = {};

  if (patch.email !== undefined) {
    const email = parseOptionalEmail(patch.email, {
      required: phoneRequiredForUser(user as { role: Role }),
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
      required: phoneRequiredForUser(user as { role: Role }),
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
    if (!options?.byAdmin) {
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
    createdAt: updated.createdAt.toISOString(),
  };
}

/** 是否 Pro 会员（管理员始终视为拥有全部能力） */
export function userHasProAccess(user: { role: Role; plan?: UserPlan | string | null }): boolean {
  if (user.role === "admin") return true;
  return parseUserPlan(user.plan) === "pro";
}

export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(COOKIE_NAME)?.value ?? null;
}

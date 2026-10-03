import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaClient, type WeeklyOAuthGrant } from "@prisma/client";
import { CLIENT_ID, REDIRECT_URI, RESOURCE, SCOPE, type AuthorizationInput, fail } from "./weeklyPolicy";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomCredential = () => randomBytes(32).toString("base64url");
export const pkce = (value: string) => createHash("sha256").update(value).digest("base64url");
export const ACCESS_SECONDS = 3600;
const REFRESH_MS = 90 * 86400_000;
const GRANT_MS = 365 * 86400_000;
const validCredential = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
const globalOAuth = globalThis as unknown as { weeklyOAuthDb?: PrismaClient };
// Separate client suppresses ORM query/error logging for credential operations.
export const weeklyOAuthDb = globalOAuth.weeklyOAuthDb ?? new PrismaClient({ log: [] });
if (process.env.NODE_ENV !== "production") globalOAuth.weeklyOAuthDb = weeklyOAuthDb;

export function weeklyStore(db: PrismaClient = weeklyOAuthDb) {
  async function adminSession(sessionToken: string | null) {
    if (!sessionToken) return null;
    const s = await db.session.findUnique({ where: { token: sessionToken }, include: { user: true } });
    if (!s || s.expiresAt.getTime() <= Date.now() || s.user.status !== "active" || !s.user.adminTotpSecret) return null;
    return { id: s.userId, role: s.user.role, sessionHash: hash(sessionToken) };
  }
  async function createConsent(input: AuthorizationInput, userId: string, sessionHash: string) {
    const nonce = randomCredential();
    await db.$transaction(async tx => {
      await tx.weeklyOAuthConsent.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      if (await tx.weeklyOAuthConsent.count({ where: { userId } }) >= 20) fail("temporarily_unavailable");
      await tx.weeklyOAuthConsent.create({ data: { ...input, userId, sessionHash, nonceHash: hash(nonce), expiresAt: new Date(Date.now() + 600_000) } });
    });
    return nonce;
  }
  async function approve(nonce: string, userId: string | null, sessionHash: string | null, approved: boolean) {
    if (!validCredential(nonce)) fail();
    const code = randomCredential();
    return db.$transaction(async tx => {
      const consent = await tx.weeklyOAuthConsent.findUnique({ where: { nonceHash: hash(nonce) } });
      const now = new Date();
      if (!consent || consent.expiresAt <= now) fail();
      if (userId === null && sessionHash === null) {
        // SameSite=Lax cookies can be omitted on an OAuth form POST whose
        // top-level navigation began on ChatGPT. The form nonce remains a
        // 256-bit one-time secret; additionally require that the exact admin
        // session which created it is still active in the database.
        const sessions = await tx.session.findMany({ where: { userId: consent.userId, expiresAt: { gt: now } }, select: { token: true } });
        if (!sessions.some(session => hash(session.token) === consent.sessionHash)) fail("access_denied");
      } else if (!userId || !sessionHash || consent.userId !== userId || consent.sessionHash !== sessionHash) fail();
      const user = await tx.user.findUnique({ where: { id: consent.userId }, select: { role: true, status: true, adminTotpSecret: true } });
      if (user?.role !== "admin" || user.status !== "active" || !user.adminTotpSecret) fail("access_denied");
      const removed = await tx.weeklyOAuthConsent.deleteMany({ where: { nonceHash: consent.nonceHash, userId: consent.userId, sessionHash: consent.sessionHash, expiresAt: { gt: now } } });
      if (removed.count !== 1) fail();
      if (approved) {
        const grant = await tx.weeklyOAuthGrant.create({ data: { userId: consent.userId, clientId: consent.clientId, resource: consent.resource, scope: consent.scope, expiresAt: new Date(now.getTime() + GRANT_MS) } });
        await tx.weeklyOAuthCredential.create({ data: { hash: hash(code), kind: "code", grantId: grant.id, redirectUri: consent.redirectUri, codeChallenge: consent.codeChallenge, expiresAt: new Date(Date.now() + 120_000) } });
      }
      return { consent, code: approved ? code : null };
    });
  }
  const grantActive = (g: WeeklyOAuthGrant, user: { role: string; status: string; adminTotpSecret: string | null }, now: Date) =>
    !g.revokedAt && g.expiresAt > now && g.clientId === CLIENT_ID && g.resource === RESOURCE && g.scope === SCOPE && user.role === "admin" && user.status === "active" && !!user.adminTotpSecret;

  async function exchange(input: { kind: "code" | "refresh"; credential: string; clientId: string; resource: string; redirectUri?: string; verifier?: string; scope?: string }) {
    if (input.clientId !== CLIENT_ID || input.resource !== RESOURCE) fail("invalid_grant");
    if (input.scope !== undefined && input.scope !== SCOPE) fail("invalid_scope");
    if (!validCredential(input.credential)) fail("invalid_grant");
    if (input.kind === "code" && (input.redirectUri !== REDIRECT_URI || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier ?? ""))) fail("invalid_grant");
    const access = randomCredential();
    const refresh = randomCredential();
    const accepted = await db.$transaction(async tx => {
      const first = await tx.weeklyOAuthCredential.findUnique({ where: { hash: hash(input.credential) } });
      if (!first || first.kind !== input.kind) return false;
      // Serialize code exchange, refresh rotation and revocation per grant.
      await tx.$queryRaw`SELECT "id" FROM "public"."WeeklyOAuthGrant" WHERE "id" = ${first.grantId} FOR UPDATE`;
      const c = await tx.weeklyOAuthCredential.findUnique({ where: { hash: first.hash }, include: { grant: { include: { user: { select: { role: true, status: true, adminTotpSecret: true } } } } } });
      const now = new Date();
      if (!c || !grantActive(c.grant, c.grant.user, now)) return false;
      if (input.kind === "code" && (c.redirectUri !== input.redirectUri || !c.codeChallenge || !timingSafeEqual(Buffer.from(c.codeChallenge), Buffer.from(pkce(input.verifier!))))) return false;
      if (c.consumedAt) {
        // Replay compromises the family, including already issued access tokens.
        await tx.weeklyOAuthGrant.update({ where: { id: c.grantId }, data: { revokedAt: now } });
        return false;
      }
      if (c.expiresAt <= now) return false;
      const consumed = await tx.weeklyOAuthCredential.updateMany({ where: { hash: c.hash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (consumed.count !== 1) return false;
      await tx.weeklyOAuthCredential.createMany({ data: [
        { hash: hash(access), kind: "access", grantId: c.grantId, expiresAt: new Date(Math.min(now.getTime() + ACCESS_SECONDS * 1000, c.grant.expiresAt.getTime())) },
        { hash: hash(refresh), kind: "refresh", grantId: c.grantId, expiresAt: new Date(Math.min(now.getTime() + REFRESH_MS, c.grant.expiresAt.getTime())) },
      ] });
      return Math.max(1, Math.floor(Math.min(ACCESS_SECONDS, (c.grant.expiresAt.getTime() - now.getTime()) / 1000)));
    });
    if (!accepted) fail("invalid_grant");
    return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: accepted, scope: SCOPE };
  }
  async function authenticate(authorization: string | null) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? "");
    if (!match) return false;
    const c = await db.weeklyOAuthCredential.findUnique({ where: { hash: hash(match[1]) }, include: { grant: { include: { user: { select: { role: true, status: true, adminTotpSecret: true } } } } } });
    const now = new Date();
    return !!c && c.kind === "access" && !c.consumedAt && c.expiresAt > now && grantActive(c.grant, c.grant.user, now);
  }
  async function revoke(credential: string, clientId: string) {
    if (clientId !== CLIENT_ID) fail("invalid_client");
    if (!validCredential(credential)) return;
    await db.$transaction(async tx => {
      const c = await tx.weeklyOAuthCredential.findUnique({ where: { hash: hash(credential) } });
      if (!c || c.kind === "code") return;
      await tx.$queryRaw`SELECT "id" FROM "public"."WeeklyOAuthGrant" WHERE "id" = ${c.grantId} FOR UPDATE`;
      await tx.weeklyOAuthGrant.updateMany({ where: { id: c.grantId, clientId }, data: { revokedAt: new Date() } });
    });
  }
  return { adminSession, createConsent, approve, exchange, authenticate, revoke };
}

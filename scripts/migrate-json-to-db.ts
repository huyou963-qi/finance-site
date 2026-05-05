/**
 * One-time import from `.data/*.json` into PostgreSQL (after `prisma migrate`).
 *
 * Reads `DATABASE_URL` from the environment (e.g. `.env.local` via the loader below).
 *
 * Usage (PowerShell):
 *   npm run db:migrate-from-json
 */
import { loadEnvConfig } from "@next/env";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const DATA_DIR = path.join(process.cwd(), ".data");

type AuthDb = {
  version: 1;
  users: Array<{
    id: string;
    username: string;
    email?: string;
    emailVerifiedAt?: string;
    passHash: string;
    passSalt: string;
    role: string;
    createdAt: string;
  }>;
  sessions: Array<{
    token: string;
    userId: string;
    createdAt: string;
    expiresAt: string;
  }>;
};

type PendingDb = {
  version: 1;
  items: Array<{
    token: string;
    username: string;
    email: string;
    passHash: string;
    passSalt: string;
    createdAt: string;
    expiresAt: string;
  }>;
};

async function migrateAuth(): Promise<void> {
  const authPath = path.join(DATA_DIR, "auth.json");
  let raw: string;
  try {
    raw = await fs.readFile(authPath, "utf8");
  } catch {
    console.info("No .data/auth.json — skip auth import.");
    return;
  }

  const db = JSON.parse(raw) as AuthDb;
  if (db.version !== 1 || !Array.isArray(db.users)) {
    console.warn("auth.json format unexpected — skip.");
    return;
  }

  for (const u of db.users) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        username: u.username,
        email: u.email ?? null,
        emailVerifiedAt: u.emailVerifiedAt ? new Date(u.emailVerifiedAt) : null,
        passHash: u.passHash,
        passSalt: u.passSalt,
        role: u.role,
        createdAt: new Date(u.createdAt),
      },
      update: {
        username: u.username,
        email: u.email ?? null,
        emailVerifiedAt: u.emailVerifiedAt ? new Date(u.emailVerifiedAt) : null,
        passHash: u.passHash,
        passSalt: u.passSalt,
        role: u.role,
        createdAt: new Date(u.createdAt),
      },
    });
  }
  console.info(`Imported ${db.users.length} user(s).`);

  if (Array.isArray(db.sessions)) {
    let n = 0;
    for (const s of db.sessions) {
      const user = await prisma.user.findUnique({ where: { id: s.userId } });
      if (!user) {
        console.warn(`Skip session (unknown userId ${s.userId}).`);
        continue;
      }
      await prisma.session.upsert({
        where: { token: s.token },
        create: {
          token: s.token,
          userId: s.userId,
          createdAt: new Date(s.createdAt),
          expiresAt: new Date(s.expiresAt),
        },
        update: {
          userId: s.userId,
          createdAt: new Date(s.createdAt),
          expiresAt: new Date(s.expiresAt),
        },
      });
      n += 1;
    }
    console.info(`Imported ${n} session(s).`);
  }
}

async function migratePending(): Promise<void> {
  const pendingPath = path.join(DATA_DIR, "auth-pending.json");
  let raw: string;
  try {
    raw = await fs.readFile(pendingPath, "utf8");
  } catch {
    console.info("No .data/auth-pending.json — skip pending import.");
    return;
  }

  const db = JSON.parse(raw) as PendingDb;
  if (db.version !== 1 || !Array.isArray(db.items)) {
    console.warn("auth-pending.json format unexpected — skip.");
    return;
  }

  let n = 0;
  for (const p of db.items) {
    await prisma.pendingRegistration.upsert({
      where: { token: p.token },
      create: {
        token: p.token,
        username: p.username,
        email: p.email,
        passHash: p.passHash,
        passSalt: p.passSalt,
        createdAt: new Date(p.createdAt),
        expiresAt: new Date(p.expiresAt),
      },
      update: {
        username: p.username,
        email: p.email,
        passHash: p.passHash,
        passSalt: p.passSalt,
        createdAt: new Date(p.createdAt),
        expiresAt: new Date(p.expiresAt),
      },
    });
    n += 1;
  }
  console.info(`Imported ${n} pending registration(s).`);
}

async function migrateTemplates(): Promise<void> {
  const filePath = path.join(DATA_DIR, "asset-return-templates.json");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    console.info("No .data/asset-return-templates.json — skip templates import.");
    return;
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });

  async function saveForUser(userId: string, state: unknown) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.warn(`Skip templates for unknown userId ${userId}.`);
      return;
    }
    await prisma.userAssetTemplateState.upsert({
      where: { userId },
      create: { userId, state: state as object },
      update: { state: state as object },
    });
  }

  if (parsed.version === 2 && parsed.byUser && typeof parsed.byUser === "object") {
    const byUser = parsed.byUser as Record<string, unknown>;
    for (const [uid, state] of Object.entries(byUser)) {
      let targetId = uid;
      if (uid === "legacy" && admin) {
        targetId = admin.id;
        console.info(`Mapping template key "legacy" → admin user ${targetId}.`);
      }
      await saveForUser(targetId, state);
    }
    console.info(`Imported asset-return-templates (v2) for ${Object.keys(byUser).length} key(s).`);
    return;
  }

  // v1 single-file → attach to admin if present
  if (parsed.version === 1 && admin) {
    await saveForUser(admin.id, parsed);
    console.info("Imported legacy v1 asset-return-templates → admin user.");
  }
}

async function migrateMacro(): Promise<void> {
  const filePath = path.join(DATA_DIR, "macro-chart-prefs.json");
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    console.info("No .data/macro-chart-prefs.json — skip macro prefs import.");
    return;
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (
    parsed.version !== 1 ||
    !parsed.byUser ||
    typeof parsed.byUser !== "object"
  ) {
    console.warn("macro-chart-prefs.json format unexpected — skip.");
    return;
  }

  const byUser = parsed.byUser as Record<string, unknown>;
  let n = 0;
  for (const [userId, prefs] of Object.entries(byUser)) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.warn(`Skip macro prefs for unknown userId ${userId}.`);
      continue;
    }
    await prisma.userMacroChartPrefs.upsert({
      where: { userId },
      create: { userId, prefs: prefs as object },
      update: { prefs: prefs as object },
    });
    n += 1;
  }
  console.info(`Imported macro-chart-prefs for ${n} user(s).`);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Set DATABASE_URL (e.g. postgresql://user:pass@localhost:5432/postgres).");
  }

  await migrateAuth();
  await migratePending();
  await migrateTemplates();
  await migrateMacro();
  console.info("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

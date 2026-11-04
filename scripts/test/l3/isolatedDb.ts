/** Shared helpers for L3 isolated PostgreSQL databases. Never touches production or the SSH tunnel. */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export function assertSafeL3DatabaseUrl(raw = process.env.DATABASE_URL): URL {
  if (!raw) throw new Error("DATABASE_URL is required for L3 tests");
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("L3 requires local PostgreSQL (127.0.0.1/localhost)");
  }
  if (url.port === "15432") {
    throw new Error("L3 refuses SSH tunnel port 15432 (production database)");
  }
  return url;
}

export function adminDatabaseUrl(url: URL): string {
  const admin = new URL(url.toString());
  admin.pathname = "/postgres";
  return admin.toString();
}

export function withDatabaseName(url: URL, name: string): string {
  const next = new URL(url.toString());
  next.pathname = `/${name}`;
  return next.toString();
}

export function uniqueL3DatabaseName(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export async function createIsolatedDatabase(prefix: string): Promise<{
  name: string;
  url: string;
  drop: () => Promise<void>;
}> {
  const base = assertSafeL3DatabaseUrl();
  const name = uniqueL3DatabaseName(prefix);
  const admin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl(base) } } });
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
  } finally {
    await admin.$disconnect();
  }
  const url = withDatabaseName(base, name);
  return {
    name,
    url,
    drop: async () => {
      if (!created) return;
      const dropAdmin = new PrismaClient({ datasources: { db: { url: adminDatabaseUrl(base) } } });
      try {
        await dropAdmin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await dropAdmin.$disconnect();
      }
    },
  };
}

export function runPrismaMigrateDeploy(databaseUrl: string, migrationsRoot?: string): void {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const args = ["node_modules/prisma/build/index.js", "migrate", "deploy"];
  if (migrationsRoot) {
    args.push("--schema", join(migrationsRoot, "schema.prisma"));
  }
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `prisma migrate deploy failed (exit ${result.status}):\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
}

/** Copy schema + a subset of migration folders into a temp tree for upgrade-chain tests. */
export function materializeMigrationsSubset(migrationNames: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "l3-migrations-"));
  const prismaDir = join(root, "prisma");
  mkdirSync(prismaDir, { recursive: true });
  cpSync(join(REPO_ROOT, "prisma", "schema.prisma"), join(prismaDir, "schema.prisma"));
  const lock = join(REPO_ROOT, "prisma", "migrations", "migration_lock.toml");
  if (existsSync(lock)) {
    mkdirSync(join(prismaDir, "migrations"), { recursive: true });
    cpSync(lock, join(prismaDir, "migrations", "migration_lock.toml"));
  }
  for (const name of migrationNames) {
    const src = join(REPO_ROOT, "prisma", "migrations", name);
    if (!existsSync(src)) throw new Error(`Missing migration ${name}`);
    cpSync(src, join(prismaDir, "migrations", name), { recursive: true });
  }
  return prismaDir;
}

export function listMigrationNames(): string[] {
  return readdirSync(join(REPO_ROOT, "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export { REPO_ROOT };

/**
 * L3: empty-database migrate deploy + upgrade from penultimate schema.
 * Uses an isolated local PostgreSQL database; never writes the application DB.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  cleanupTempDir,
  createIsolatedDatabase,
  listMigrationNames,
  materializeMigrationsSubset,
  REPO_ROOT,
  runPrismaMigrateDeploy,
} from "./isolatedDb";

async function assertCoreTables(url: string): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname IN ('public', 'mds')
      ORDER BY tablename
    `;
    const names = new Set(tables.map((row) => row.tablename));
    for (const required of ["User", "Session", "Instrument", "MacroObservation", "_prisma_migrations"]) {
      assert.ok(names.has(required), `missing table ${required}`);
    }
    const applied = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name
    `;
    const expected = listMigrationNames();
    assert.equal(applied.length, expected.length, "applied migration count mismatch");
    assert.deepEqual(
      applied.map((row) => row.migration_name),
      expected,
    );
  } finally {
    await db.$disconnect();
  }
}

function copyTipMigration(prismaDir: string, tip: string): void {
  const src = join(REPO_ROOT, "prisma", "migrations", tip);
  if (!existsSync(src)) throw new Error(`Missing tip migration ${tip}`);
  cpSync(src, join(prismaDir, "migrations", tip), { recursive: true });
}

async function emptyMigrate(): Promise<void> {
  const isolated = await createIsolatedDatabase("finance_l3_empty");
  try {
    runPrismaMigrateDeploy(isolated.url);
    await assertCoreTables(isolated.url);

    const db = new PrismaClient({ datasources: { db: { url: isolated.url } } });
    try {
      await db.systemMacroChartPrefs.upsert({
        where: { id: "default" },
        create: { id: "default", prefs: { version: 1, templates: [] } },
        update: {},
      });
      const row = await db.systemMacroChartPrefs.findUniqueOrThrow({ where: { id: "default" } });
      assert.equal(row.id, "default");
    } finally {
      await db.$disconnect();
    }
    console.log("PASS: empty-database prisma migrate deploy + minimal seed");
  } finally {
    await isolated.drop();
  }
}

async function upgradeFromPenultimate(): Promise<void> {
  const migrations = listMigrationNames();
  assert.ok(migrations.length >= 2, "need at least two migrations for upgrade-chain test");
  const baseline = migrations.slice(0, -1);
  const tip = migrations[migrations.length - 1]!;

  const isolated = await createIsolatedDatabase("finance_l3_upgrade");
  let tempPrisma: string | undefined;
  try {
    tempPrisma = materializeMigrationsSubset(baseline);
    runPrismaMigrateDeploy(isolated.url, tempPrisma);

    const sentinelId = randomUUID();
    const db = new PrismaClient({ datasources: { db: { url: isolated.url } } });
    try {
      await db.user.create({
        data: {
          id: sentinelId,
          username: `l3-upgrade-${sentinelId.slice(0, 8)}`,
          passHash: "test-disabled",
          passSalt: "test",
          role: "user",
          createdAt: new Date(),
        },
      });
    } finally {
      await db.$disconnect();
    }

    copyTipMigration(tempPrisma, tip);
    runPrismaMigrateDeploy(isolated.url, tempPrisma);

    const after = new PrismaClient({ datasources: { db: { url: isolated.url } } });
    try {
      const user = await after.user.findUnique({ where: { id: sentinelId } });
      assert.ok(user, "upgrade must preserve pre-existing User rows");
      const applied = await after.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name
      `;
      assert.deepEqual(
        applied.map((row) => row.migration_name),
        migrations,
      );
    } finally {
      await after.$disconnect();
    }
    console.log(`PASS: upgrade from penultimate (${baseline.at(-1)}) → ${tip}; sentinel retained`);
  } finally {
    if (tempPrisma) cleanupTempDir(dirname(tempPrisma));
    await isolated.drop();
  }
}

async function main(): Promise<void> {
  await emptyMigrate();
  await upgradeFromPenultimate();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

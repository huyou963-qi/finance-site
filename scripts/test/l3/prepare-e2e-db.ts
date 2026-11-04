/**
 * Create/migrate an isolated DB for Playwright, seed a free user, write DATABASE_URL to a file.
 *
 * Usage:
 *   L3_E2E_DATABASE_URL_FILE=/tmp/l3-e2e.url npx tsx scripts/test/l3/prepare-e2e-db.ts
 */
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { createIsolatedDatabase, runPrismaMigrateDeploy } from "./isolatedDb";

const USERNAME = process.env.L3_E2E_USERNAME ?? "l3smoke";
const PASSWORD = process.env.L3_E2E_PASSWORD ?? "L3SmokePass1!";

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

async function main(): Promise<void> {
  const outFile = process.env.L3_E2E_DATABASE_URL_FILE;
  if (!outFile) throw new Error("L3_E2E_DATABASE_URL_FILE is required");

  const isolated = await createIsolatedDatabase("finance_l3_e2e");
  // Intentionally not dropped: the e2e job owns the lifecycle for the server process.
  // CI postgres service is ephemeral; locally callers may DROP DATABASE later.
  runPrismaMigrateDeploy(isolated.url);

  const db = new PrismaClient({ datasources: { db: { url: isolated.url } } });
  const salt = randomBytes(16).toString("hex");
  try {
    await db.systemMacroChartPrefs.upsert({
      where: { id: "default" },
      create: { id: "default", prefs: { version: 1, templates: [] } },
      update: {},
    });
    await db.user.upsert({
      where: { username: USERNAME },
      create: {
        id: randomUUID(),
        username: USERNAME,
        email: `${USERNAME}@example.com`,
        emailVerifiedAt: new Date(),
        phone: "13900000001",
        passHash: hashPassword(PASSWORD, salt),
        passSalt: salt,
        role: "user",
        plan: "standard",
        trialEndsAt: new Date(Date.now() + 7 * 86400000),
        createdAt: new Date(),
      },
      update: {
        passHash: hashPassword(PASSWORD, salt),
        passSalt: salt,
        emailVerifiedAt: new Date(),
        status: "active",
      },
    });
  } finally {
    await db.$disconnect();
  }

  writeFileSync(outFile, isolated.url, "utf8");
  console.log(`Prepared e2e database ${isolated.name}`);
  console.log(`Wrote DATABASE_URL to ${outFile}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

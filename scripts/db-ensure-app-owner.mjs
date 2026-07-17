/**
 * 部署前：把 public/mds 对象 owner 对齐为 DATABASE_URL 中的应用用户（如 finance）。
 *
 * 背景：Prisma migrate 的 ALTER TABLE 要求表 owner；云库若历史上由 postgres 建表，
 * finance 用户会报 must be owner of table。本脚本在 root 部署机上用本地 postgres 超级用户修复。
 *
 * 用法：
 *   dotenv -e .env.local -- node scripts/db-ensure-app-owner.mjs
 *
 * 环境变量：
 *   DATABASE_URL          必填，解析出 app 用户与库名
 *   DATABASE_ADMIN_URL    可选，超级用户连接串；未设则尝试 `sudo -u postgres psql`
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function parseDatabaseUrl(url) {
  const u = new URL(url);
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(u.username || "");
  if (!database || !user) {
    throw new Error("DATABASE_URL must include username and database name");
  }
  return { database, user, host: u.hostname || "127.0.0.1", port: u.port || "5432" };
}

function runPsqlAsPostgres(database, sql) {
  // Linux 云部署：sudo -u postgres（peer）。Windows 本机：psql -U postgres（勿先跑 sudo，会挂起）。
  const isWin = process.platform === "win32";
  const attempts = isWin
    ? [
        {
          cmd: "psql",
          args: ["-U", "postgres", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql],
        },
      ]
    : [
        {
          cmd: "sudo",
          args: ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql],
        },
        {
          cmd: "psql",
          args: ["-U", "postgres", "-h", "127.0.0.1", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql],
        },
      ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      const r = spawnSync(a.cmd, a.args, {
        encoding: "utf8",
        timeout: 60_000,
        env: {
          ...process.env,
          PGPASSWORD: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || "postgres",
        },
      });
      if (r.status === 0) {
        return (r.stdout || "") + (r.stderr || "");
      }
      lastErr = new Error(`${a.cmd} exit ${r.status}: ${(r.stderr || r.stdout || "").trim()}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("psql as postgres failed");
}

function runPsqlAdminUrl(adminUrl, database, sql) {
  const u = new URL(adminUrl);
  const adminDb = decodeURIComponent(u.pathname.replace(/^\//, "")) || database;
  const env = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(u.password || ""),
  };
  return execFileSync(
    "psql",
    [
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      u.hostname || "127.0.0.1",
      "-p",
      u.port || "5432",
      "-U",
      decodeURIComponent(u.username || "postgres"),
      "-d",
      adminDb === "*" ? database : adminDb,
      "-c",
      sql,
    ],
    { encoding: "utf8", env },
  );
}

function buildOwnershipSql(appUser) {
  // 只改 public / mds；幂等
  return `
DO $body$
DECLARE
  r RECORD;
  app_user text := '${appUser.replace(/'/g, "''")}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_user) THEN
    RAISE EXCEPTION 'role % does not exist', app_user;
  END IF;

  BEGIN
    EXECUTE format('ALTER SCHEMA public OWNER TO %I', app_user);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'skip schema public: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'mds') THEN
    BEGIN
      EXECUTE format('ALTER SCHEMA mds OWNER TO %I', app_user);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip schema mds: %', SQLERRM;
    END;
  END IF;

  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('public', 'mds')
      AND tableowner IS DISTINCT FROM app_user
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO %I', r.schemaname, r.tablename, app_user);
  END LOOP;

  FOR r IN
    SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname IN ('public', 'mds')
      AND pg_get_userbyid(c.relowner) IS DISTINCT FROM app_user
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO %I', r.schema, r.name, app_user);
  END LOOP;

  FOR r IN
    SELECT n.nspname AS schema, t.typname AS name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname IN ('public', 'mds')
      AND t.typtype = 'e'
      AND pg_get_userbyid(t.typowner) IS DISTINCT FROM app_user
  LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', r.schema, r.name, app_user);
  END LOOP;

  EXECUTE format('GRANT ALL ON SCHEMA public TO %I', app_user);
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'mds') THEN
    EXECUTE format('GRANT ALL ON SCHEMA mds TO %I', app_user);
  END IF;
END
$body$;

SELECT 'ok' AS ensure_owner,
       current_database() AS db,
       (SELECT count(*) FROM pg_tables
         WHERE schemaname IN ('public','mds')
           AND tableowner = '${appUser.replace(/'/g, "''")}') AS tables_owned_by_app;
`;
}

function migrationState(databaseUrl, migration) {
  const { database, user, host, port } = parseDatabaseUrl(databaseUrl);
  const pass = decodeURIComponent(new URL(databaseUrl).password || "");
  const sql = `
SELECT CASE
  WHEN finished_at IS NULL AND rolled_back_at IS NULL THEN 'failed'
  WHEN rolled_back_at IS NOT NULL THEN 'rolled_back'
  WHEN finished_at IS NOT NULL THEN 'applied'
  ELSE 'unknown'
END
FROM "_prisma_migrations"
WHERE migration_name = '${migration}'
LIMIT 1;
`.trim();
  const r = spawnSync(
    "psql",
    ["-h", host, "-p", port, "-U", user, "-d", database, "-tAc", sql],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: pass } },
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `psql exit ${r.status}`).trim());
  }
  return (r.stdout || "").trim() || "absent";
}

function resolveFailedMigration(databaseUrl) {
  // 方案 A：权限失败导致未真正落库 → 标 rolled-back，再由 migrate deploy 重跑
  const migration = "20260716120000_market_event_chart_markers";
  try {
    const state = migrationState(databaseUrl, migration);
    console.log(`[db-ensure-owner] migration ${migration} state: ${state}`);
    if (state !== "failed") return;

    console.log(`[db-ensure-owner] → prisma migrate resolve --rolled-back ${migration}`);
    execFileSync(
      "npx",
      [
        "dotenv",
        "-e",
        ".env.local",
        "--",
        "prisma",
        "migrate",
        "resolve",
        "--rolled-back",
        migration,
      ],
      { stdio: "inherit", cwd: process.cwd(), env: process.env },
    );
    console.log(`[db-ensure-owner] resolved ${migration} as rolled-back`);
  } catch (e) {
    console.error(
      `[db-ensure-owner] failed-migration resolve ERROR: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(3);
  }
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[db-ensure-owner] DATABASE_URL is required");
    process.exit(1);
  }
  if (!existsSync(".env.local") && !process.env.DATABASE_URL) {
    console.error("[db-ensure-owner] missing .env.local / DATABASE_URL");
    process.exit(1);
  }

  const { database, user } = parseDatabaseUrl(databaseUrl);
  console.log(`[db-ensure-owner] target db=${database} app_user=${user}`);

  const sql = buildOwnershipSql(user);
  const adminUrl = process.env.DATABASE_ADMIN_URL;

  try {
    const result = adminUrl
      ? runPsqlAdminUrl(adminUrl, database, sql)
      : runPsqlAsPostgres(database, sql);
    console.log(result.trim());
    console.log("[db-ensure-owner] ownership aligned");
  } catch (e) {
    console.error(`[db-ensure-owner] FAILED: ${e instanceof Error ? e.message : e}`);
    console.error(
      "[db-ensure-owner] 无法用 postgres 超级用户改 owner。可设 DATABASE_ADMIN_URL，或确认部署用户可 sudo -u postgres psql",
    );
    process.exit(2);
  }

  resolveFailedMigration(databaseUrl);
}

main();

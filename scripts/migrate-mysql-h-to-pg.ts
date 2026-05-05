/**
 * Copy MySQL database `h` (already restored from mysqldump) into PostgreSQL schema `h`.
 * App tables stay in `public` (Prisma); macro warehouse lives in `h.*`.
 *
 * Prereq: MySQL/MariaDB running with dump imported:
 *   mysql -u root -p -e "CREATE DATABASE h CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
 *   mysql -u root -p h < path\to\dump-h-....sql
 *
 * Env: DATABASE_URL (Postgres), MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE=h
 */
import { loadEnvConfig } from "@next/env";
import mysql from "mysql2/promise";
import pg from "pg";

loadEnvConfig(process.cwd());

const PG_SCHEMA = "h";
const TABLES = [
  "Category",
  "Data_D",
  "Data_M",
  "Data_Q",
  "Data_Y",
  "Ind_Info",
  "Issues",
  "tn_user",
] as const;

type MysqlCol = {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_KEY: string;
};

function mapMysqlTypeToPg(c: MysqlCol): string {
  const { DATA_TYPE: t, COLUMN_TYPE: ct } = c;
  const u = t.toLowerCase();
  if (u === "double" || u === "float" || u === "real") return "double precision";
  if (u === "bigint") return "bigint";
  if (u === "int" || u === "integer" || u === "mediumint" || u === "smallint") return "integer";
  if (u === "tinyint") {
    if (/\(1\)/.test(ct)) return "smallint";
    return "smallint";
  }
  if (u === "date") return "date";
  if (u === "datetime" || u === "timestamp") return "timestamp without time zone";
  if (u === "time") return "time without time zone";
  if (u === "year") return "integer";
  if (u === "decimal" || u === "numeric") {
    const m = ct.match(/decimal\((\d+),(\d+)\)/i) || ct.match(/numeric\((\d+),(\d+)\)/i);
    if (m) return `decimal(${m[1]},${m[2]})`;
    return "numeric";
  }
  if (u === "varchar" || u === "char") {
    const m = ct.match(/\((\d+)\)/);
    if (m) return `varchar(${m[1]})`;
    return "text";
  }
  if (u === "text" || u === "longtext" || u === "mediumtext" || u === "tinytext") return "text";
  if (u === "blob" || u === "longblob" || u === "mediumblob") return "bytea";
  if (u === "bit") return "bit(1)";
  if (u === "json") return "jsonb";
  return "text";
}

function quotePgIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quotePgSchemaTable(schema: string, table: string): string {
  return `${quotePgIdent(schema)}.${quotePgIdent(table)}`;
}

async function loadMysqlColumns(
  conn: mysql.Connection,
  database: string,
  table: string,
): Promise<MysqlCol[]> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [database, table],
  );
  return rows as MysqlCol[];
}

async function createPgTable(
  client: pg.PoolClient,
  table: string,
  columns: MysqlCol[],
): Promise<void> {
  const defs: string[] = [];
  for (const c of columns) {
    const pgType = mapMysqlTypeToPg(c);
    const nullSql = c.IS_NULLABLE === "YES" ? "" : " NOT NULL";
    defs.push(`${quotePgIdent(c.COLUMN_NAME)} ${pgType}${nullSql}`);
  }
  const pkCols = columns.filter((c) => c.COLUMN_KEY === "PRI").map((c) => quotePgIdent(c.COLUMN_NAME));
  const pk = pkCols.length > 0 ? `, PRIMARY KEY (${pkCols.join(", ")})` : "";

  const q = `CREATE TABLE ${quotePgSchemaTable(PG_SCHEMA, table)} (${defs.join(", ")}${pk})`;
  await client.query(q);
}

async function insertBatch(
  client: pg.PoolClient,
  table: string,
  columns: MysqlCol[],
  rows: mysql.RowDataPacket[],
): Promise<void> {
  if (rows.length === 0) return;
  const colList = columns.map((c) => quotePgIdent(c.COLUMN_NAME)).join(", ");
  const colNames = columns.map((c) => c.COLUMN_NAME);

  const placeholders: string[] = [];
  const flat: unknown[] = [];
  let i = 1;
  for (const row of rows) {
    const one: string[] = [];
    for (const cn of colNames) {
      one.push(`$${i++}`);
      let v: unknown = (row as Record<string, unknown>)[cn];
      if (v instanceof Date) {
        const col = columns.find((x) => x.COLUMN_NAME === cn);
        if (col?.DATA_TYPE.toLowerCase() === "date") {
          const y = v.getFullYear();
          const m = String(v.getMonth() + 1).padStart(2, "0");
          const d = String(v.getDate()).padStart(2, "0");
          v = `${y}-${m}-${d}`;
        }
      }
      flat.push(v);
    }
    placeholders.push(`(${one.join(", ")})`);
  }

  const sql = `INSERT INTO ${quotePgSchemaTable(PG_SCHEMA, table)} (${colList}) VALUES ${placeholders.join(", ")}`;
  await client.query(sql, flat);
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const mysqlHost = process.env.MYSQL_HOST?.trim() || "127.0.0.1";
  const mysqlPort = Number(process.env.MYSQL_PORT?.trim() || "3306");
  const mysqlUser = requireEnv("MYSQL_USER");
  const mysqlPassword = process.env.MYSQL_PASSWORD ?? "";
  const mysqlDb = process.env.MYSQL_DATABASE?.trim() || "h";

  const mConn = await mysql.createConnection({
    host: mysqlHost,
    port: mysqlPort,
    user: mysqlUser,
    password: mysqlPassword,
    database: mysqlDb,
    charset: "utf8mb4",
    supportBigNumbers: true,
    dateStrings: false,
  });

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`DROP SCHEMA IF EXISTS ${quotePgIdent(PG_SCHEMA)} CASCADE`);
    await client.query(`CREATE SCHEMA ${quotePgIdent(PG_SCHEMA)}`);

    for (const table of TABLES) {
      const cols = await loadMysqlColumns(mConn, mysqlDb, table);
      if (cols.length === 0) {
        console.warn(`Table ${table}: not found in MySQL — skip.`);
        continue;
      }

      const [countRows] = await mConn.query<mysql.RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM \`${table}\``,
      );
      const total = Number((countRows as mysql.RowDataPacket[])[0]?.c ?? 0);
      console.info(`Table ${table}: ${total} rows, ${cols.length} columns`);

      await createPgTable(client, table, cols);

      const wide = table.startsWith("Data_");
      const BATCH = wide ? 40 : 250;
      for (let offset = 0; offset < total; offset += BATCH) {
        const [batchRows] = await mConn.query<mysql.RowDataPacket[]>(
          `SELECT * FROM \`${table.replace(/`/g, "")}\` LIMIT ${BATCH} OFFSET ${offset}`,
        );
        if (!batchRows.length) break;
        await insertBatch(client, table, cols, batchRows);
        if (offset % (BATCH * 20) === 0 && offset > 0) {
          console.info(`  … ${Math.min(offset + batchRows.length, total)} / ${total}`);
        }
      }
      console.info(`  done ${table}`);
    }

    console.info(`PostgreSQL schema "${PG_SCHEMA}" is ready (same server as DATABASE_URL).`);
  } finally {
    client.release();
    await pool.end();
    await mConn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

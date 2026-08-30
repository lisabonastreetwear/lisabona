import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

export type Database = pg.Pool;

export function createDatabase(connectionString: string): Database {
  return new Pool({
    connectionString,
    max: 5,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
  });
}

export async function migrate(db: Database): Promise<void> {
  const sql = await readFile(path.join(process.cwd(), "migrations", "001_initial.sql"), "utf8");
  await db.query(sql);
}

export async function getSetting<T>(db: Database, key: string, fallback: T): Promise<T> {
  const result = await db.query<{ value: T }>("SELECT value FROM app_settings WHERE key = $1", [key]);
  return result.rows[0]?.value ?? fallback;
}

export async function setSetting(db: Database, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

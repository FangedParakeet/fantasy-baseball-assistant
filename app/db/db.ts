import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import type { RowDataPacket } from 'mysql2/promise';

/** Minimal type for a DB that supports the promise-based query we use (avoids Pool typing issues). */
export interface QueryableDB {
  query<T = RowDataPacket[]>(sql: string, values?: unknown): Promise<[T, unknown]>;
}

const rawPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fantasy_baseball',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/** Pool typed as QueryableDB for consumers. */
export const pool: QueryableDB = rawPool as unknown as QueryableDB;

/** Alias for backward compatibility. */
export const db = pool;

/** Default export for `import db from '../db/db'`. */
export default db;

/**
 * Execute database operations within a transaction.
 * @param operation - Async function that receives the connection and performs operations
 * @returns Result of the operation
 */
export async function executeInTransaction<T>(
  operation: (connection: QueryableDB) => Promise<T>
): Promise<T> {
  const connection = await rawPool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await operation(connection as unknown as QueryableDB);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Run all SQL migration files in db/migrations in order.
 * Each .sql file is executed as a single statement.
 */
export async function runMigrations(): Promise<void> {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8').trim();
    if (sql) {
      await rawPool.query(sql);
    }
  }
}

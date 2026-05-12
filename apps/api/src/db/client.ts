import { Pool } from "pg";

let pool: Pool | null = null;

export function getDbPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === "disable"
          ? false
          : {
              rejectUnauthorized: false
            }
    });
  }

  return pool;
}

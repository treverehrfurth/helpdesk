#!/usr/bin/env node
/**
 * Idempotent migration runner.
 * Tracks applied migrations in a _migrations table so it is safe to run on
 * every deploy — already-applied files are skipped automatically.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs
 */

import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function migrate() {
  // Ensure the tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename  TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Fetch already-applied migrations
  const { rows } = await pool.query('SELECT filename FROM _migrations ORDER BY filename');
  const applied = new Set(rows.map(r => r.filename));

  // Read migration files in sorted order
  const sqlDir = join(__dirname, '../apps/api/sql');
  const files = (await readdir(sqlDir))
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = await readFile(join(sqlDir, file), 'utf-8');
    console.log(`  apply ${file} ...`);

    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`  ✓     ${file}`);
      ran++;
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`  ✗     ${file}`);
      throw err;
    }
  }

  if (ran === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`\nApplied ${ran} migration(s).`);
  }
}

migrate()
  .catch(err => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  })
  .finally(() => pool.end());

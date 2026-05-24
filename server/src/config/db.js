/**
 * Smart database adapter:
 * - NODE_ENV=development (or missing MySQL env) → SQLite (zero setup, local file)
 * - NODE_ENV=production (and MySQL env vars set) → MySQL connection pool
 *
 * This pattern lets developers run the app locally with no database setup,
 * while using a proper managed MySQL in production.
 */

import { env } from './env.js';

const USE_MYSQL =
  env.nodeEnv === 'production' &&
  process.env.MYSQLHOST &&
  process.env.MYSQLUSER &&
  process.env.MYSQLPASSWORD &&
  process.env.MYSQLDATABASE;

let db;

if (USE_MYSQL) {
  // ── Production: MySQL via mysql2 ──────────────────────────────────────────
  const mysql = await import('mysql2/promise');
  const pool = mysql.default.createPool(env.db);

  pool.getConnection()
    .then((conn) => {
      console.log('✅ MySQL database connected successfully.');
      conn.release();
    })
    .catch((err) => {
      console.error('❌ MySQL connection failed:', err.message);
      process.exit(1);
    });

  /**
   * Unified db interface — mimics the sqlite3 promisified API shape
   * so all service files use the same call style.
   */
  db = {
    type: 'mysql',
    pool,

    async query(sql, params = []) {
      const [rows] = await pool.query(sql, params);
      return rows;
    },

    async get(sql, params = []) {
      const [rows] = await pool.query(sql, params);
      return rows[0] || null;
    },

    async run(sql, params = []) {
      const [result] = await pool.query(sql, params);
      return { insertId: result.insertId, affectedRows: result.affectedRows };
    },

    async all(sql, params = []) {
      const [rows] = await pool.query(sql, params);
      return rows;
    },
  };
} else {
  // ── Development: SQLite via sqlite3 (promisified) ─────────────────────────
  const sqlite3Module = await import('sqlite3');
  const { promisify } = await import('node:util');
  const pathModule = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const fs = await import('node:fs');

  const sqlite3 = sqlite3Module.default.verbose();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = pathModule.default.dirname(__filename);

  let dbFile = pathModule.default.resolve(__dirname, '../../data/app.db');
  try {
    const dbDir = pathModule.default.dirname(dbFile);
    if (!fs.default.existsSync(dbDir)) fs.default.mkdirSync(dbDir, { recursive: true });
  } catch {
    dbFile = ':memory:';
  }

  console.log(`⚠️  Development mode: Using SQLite at ${dbFile}`);
  const sqliteDb = new sqlite3.Database(dbFile);

  const runRaw = promisify(sqliteDb.run.bind(sqliteDb));
  const getRaw = promisify(sqliteDb.get.bind(sqliteDb));
  const allRaw = promisify(sqliteDb.all.bind(sqliteDb));

  /**
   * Unified db interface — same API shape as the MySQL adapter above.
   * Translates MySQL-style ? placeholders (already used) → SQLite ? (same).
   * Translates NOW() → CURRENT_TIMESTAMP for SQLite compatibility.
   */
  function translateSql(sql) {
    return sql
      .replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT')
      .replace(/ENGINE=InnoDB[^;]*/gi, '')
      .replace(/DEFAULT CHARSET=utf8mb4/gi, '')
      .replace(/LONGTEXT/gi, 'TEXT')
      .replace(/TINYINT\(1\)/gi, 'INTEGER')
      .replace(/INT UNSIGNED/gi, 'INTEGER')
      .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/DATETIME/gi, 'TEXT')
      .replace(/DOUBLE/gi, 'REAL')
      .replace(/ENUM\([^)]+\)/gi, 'TEXT')
      .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '')
      .replace(/CONSTRAINT\s+\w+\s+/gi, '')
      .replace(/KEY\s+\w+\s*\([^)]+\),?\s*/gi, '')
      .replace(/UNIQUE KEY\s+\w+\s*\([^)]+\),?\s*/gi, '')
      .replace(/,\s*\)/g, '\n)')
      .trim();
  }

  db = {
    type: 'sqlite',

    async query(sql, params = []) {
      return allRaw(translateSql(sql), params);
    },

    async get(sql, params = []) {
      return getRaw(translateSql(sql), params);
    },

    async run(sql, params = []) {
      const context = await new Promise((resolve, reject) => {
        sqliteDb.run(translateSql(sql), params, function (err) {
          if (err) reject(err);
          else resolve({ insertId: this.lastID, affectedRows: this.changes });
        });
      });
      return context;
    },

    async all(sql, params = []) {
      return allRaw(translateSql(sql), params);
    },
  };
}

export { db };

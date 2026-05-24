import { db } from '../config/db.js';

/**
 * Initializes the database schema.
 * For SQLite: uses SQLite-compatible CREATE TABLE syntax.
 * For MySQL: uses full MySQL syntax.
 * Safe to run on every startup (IF NOT EXISTS).
 */
export async function initializeDatabase() {
  const isMySQL = db.type === 'mysql';

  if (isMySQL) {
    await db.run(`SET NAMES utf8mb4`);

    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
        employee_id   VARCHAR(64)     NOT NULL,
        name          VARCHAR(128)    NOT NULL,
        role          VARCHAR(32)     NOT NULL,
        password      VARCHAR(256)    NOT NULL,
        is_admin      TINYINT(1)      NOT NULL DEFAULT 0,
        zone          VARCHAR(64)     DEFAULT NULL,
        division      VARCHAR(64)     DEFAULT NULL,
        reporting_station VARCHAR(128) DEFAULT NULL,
        access_modes  VARCHAR(256)    DEFAULT NULL,
        created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_employee_id (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
        user_id               INT UNSIGNED    NOT NULL,
        area                  VARCHAR(128)    NOT NULL,
        station               VARCHAR(128)    NOT NULL,
        officer_name          VARCHAR(128)    NOT NULL,
        priority              ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
        description           TEXT            NOT NULL,
        status                ENUM('pending','in_review','resolved') NOT NULL DEFAULT 'pending',
        assigned_officer      VARCHAR(128)    DEFAULT NULL,
        sent_to_commissioner  TINYINT(1)      NOT NULL DEFAULT 1,
        latitude              DOUBLE          DEFAULT NULL,
        longitude             DOUBLE          DEFAULT NULL,
        incident_photo        LONGTEXT        DEFAULT NULL,
        place_photo           LONGTEXT        DEFAULT NULL,
        remarks               TEXT            DEFAULT NULL,
        access_mode           VARCHAR(64)     DEFAULT NULL,
        incident_date         VARCHAR(128)    DEFAULT NULL,
        created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_id  (user_id),
        KEY idx_status   (status),
        KEY idx_priority (priority),
        CONSTRAINT fk_reports_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS bulletins (
        id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
        message     TEXT            NOT NULL,
        severity    ENUM('Critical','High','Medium','Low','Info') NOT NULL DEFAULT 'Info',
        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } else {
    // SQLite schema (development)
    await db.run(`PRAGMA foreign_keys = ON`);

    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE NOT NULL,
        name        TEXT NOT NULL,
        role        TEXT NOT NULL,
        password    TEXT NOT NULL,
        is_admin    INTEGER NOT NULL DEFAULT 0,
        zone        TEXT,
        division    TEXT,
        reporting_station TEXT,
        access_modes TEXT,
        created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS reports (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id              INTEGER NOT NULL,
        area                 TEXT NOT NULL,
        station              TEXT NOT NULL,
        officer_name         TEXT NOT NULL,
        priority             TEXT NOT NULL DEFAULT 'Medium',
        description          TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'pending',
        assigned_officer     TEXT,
        sent_to_commissioner INTEGER NOT NULL DEFAULT 1,
        latitude             REAL,
        longitude            REAL,
        incident_photo       TEXT,
        place_photo          TEXT,
        remarks              TEXT,
        access_mode          TEXT,
        incident_date        TEXT,
        created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS bulletins (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        message    TEXT NOT NULL,
        severity   TEXT NOT NULL DEFAULT 'Info',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Dynamic migration: add remarks column if missing
  if (isMySQL) {
    try {
      await db.run(`ALTER TABLE reports ADD COLUMN remarks TEXT DEFAULT NULL`);
      console.log('✅ Added missing [remarks] column to MySQL reports table');
    } catch (_) {
      // Column already exists
    }
  } else {
    try {
      await db.run(`ALTER TABLE reports ADD COLUMN remarks TEXT`);
      console.log('✅ Added missing [remarks] column to SQLite reports table');
    } catch (_) {
      // Column already exists
    }
  }

  // Dynamic migration: add access_mode column to reports table if missing
  if (isMySQL) {
    try {
      await db.run(`ALTER TABLE reports ADD COLUMN access_mode VARCHAR(64) DEFAULT NULL`);
      console.log('✅ Added missing [access_mode] column to MySQL reports table');
    } catch (_) {}
  } else {
    try {
      await db.run(`ALTER TABLE reports ADD COLUMN access_mode TEXT`);
      console.log('✅ Added missing [access_mode] column to SQLite reports table');
    } catch (_) {}
  }

  // Set default access_mode for older reports
  try {
    await db.run(`UPDATE reports SET access_mode = 'SB Control' WHERE access_mode IS NULL`);
  } catch (_) {}

  // Dynamic migration: add incident_date column to reports table if missing
  if (isMySQL) {
    try {
      await db.run(`ALTER TABLE reports ADD COLUMN incident_date VARCHAR(128) DEFAULT NULL`);
      console.log('✅ Added missing [incident_date] column to MySQL reports table');
    } catch (_) {}
  } else {
    try {
      await db.run(`ALTER TABLE reports ADD COLUMN incident_date TEXT`);
      console.log('✅ Added missing [incident_date] column to SQLite reports table');
    } catch (_) {}
  }

  // Pre-fill existing records with their creation date as default incident_date
  try {
    await db.run(`UPDATE reports SET incident_date = DATE(created_at) WHERE incident_date IS NULL`);
  } catch (_) {}

  // Dynamic migration for users table: add zone, division, and reporting_station columns if missing
  if (isMySQL) {
    try {
      await db.run(`ALTER TABLE users ADD COLUMN zone VARCHAR(64) DEFAULT NULL`);
      console.log('✅ Added missing [zone] column to MySQL users table');
    } catch (_) {}
    try {
      await db.run(`ALTER TABLE users ADD COLUMN division VARCHAR(64) DEFAULT NULL`);
      console.log('✅ Added missing [division] column to MySQL users table');
    } catch (_) {}
    try {
      await db.run(`ALTER TABLE users ADD COLUMN reporting_station VARCHAR(128) DEFAULT NULL`);
      console.log('✅ Added missing [reporting_station] column to MySQL users table');
    } catch (_) {}
    try {
      await db.run(`ALTER TABLE users ADD COLUMN access_modes VARCHAR(256) DEFAULT NULL`);
      console.log('✅ Added missing [access_modes] column to MySQL users table');
    } catch (_) {}
  } else {
    try {
      await db.run(`ALTER TABLE users ADD COLUMN zone TEXT`);
      console.log('✅ Added missing [zone] column to SQLite users table');
    } catch (_) {}
    try {
      await db.run(`ALTER TABLE users ADD COLUMN division TEXT`);
      console.log('✅ Added missing [division] column to SQLite users table');
    } catch (_) {}
    try {
      await db.run(`ALTER TABLE users ADD COLUMN reporting_station TEXT`);
      console.log('✅ Added missing [reporting_station] column to SQLite users table');
    } catch (_) {}
    try {
      await db.run(`ALTER TABLE users ADD COLUMN access_modes TEXT`);
      console.log('✅ Added missing [access_modes] column to SQLite users table');
    } catch (_) {}
  }

  console.log(`✅ Database schema initialized [${isMySQL ? 'MySQL' : 'SQLite'}]`);
}

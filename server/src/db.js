import sqlite3 from 'sqlite3';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.resolve(__dirname, '../data/app.db');

// Ensure database directory exists (essential for cloud platforms like Render where empty git folders are ignored)
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbFile);
const run = promisify(db.run.bind(db));
const get = promisify(db.get.bind(db));
const all = promisify(db.all.bind(db));

async function initialize() {
  await run(`PRAGMA foreign_keys = ON;`);
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    password TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);

  await run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    area TEXT NOT NULL,
    station TEXT NOT NULL,
    officer_name TEXT NOT NULL,
    priority TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_officer TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_to_commissioner INTEGER NOT NULL DEFAULT 1,
    latitude REAL,
    longitude REAL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);

  await run(`CREATE TABLE IF NOT EXISTS bulletins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    severity TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);

  // Ensure older database schemas still include the sent_to_commissioner flag and GPS coordinates
  const reportCols = await all(`PRAGMA table_info(reports);`);
  if (!reportCols.some(col => col.name === 'sent_to_commissioner')) {
    await run(`ALTER TABLE reports ADD COLUMN sent_to_commissioner INTEGER NOT NULL DEFAULT 1;`);
  }
  if (!reportCols.some(col => col.name === 'latitude')) {
    await run(`ALTER TABLE reports ADD COLUMN latitude REAL;`);
  }
  if (!reportCols.some(col => col.name === 'longitude')) {
    await run(`ALTER TABLE reports ADD COLUMN longitude REAL;`);
  }
  if (!reportCols.some(col => col.name === 'assigned_officer')) {
    await run(`ALTER TABLE reports ADD COLUMN assigned_officer TEXT;`);
  }

  const admin = await get(`SELECT id FROM users WHERE employee_id = ?`, ['commissioner']);
  if (!admin) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    await run(
      `INSERT INTO users (employee_id, name, role, password, is_admin) VALUES (?, ?, ?, ?, ?);`,
      ['commissioner', 'Commissioner', 'admin', passwordHash, 1]
    );
  }

  const staffUsers = [
    { employee_id: 'ci001', name: 'Circle Inspector', role: 'CI', password: 'passCI' },
    { employee_id: 'si001', name: 'Sub Inspector', role: 'SI', password: 'passSI' },
    { employee_id: 'const001', name: 'Constable', role: 'Constable', password: 'passConst' },
    { employee_id: 'staff001', name: 'Police Staff', role: 'Other', password: 'passStaff' }
  ];

  for (const user of staffUsers) {
    const exists = await get(`SELECT id FROM users WHERE employee_id = ?`, [user.employee_id]);
    if (!exists) {
      const hash = await bcrypt.hash(user.password, 10);
      await run(`INSERT INTO users (employee_id, name, role, password) VALUES (?, ?, ?, ?);`, [user.employee_id, user.name, user.role, hash]);
    }
  }

  // Seed sample incident reports if database is empty
  const reportsCount = await get(`SELECT COUNT(*) as count FROM reports`);
  if (reportsCount && reportsCount.count === 0) {
    const ciUser = await get(`SELECT id FROM users WHERE employee_id = ?`, ['ci001']);
    const siUser = await get(`SELECT id FROM users WHERE employee_id = ?`, ['si001']);
    const constUser = await get(`SELECT id FROM users WHERE employee_id = ?`, ['const001']);

    if (ciUser) {
      await run(`INSERT INTO reports (user_id, area, station, officer_name, priority, description, status, sent_to_commissioner, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, [
        ciUser.id,
        'Vijayawada Sector 3',
        'Vijayawada Central PS',
        'Circle Inspector',
        'High',
        'Heavy traffic congestion observed near the bus terminal. Officers deployed for diversion and traffic ease.',
        'in_review',
        16.5062,
        80.6480
      ]);
    }
    if (siUser) {
      await run(`INSERT INTO reports (user_id, area, station, officer_name, priority, description, status, sent_to_commissioner, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, [
        siUser.id,
        'Visakhapatnam Beach Road',
        'Vizag East PS',
        'Sub Inspector',
        'Medium',
        'Public security patrol along Beach Road completed successfully. No suspicious activity reported.',
        'resolved',
        17.6868,
        83.2185
      ]);
    }
    if (constUser) {
      await run(`INSERT INTO reports (user_id, area, station, officer_name, priority, description, status, sent_to_commissioner, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`, [
        constUser.id,
        'Tirupati Temple Entrance',
        'Tirumala PS',
        'Constable',
        'High',
        'VVIP movement security checkpoint setup completed. VIP escort team ready on standby.',
        'pending',
        13.6288,
        79.4192
      ]);
    }
  }
}

await initialize();

export { db, run, get, all };

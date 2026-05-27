import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let dbFile = path.resolve(__dirname, '../data/app.db');

try {
  const dbDir = path.dirname(dbFile);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
} catch (err) {
  dbFile = '/tmp/app.db';
  try {
    const dbDir = path.dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (err2) {
    dbFile = ':memory:';
  }
}

const db = new DatabaseSync(dbFile);
try {
  const rows = db.prepare(`PRAGMA table_info(reports);`).all();
  const exists = rows.some(r => r.name === 'sent_to_commissioner');
  if (!exists) {
    db.prepare(`ALTER TABLE reports ADD COLUMN sent_to_commissioner INTEGER NOT NULL DEFAULT 1;`).run();
    console.log('sent_to_commissioner column added');
  } else {
    db.prepare(`UPDATE reports SET sent_to_commissioner = 1 WHERE sent_to_commissioner IS NULL;`).run();
    console.log('sent_to_commissioner column exists; ensured non-null values');
  }
} catch (err) {
  console.error('Migration error:', err);
  process.exit(1);
}

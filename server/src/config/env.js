import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cwdEnv = path.resolve(process.cwd(), '.env');
const serverEnv = path.resolve(__dirname, '../../.env');

if (!process.env.VERCEL) {
  if (fs.existsSync(cwdEnv)) {
    dotenv.config({ path: cwdEnv });
  } else if (fs.existsSync(serverEnv)) {
    dotenv.config({ path: serverEnv });
  } else {
    dotenv.config();
  }
}


const isProd = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'default-fallback-secret-key-change-before-production-1234567890';
  console.warn('⚠️  JWT_SECRET not set — using default fallback secret.');
}

// In production, ALL vars are required and the server crashes if any are missing.
// In development, only JWT_SECRET is required (MySQL vars are optional — SQLite is used).
const requiredAlways = ['JWT_SECRET'];
const requiredInProduction = ['MYSQLHOST', 'MYSQLUSER', 'MYSQLPASSWORD', 'MYSQLDATABASE'];

const missing = requiredAlways.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`\n❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Please copy server/.env.example to server/.env and fill in all values.\n');
  process.exit(1);
}

if (isProd) {
  const missingMysql = requiredInProduction.filter((key) => !process.env[key]);
  if (missingMysql.length > 0) {
    console.warn(`\n⚠️  WARNING: Production mode is active but MySQL variables are missing: ${missingMysql.join(', ')}`);
    console.warn('   The server will fall back to SQLite, but database changes will be ephemeral on systems without persistent storage!\n');
  }
}

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  db: {
    host: process.env.MYSQLHOST || 'localhost',
    port: parseInt(process.env.MYSQLPORT || '3306', 10),
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'police_portal',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00',
  },
};

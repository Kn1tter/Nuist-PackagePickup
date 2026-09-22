import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usePg = Boolean(process.env.DATABASE_URL);

let pool = null;
let sqlite = null;

function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function initSqlite() {
  const { default: Database } = await import('better-sqlite3');
  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : path.join(__dirname, '../../data/campus.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      credit_score INTEGER DEFAULT 100,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      courier_id INTEGER REFERENCES users(id),
      pickup_code TEXT NOT NULL,
      phone_last4 TEXT NOT NULL,
      dorm_building TEXT NOT NULL,
      express_company TEXT,
      package_size TEXT DEFAULT 'small',
      reward REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      paid_offline INTEGER DEFAULT 0,
      pickup_photo_url TEXT,
      delivery_photo_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      accepted_at TEXT,
      picked_at TEXT,
      delivered_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

async function initPg() {
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(20) UNIQUE NOT NULL,
      phone VARCHAR(20) NOT NULL,
      password_hash TEXT NOT NULL,
      nickname VARCHAR(50),
      credit_score INT DEFAULT 100,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      courier_id INT REFERENCES users(id),
      pickup_code VARCHAR(50) NOT NULL,
      phone_last4 CHAR(4) NOT NULL,
      dorm_building VARCHAR(20) NOT NULL,
      express_company VARCHAR(20),
      package_size VARCHAR(10) DEFAULT 'small',
      reward DECIMAL(5,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      paid_offline BOOLEAN DEFAULT FALSE,
      pickup_photo_url TEXT,
      delivery_photo_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      accepted_at TIMESTAMP,
      picked_at TIMESTAMP,
      delivered_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      order_id INT NOT NULL REFERENCES orders(id),
      from_user_id INT NOT NULL REFERENCES users(id),
      to_user_id INT NOT NULL REFERENCES users(id),
      rating INT CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

function runAll(sql, params = []) {
  if (usePg) {
    return pool.query(toPg(sql), params).then(({ rows }) => rows);
  }
  return Promise.resolve(sqlite.prepare(sql).all(...params));
}

async function runOne(sql, params = []) {
  const rows = await runAll(sql, params);
  return rows[0];
}

async function runExec(sql, params = []) {
  if (usePg) {
    const { rowCount } = await pool.query(toPg(sql), params);
    return { changes: rowCount || 0 };
  }
  const info = sqlite.prepare(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
}

export const ready = (async () => {
  if (usePg) await initPg();
  else await initSqlite();
  const { migrate } = await import('./migrate.js');
  await migrate({
    queryAll: runAll,
    queryOne: runOne,
    execute: runExec,
    isPostgres: () => usePg,
  });
  console.log(`[db] using ${usePg ? 'PostgreSQL' : 'SQLite'}`);
})();

export async function queryAll(sql, params = []) {
  await ready;
  return runAll(sql, params);
}

export async function queryOne(sql, params = []) {
  await ready;
  return runOne(sql, params);
}

export async function execute(sql, params = []) {
  await ready;
  return runExec(sql, params);
}

/** INSERT … 返回新行 id（无 id 列的表则只执行插入） */
export async function insert(sql, params = []) {
  await ready;
  if (usePg) {
    const base = toPg(sql);
    try {
      const { rows } = await pool.query(`${base} RETURNING id`, params);
      return { lastInsertRowid: rows[0]?.id ?? null, changes: 1 };
    } catch (e) {
      // 复合主键等表没有 id 列（42703 = undefined_column）
      if (e.code === '42703') {
        const result = await pool.query(base, params);
        return { lastInsertRowid: null, changes: result.rowCount || 1 };
      }
      throw e;
    }
  }
  const info = sqlite.prepare(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
}

export function isPostgres() {
  return usePg;
}

/** 兼容已有库：补列 / 建论坛表 / 同步管理员 */

export async function migrate({ queryAll, queryOne, execute, isPostgres }) {
  if (isPostgres()) {
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`);
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_posts (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_replies (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON forum_posts(created_at DESC)`);
    await execute(`CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id)`);
    await execute(`
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title VARCHAR(120) NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        category VARCHAR(40) DEFAULT '其他',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(created_at DESC)`);
    await execute(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        admin_reply TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        replied_at TIMESTAMP
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        link TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, is_read, created_at DESC)`);
  } else {
    try {
      await execute(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
    } catch {
      /* column may already exist */
    }
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,
        category TEXT DEFAULT '其他',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        admin_reply TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        replied_at TEXT
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }

  await syncAdmins({ queryOne, execute, isPostgres });
}

function adminStudentIds() {
  return (process.env.ADMIN_STUDENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function syncAdmins({
  queryOne = null,
  execute = null,
  isPostgres = null,
} = {}) {
  // 运行时默认走 db 导出（启动完成后）
  const db = await import('./index.js');
  const q1 = queryOne || db.queryOne;
  const exec = execute || db.execute;
  const pg = isPostgres || db.isPostgres;

  const ids = adminStudentIds();
  for (const sid of ids) {
    await exec(
      pg()
        ? `UPDATE users SET is_admin = TRUE WHERE student_id = ?`
        : `UPDATE users SET is_admin = 1 WHERE student_id = ?`,
      [sid]
    );
  }

  // 代拿/论坛共用 users 表：始终把最早注册的账号设为管理员
  const first = await q1(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  if (first) {
    await exec(
      pg()
        ? `UPDATE users SET is_admin = TRUE WHERE id = ?`
        : `UPDATE users SET is_admin = 1 WHERE id = ?`,
      [first.id]
    );
  }
}

export function isAdminUser(user) {
  if (!user) return false;
  return user.is_admin === true || user.is_admin === 1 || user.is_admin === 't';
}

export async function promoteIfAdminStudent(studentId) {
  const db = await import('./index.js');
  if (!adminStudentIds().includes(String(studentId))) return;
  await db.execute(
    db.isPostgres()
      ? `UPDATE users SET is_admin = TRUE WHERE student_id = ?`
      : `UPDATE users SET is_admin = 1 WHERE student_id = ?`,
    [studentId]
  );
}

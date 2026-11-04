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
      CREATE TABLE IF NOT EXISTS resource_comments (
        id SERIAL PRIMARY KEY,
        resource_id INT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_resource_comments_res ON resource_comments(resource_id, created_at ASC)`
    );
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
        announce_id VARCHAR(40),
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, is_read, created_at DESC)`);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(60) NOT NULL UNIQUE,
        description TEXT,
        creator_id INT NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_group_members (
        group_id INT NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        joined_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (group_id, user_id)
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_invites (
        id SERIAL PRIMARY KEY,
        group_id INT NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        contact VARCHAR(80),
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_game_invites_group ON game_invites(group_id, created_at DESC)`);
    await execute(`
      CREATE TABLE IF NOT EXISTS schedule_courses (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(80) NOT NULL,
        location VARCHAR(120),
        day_of_week INT NOT NULL,
        start_time VARCHAR(8) NOT NULL,
        end_time VARCHAR(8) NOT NULL,
        weeks VARCHAR(80) DEFAULT '1-16',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS schedule_settings (
        user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        term_start_date VARCHAR(20),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_schedule_user ON schedule_courses(user_id)`);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_chat_messages (
        id SERIAL PRIMARY KEY,
        group_id INT NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_game_chat_group ON game_chat_messages(group_id, id DESC)`
    );
    // 补齐：创建者必须是成员
    await execute(`
      INSERT INTO game_group_members (group_id, user_id)
      SELECT g.id, g.creator_id
      FROM game_groups g
      WHERE NOT EXISTS (
        SELECT 1 FROM game_group_members m
        WHERE m.group_id = g.id AND m.user_id = g.creator_id
      )
    `);
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
      CREATE TABLE IF NOT EXISTS resource_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_resource_comments_res ON resource_comments(resource_id, created_at ASC)`
    );
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
        announce_id TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        creator_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_group_members (
        group_id INTEGER NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        joined_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (group_id, user_id)
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        contact TEXT,
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS schedule_courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        location TEXT,
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        weeks TEXT DEFAULT '1-16',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS schedule_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        term_start_date TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS game_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL REFERENCES game_groups(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_game_chat_group ON game_chat_messages(group_id, id DESC)`
    );
    await execute(`
      INSERT INTO game_group_members (group_id, user_id)
      SELECT g.id, g.creator_id
      FROM game_groups g
      WHERE NOT EXISTS (
        SELECT 1 FROM game_group_members m
        WHERE m.group_id = g.id AND m.user_id = g.creator_id
      )
    `);
  }

  // 代拿：备注、快递单号；放宽宿舍/快递公司字段长度；用户邮箱；个性签名；小游戏战绩
  if (isPostgres()) {
    await execute(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS remark TEXT`);
    await execute(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_no VARCHAR(40)`);
    await execute(`ALTER TABLE orders ALTER COLUMN dorm_building TYPE VARCHAR(40)`);
    await execute(`ALTER TABLE orders ALTER COLUMN express_company TYPE VARCHAR(40)`);
    await execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS announce_id VARCHAR(40)`);
    await execute(`CREATE INDEX IF NOT EXISTS idx_messages_announce ON messages(announce_id)`);
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120)`);
    await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS signature VARCHAR(60) DEFAULT ''`);
    await execute(`
      CREATE TABLE IF NOT EXISTS arcade_stats (
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game VARCHAR(16) NOT NULL,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        flees INT DEFAULT 0,
        best_score INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, game)
      )
    `);
    await execute(
      `ALTER TABLE arcade_stats ADD COLUMN IF NOT EXISTS best_score INT DEFAULT 0`
    );
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_arcade_stats_rank ON arcade_stats(game, wins DESC, losses ASC)`
    );
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_arcade_stats_score ON arcade_stats(game, best_score DESC)`
    );
    await execute(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key VARCHAR(80) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS courier_specialists (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(40) NOT NULL,
        qq VARCHAR(20) NOT NULL,
        note VARCHAR(80) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0`);
    await execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname_changed_at TIMESTAMP`);
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_post_likes (
        post_id INT NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (post_id, user_id)
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_forum_post_likes_user ON forum_post_likes(user_id)`
    );
    await execute(`
      CREATE TABLE IF NOT EXISTS changelogs (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id),
        title VARCHAR(120) NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_changelogs_created ON changelogs(created_at DESC)`);
    await execute(`
      CREATE TABLE IF NOT EXISTS chaoxing_bindings (
        user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        cx_username VARCHAR(80) NOT NULL,
        cx_password_enc TEXT NOT NULL,
        notify_enabled BOOLEAN DEFAULT TRUE,
        notify_hours_before INT DEFAULT 48,
        course_limit INT DEFAULT 12,
        push_bark_url TEXT,
        push_webhook_url TEXT,
        last_fetch_at TIMESTAMP,
        last_notify_at TIMESTAMP,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS chaoxing_homework_cache (
        user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        payload TEXT NOT NULL,
        fetched_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS chaoxing_notify_log (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        homework_key VARCHAR(240) NOT NULL,
        kind VARCHAR(40) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await execute(
      `CREATE INDEX IF NOT EXISTS idx_chaoxing_notify_user ON chaoxing_notify_log(user_id, kind, created_at DESC)`
    );
  } else {
    try {
      await execute(`ALTER TABLE orders ADD COLUMN remark TEXT`);
    } catch {
      /* exists */
    }
    try {
      await execute(`ALTER TABLE orders ADD COLUMN tracking_no TEXT`);
    } catch {
      /* exists */
    }
    try {
      await execute(`ALTER TABLE messages ADD COLUMN announce_id TEXT`);
    } catch {
      /* exists */
    }
    try {
      await execute(`ALTER TABLE users ADD COLUMN email TEXT`);
    } catch {
      /* exists */
    }
    try {
      await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    } catch {
      /* exists / nulls */
    }
    try {
      await execute(`ALTER TABLE users ADD COLUMN signature TEXT DEFAULT ''`);
    } catch {
      /* exists */
    }
    await execute(`
      CREATE TABLE IF NOT EXISTS arcade_stats (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        flees INTEGER DEFAULT 0,
        best_score INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, game)
      )
    `);
    try {
      await execute(`ALTER TABLE arcade_stats ADD COLUMN best_score INTEGER DEFAULT 0`);
    } catch {
      /* exists */
    }
    try {
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_arcade_stats_rank ON arcade_stats(game, wins DESC, losses ASC)`
      );
    } catch {
      /* exists */
    }
    try {
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_arcade_stats_score ON arcade_stats(game, best_score DESC)`
      );
    } catch {
      /* exists */
    }
    await execute(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS courier_specialists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        qq TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    try {
      await execute(`ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0`);
    } catch {
      /* exists */
    }
    try {
      await execute(`ALTER TABLE users ADD COLUMN nickname_changed_at TEXT`);
    } catch {
      /* exists */
    }
    await execute(`
      CREATE TABLE IF NOT EXISTS forum_post_likes (
        post_id INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (post_id, user_id)
      )
    `);
    try {
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_forum_post_likes_user ON forum_post_likes(user_id)`
      );
    } catch {
      /* exists */
    }
    await execute(`
      CREATE TABLE IF NOT EXISTS changelogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    try {
      await execute(`CREATE INDEX IF NOT EXISTS idx_changelogs_created ON changelogs(created_at DESC)`);
    } catch {
      /* exists */
    }
    await execute(`
      CREATE TABLE IF NOT EXISTS chaoxing_bindings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        cx_username TEXT NOT NULL,
        cx_password_enc TEXT NOT NULL,
        notify_enabled INTEGER DEFAULT 1,
        notify_hours_before INTEGER DEFAULT 48,
        course_limit INTEGER DEFAULT 12,
        push_bark_url TEXT,
        push_webhook_url TEXT,
        last_fetch_at TEXT,
        last_notify_at TEXT,
        last_error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS chaoxing_homework_cache (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        payload TEXT NOT NULL,
        fetched_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await execute(`
      CREATE TABLE IF NOT EXISTS chaoxing_notify_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        homework_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    try {
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_chaoxing_notify_user ON chaoxing_notify_log(user_id, kind, created_at DESC)`
      );
    } catch {
      /* exists */
    }
  }

  // 预置官方派送专员（不存在时插入）
  try {
    const seedQq = '1440205803';
    const exists = await queryOne(`SELECT id FROM courier_specialists WHERE qq = ?`, [seedQq]);
    if (!exists) {
      await execute(
        `INSERT INTO courier_specialists (nickname, qq, note) VALUES (?, ?, ?)`,
        ['官方派送专员', seedQq, '校园代拿官方专员']
      );
    }
  } catch (e) {
    console.warn('[migrate] courier_specialists seed skipped:', e.message);
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

  // 未配置 ADMIN_STUDENT_IDS 时，保留「最早注册用户」为管理员，避免本地/初期无人可管
  if (!ids.length) {
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

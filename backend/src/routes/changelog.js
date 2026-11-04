import { Router } from 'express';
import { execute, insert, queryAll, queryOne } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth, optionalAuth } from '../middleware/auth.js';

const router = Router();

async function requireAdmin(req, res) {
  const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!isAdminUser(me)) {
    res.status(403).json({ error: '仅管理员可发布或删除更新日志' });
    return null;
  }
  return me;
}

function mapEntry(row, { canDelete = false } = {}) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    body_preview: String(row.body || '').slice(0, 140),
    created_at: row.created_at,
    nickname: row.nickname || '管理员',
    user_id: row.user_id,
    can_delete: canDelete,
  };
}

/** GET /api/changelog — 所有人可看 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT c.id, c.title, c.body, c.created_at, c.user_id, u.nickname
       FROM changelogs c
       JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at DESC
       LIMIT 100`
    );
    const viewerId = req.user?.id ?? null;
    const me = viewerId ? await queryOne('SELECT * FROM users WHERE id = ?', [viewerId]) : null;
    const isAdmin = isAdminUser(me);
    res.json({
      entries: rows.map((r) => mapEntry(r, { canDelete: isAdmin })),
      viewer: { is_admin: isAdmin },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载更新日志失败' });
  }
});

/** GET /api/changelog/:id */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT c.*, u.nickname
       FROM changelogs c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '日志不存在' });
    const viewerId = req.user?.id ?? null;
    const me = viewerId ? await queryOne('SELECT * FROM users WHERE id = ?', [viewerId]) : null;
    const isAdmin = isAdminUser(me);
    res.json({
      entry: mapEntry(row, { canDelete: isAdmin }),
      viewer: { is_admin: isAdmin },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载失败' });
  }
});

/** POST /api/changelog — 仅管理员 */
router.post('/', auth, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;
    const title = String(req.body?.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const body = String(req.body?.body || '').trim().slice(0, 8000);
    if (!title) return res.status(400).json({ error: '请填写标题' });
    if (!body) return res.status(400).json({ error: '请填写正文' });

    const info = await insert(`INSERT INTO changelogs (user_id, title, body) VALUES (?, ?, ?)`, [
      me.id,
      title,
      body,
    ]);
    const row = await queryOne(
      `SELECT c.*, u.nickname
       FROM changelogs c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [info.lastInsertRowid]
    );
    res.status(201).json({ entry: mapEntry(row, { canDelete: true }) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发布失败' });
  }
});

/** DELETE /api/changelog/:id — 仅管理员 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;
    const row = await queryOne(`SELECT id FROM changelogs WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: '日志不存在' });
    await execute(`DELETE FROM changelogs WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

export default router;

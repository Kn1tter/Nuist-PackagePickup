import crypto from 'crypto';
import { Router } from 'express';
import { insert, queryAll, queryOne, execute, isPostgres } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';
import { notifyUser } from '../lib/notify.js';

const router = Router();

async function notifyAdmins(title, body, link = null) {
  const admins = await queryAll(
    isPostgres()
      ? `SELECT id FROM users WHERE is_admin = TRUE`
      : `SELECT id FROM users WHERE is_admin = 1`
  );
  for (const a of admins) {
    await notifyUser(a.id, title, body, link);
  }
}

/** 未读数量 */
router.get('/unread-count', auth, async (req, res) => {
  try {
    const row = await queryOne(
      isPostgres()
        ? `SELECT COUNT(*)::int AS c FROM messages WHERE user_id = ? AND is_read = FALSE`
        : `SELECT COUNT(*) AS c FROM messages WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );
    res.json({ count: Number(row?.c || 0) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '获取未读失败' });
  }
});

/** 未读全站公告（供全站弹窗） */
router.get('/announcements/unread', auth, async (req, res) => {
  try {
    const rows = await queryAll(
      isPostgres()
        ? `SELECT * FROM messages
           WHERE user_id = ? AND is_read = FALSE AND title LIKE '%【全站公告】%'
           ORDER BY created_at DESC
           LIMIT 10`
        : `SELECT * FROM messages
           WHERE user_id = ? AND is_read = 0 AND title LIKE '%【全站公告】%'
           ORDER BY created_at DESC
           LIMIT 10`,
      [req.user.id]
    );
    res.json({
      announcements: rows.map((m) => ({
        ...m,
        is_read: m.is_read === true || m.is_read === 1 || m.is_read === 't',
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载公告失败' });
  }
});

/** 我的消息列表 */
router.get('/messages', auth, async (req, res) => {
  try {
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const rows = await queryAll(
      `SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({
      is_admin: isAdminUser(me),
      messages: rows.map((m) => ({
        ...m,
        is_read: m.is_read === true || m.is_read === 1 || m.is_read === 't',
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载消息失败' });
  }
});

async function requireAdmin(req, res) {
  const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!isAdminUser(me)) {
    res.status(403).json({ error: '仅管理员可操作' });
    return null;
  }
  return me;
}

/** 管理员：已发送的全站公告列表（按批次） */
router.get('/announcements/admin', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const withId = await queryAll(
      isPostgres()
        ? `SELECT announce_id,
                  title,
                  body,
                  link,
                  MIN(created_at) AS created_at,
                  COUNT(*)::int AS recipients
           FROM messages
           WHERE announce_id IS NOT NULL AND announce_id <> ''
           GROUP BY announce_id, title, body, link
           ORDER BY MIN(created_at) DESC
           LIMIT 50`
        : `SELECT announce_id,
                  title,
                  body,
                  link,
                  MIN(created_at) AS created_at,
                  COUNT(*) AS recipients
           FROM messages
           WHERE announce_id IS NOT NULL AND announce_id <> ''
           GROUP BY announce_id, title, body, link
           ORDER BY MIN(created_at) DESC
           LIMIT 50`
    );

    const legacy = await queryAll(
      isPostgres()
        ? `SELECT NULL::text AS announce_id,
                  title,
                  body,
                  link,
                  MIN(created_at) AS created_at,
                  COUNT(*)::int AS recipients
           FROM messages
           WHERE title LIKE '%【全站公告】%'
             AND (announce_id IS NULL OR announce_id = '')
           GROUP BY title, body, link
           ORDER BY MIN(created_at) DESC
           LIMIT 30`
        : `SELECT NULL AS announce_id,
                  title,
                  body,
                  link,
                  MIN(created_at) AS created_at,
                  COUNT(*) AS recipients
           FROM messages
           WHERE title LIKE '%【全站公告】%'
             AND (announce_id IS NULL OR announce_id = '')
           GROUP BY title, body, link
           ORDER BY MIN(created_at) DESC
           LIMIT 30`
    );

    res.json({
      announcements: [...withId, ...legacy].map((a) => ({
        ...a,
        recipients: Number(a.recipients || 0),
        legacy: !a.announce_id,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载公告失败' });
  }
});

/** 管理员撤回全站公告（删除所有用户收到的该条） */
router.delete('/announcements', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const announceId = String(req.body?.announce_id || '').trim();
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();

    let result;
    if (announceId) {
      result = await execute(`DELETE FROM messages WHERE announce_id = ?`, [announceId]);
    } else if (title && body) {
      // 兼容旧公告（无 announce_id）
      result = await execute(
        isPostgres()
          ? `DELETE FROM messages
             WHERE title = ? AND body = ?
               AND title LIKE '%【全站公告】%'
               AND (announce_id IS NULL OR announce_id = '')`
          : `DELETE FROM messages
             WHERE title = ? AND body = ?
               AND title LIKE '%【全站公告】%'
               AND (announce_id IS NULL OR announce_id = '')`,
        [title, body]
      );
    } else {
      return res.status(400).json({ error: '请指定要删除的公告' });
    }

    res.json({ ok: true, deleted: result.changes || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除公告失败' });
  }
});

/** 管理员全站公告（群发站内信） */
router.post('/announce', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const titleRaw = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const link = String(req.body?.link || '').trim() || '/messages';

    if (titleRaw.length < 1 || titleRaw.length > 80) {
      return res.status(400).json({ error: '标题请控制在 1–80 字' });
    }
    if (body.length < 1 || body.length > 2000) {
      return res.status(400).json({ error: '正文请控制在 1–2000 字' });
    }
    if (link.length > 200) {
      return res.status(400).json({ error: '链接过长' });
    }

    const title = titleRaw.startsWith('【全站公告】')
      ? titleRaw
      : `【全站公告】${titleRaw}`.slice(0, 120);
    const announceId = crypto.randomBytes(8).toString('hex');

    const result = await execute(
      `INSERT INTO messages (user_id, title, body, link, announce_id)
       SELECT id, ?, ?, ?, ? FROM users`,
      [title, body, link, announceId]
    );

    res.status(201).json({
      ok: true,
      count: result.changes || 0,
      title,
      announce_id: announceId,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发送公告失败' });
  }
});

router.post('/messages/:id/read', auth, async (req, res) => {
  try {
    await execute(
      isPostgres()
        ? `UPDATE messages SET is_read = TRUE WHERE id = ? AND user_id = ?`
        : `UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '标记已读失败' });
  }
});

router.post('/messages/read-all', auth, async (req, res) => {
  try {
    await execute(
      isPostgres()
        ? `UPDATE messages SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE`
        : `UPDATE messages SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '全部已读失败' });
  }
});

/** 提交反馈 */
router.post('/feedback', auth, async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (content.length < 2 || content.length > 2000) {
      return res.status(400).json({ error: '反馈请控制在 2–2000 字' });
    }
    const info = await insert(`INSERT INTO feedbacks (user_id, content) VALUES (?, ?)`, [
      req.user.id,
      content,
    ]);
    await notifyAdmins(
      '收到新反馈',
      content.slice(0, 80) + (content.length > 80 ? '…' : ''),
      '/feedback'
    );
    await notifyUser(
      req.user.id,
      '反馈已提交',
      '我们已收到你的反馈，管理员会尽快查看。',
      '/feedback'
    );
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '提交失败' });
  }
});

/** 反馈列表：普通用户看自己的，管理员看全部 */
router.get('/feedback', auth, async (req, res) => {
  try {
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const admin = isAdminUser(me);
    const rows = admin
      ? await queryAll(
          `SELECT f.*, u.nickname, u.student_id
           FROM feedbacks f
           JOIN users u ON u.id = f.user_id
           ORDER BY f.created_at DESC
           LIMIT 100`
        )
      : await queryAll(
          `SELECT f.*, u.nickname, u.student_id
           FROM feedbacks f
           JOIN users u ON u.id = f.user_id
           WHERE f.user_id = ?
           ORDER BY f.created_at DESC
           LIMIT 100`,
          [req.user.id]
        );
    res.json({ feedbacks: rows, is_admin: admin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载反馈失败' });
  }
});

/** 管理员回复反馈 */
router.post('/feedback/:id/reply', auth, async (req, res) => {
  try {
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!isAdminUser(me)) return res.status(403).json({ error: '仅管理员可回复' });

    const reply = String(req.body?.reply || '').trim();
    if (reply.length < 1 || reply.length > 2000) {
      return res.status(400).json({ error: '回复请控制在 1–2000 字' });
    }

    const fb = await queryOne('SELECT * FROM feedbacks WHERE id = ?', [req.params.id]);
    if (!fb) return res.status(404).json({ error: '反馈不存在' });

    await execute(
      isPostgres()
        ? `UPDATE feedbacks SET admin_reply = ?, status = 'done', replied_at = NOW() WHERE id = ?`
        : `UPDATE feedbacks SET admin_reply = ?, status = 'done', replied_at = datetime('now') WHERE id = ?`,
      [reply, req.params.id]
    );

    await notifyUser(fb.user_id, '反馈已回复', reply.slice(0, 120), '/feedback');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '回复失败' });
  }
});

export default router;

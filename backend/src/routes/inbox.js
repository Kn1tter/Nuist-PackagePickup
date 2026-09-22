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

/** 我的消息列表 */
router.get('/messages', auth, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({
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

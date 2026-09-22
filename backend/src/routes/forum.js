import { Router } from 'express';
import { insert, queryAll, queryOne, execute } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';
import { publicStudentId } from '../lib/mask.js';

const router = Router();

function boolAdmin(row) {
  return isAdminUser(row);
}

function maskUser(row) {
  return { ...row, student_id: publicStudentId(row.student_id) };
}

router.get('/posts', auth, async (_req, res) => {
  try {
    const rows = await queryAll(
      `SELECT p.id, p.title, p.body, p.created_at, p.user_id,
              u.nickname, u.student_id,
              (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count
       FROM forum_posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT 100`
    );
    res.json({
      posts: rows.map((r) => ({
        ...maskUser(r),
        reply_count: Number(r.reply_count || 0),
        body_preview: String(r.body || '').slice(0, 120),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载帖子失败' });
  }
});

router.get('/posts/:id', auth, async (req, res) => {
  try {
    const post = await queryOne(
      `SELECT p.*, u.nickname, u.student_id
       FROM forum_posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const replies = await queryAll(
      `SELECT r.*, u.nickname, u.student_id
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC`,
      [req.params.id]
    );

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({
      post: {
        ...maskUser(post),
        can_delete: boolAdmin(me) || post.user_id === req.user.id,
      },
      replies: replies.map((r) => ({
        ...maskUser(r),
        can_delete: boolAdmin(me) || r.user_id === req.user.id,
      })),
      viewer: { is_admin: boolAdmin(me) },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载帖子失败' });
  }
});

router.post('/posts', auth, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (title.length < 2 || title.length > 120) {
      return res.status(400).json({ error: '标题请控制在 2–120 字' });
    }
    if (body.length < 2 || body.length > 5000) {
      return res.status(400).json({ error: '正文请控制在 2–5000 字' });
    }

    const info = await insert(
      `INSERT INTO forum_posts (user_id, title, body) VALUES (?, ?, ?)`,
      [req.user.id, title, body]
    );
    const post = await queryOne('SELECT * FROM forum_posts WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({ post });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发帖失败' });
  }
});

router.post('/posts/:id/replies', auth, async (req, res) => {
  try {
    const post = await queryOne('SELECT id FROM forum_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const body = String(req.body?.body || '').trim();
    if (body.length < 1 || body.length > 2000) {
      return res.status(400).json({ error: '回复请控制在 1–2000 字' });
    }

    const info = await insert(
      `INSERT INTO forum_replies (post_id, user_id, body) VALUES (?, ?, ?)`,
      [req.params.id, req.user.id, body]
    );
    const reply = await queryOne(
      `SELECT r.*, u.nickname, u.student_id
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [info.lastInsertRowid]
    );
    res.status(201).json({ reply: maskUser(reply) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '回复失败' });
  }
});

router.delete('/posts/:id', auth, async (req, res) => {
  try {
    const post = await queryOne('SELECT * FROM forum_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!boolAdmin(me) && post.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }

    await execute(`DELETE FROM forum_replies WHERE post_id = ?`, [req.params.id]);
    await execute(`DELETE FROM forum_posts WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

router.delete('/replies/:id', auth, async (req, res) => {
  try {
    const reply = await queryOne('SELECT * FROM forum_replies WHERE id = ?', [req.params.id]);
    if (!reply) return res.status(404).json({ error: '回复不存在' });

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!boolAdmin(me) && reply.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }

    await execute(`DELETE FROM forum_replies WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

export default router;

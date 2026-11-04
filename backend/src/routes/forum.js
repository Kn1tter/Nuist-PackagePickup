import { Router } from 'express';
import { insert, queryAll, queryOne, execute } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { publicStudentId } from '../lib/mask.js';
import { XP_REWARDS, levelFromXp } from '../lib/xp.js';
import { addUserXp } from '../lib/xpGrant.js';

const router = Router();

function boolAdmin(row) {
  return isAdminUser(row);
}

function maskUser(row) {
  const xpInfo = levelFromXp(row.xp);
  return {
    ...row,
    student_id: publicStudentId(row.student_id),
    level: xpInfo.level,
    xp: xpInfo.xp,
  };
}

router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const viewerId = req.user?.id ?? null;
    const rows = await queryAll(
      `SELECT p.id, p.title, p.body, p.created_at, p.user_id,
              u.nickname, u.student_id, u.xp,
              (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id = p.id) AS reply_count,
              (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS like_count
       FROM forum_posts p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC
       LIMIT 100`
    );

    let likedSet = new Set();
    if (viewerId && rows.length) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const liked = await queryAll(
        `SELECT post_id FROM forum_post_likes WHERE user_id = ? AND post_id IN (${placeholders})`,
        [viewerId, ...ids]
      );
      likedSet = new Set(liked.map((x) => Number(x.post_id)));
    }

    res.json({
      posts: rows.map((r) => ({
        ...maskUser(r),
        reply_count: Number(r.reply_count || 0),
        like_count: Number(r.like_count || 0),
        liked_by_me: likedSet.has(Number(r.id)),
        body_preview: String(r.body || '').slice(0, 120),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载帖子失败' });
  }
});

router.get('/posts/:id', optionalAuth, async (req, res) => {
  try {
    const post = await queryOne(
      `SELECT p.*, u.nickname, u.student_id, u.xp,
              (SELECT COUNT(*) FROM forum_post_likes l WHERE l.post_id = p.id) AS like_count
       FROM forum_posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const replies = await queryAll(
      `SELECT r.*, u.nickname, u.student_id, u.xp
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC`,
      [req.params.id]
    );

    const viewerId = req.user?.id ?? null;
    const me = viewerId ? await queryOne('SELECT * FROM users WHERE id = ?', [viewerId]) : null;
    let liked_by_me = false;
    if (viewerId) {
      const like = await queryOne(
        `SELECT 1 AS ok FROM forum_post_likes WHERE post_id = ? AND user_id = ?`,
        [req.params.id, viewerId]
      );
      liked_by_me = !!like;
    }

    res.json({
      post: {
        ...maskUser(post),
        like_count: Number(post.like_count || 0),
        liked_by_me,
        can_delete: !!viewerId && (boolAdmin(me) || Number(post.user_id) === Number(viewerId)),
      },
      replies: replies.map((r) => ({
        ...maskUser(r),
        can_delete: !!viewerId && (boolAdmin(me) || Number(r.user_id) === Number(viewerId)),
      })),
      viewer: {
        is_admin: boolAdmin(me),
        ...(me ? { level: levelFromXp(me.xp).level, xp: Number(me.xp) || 0 } : {}),
      },
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
    const xpInfo = await addUserXp(req.user.id, XP_REWARDS.post);
    const post = await queryOne('SELECT * FROM forum_posts WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({ post, xp: xpInfo, xp_gained: XP_REWARDS.post });
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
    const xpInfo = await addUserXp(req.user.id, XP_REWARDS.reply);
    const reply = await queryOne(
      `SELECT r.*, u.nickname, u.student_id, u.xp
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [info.lastInsertRowid]
    );
    res.status(201).json({
      reply: { ...maskUser(reply), can_delete: true },
      xp: xpInfo,
      xp_gained: XP_REWARDS.reply,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '回复失败' });
  }
});

/** 点赞 / 取消点赞（切换） */
router.post('/posts/:id/like', auth, async (req, res) => {
  try {
    const post = await queryOne(`SELECT id, user_id FROM forum_posts WHERE id = ?`, [req.params.id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const existing = await queryOne(
      `SELECT 1 AS ok FROM forum_post_likes WHERE post_id = ? AND user_id = ?`,
      [post.id, req.user.id]
    );

    let liked;
    let authorXp = null;
    if (existing) {
      await execute(`DELETE FROM forum_post_likes WHERE post_id = ? AND user_id = ?`, [
        post.id,
        req.user.id,
      ]);
      liked = false;
      // 取消点赞时扣回作者经验（不低于 0）
      if (Number(post.user_id) !== Number(req.user.id)) {
        authorXp = await addUserXp(post.user_id, -XP_REWARDS.liked);
      }
    } else {
      if (Number(post.user_id) === Number(req.user.id)) {
        return res.status(400).json({ error: '不能给自己的帖子点赞' });
      }
      await insert(`INSERT INTO forum_post_likes (post_id, user_id) VALUES (?, ?)`, [
        post.id,
        req.user.id,
      ]);
      liked = true;
      authorXp = await addUserXp(post.user_id, XP_REWARDS.liked);
    }

    const countRow = await queryOne(
      `SELECT COUNT(*) AS c FROM forum_post_likes WHERE post_id = ?`,
      [post.id]
    );
    res.json({
      liked,
      like_count: Number(countRow?.c || 0),
      author_xp: authorXp,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '点赞失败' });
  }
});

router.delete('/posts/:id', auth, async (req, res) => {
  try {
    const post = await queryOne('SELECT * FROM forum_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!boolAdmin(me) && Number(post.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: '无权删除' });
    }

    await execute(`DELETE FROM forum_post_likes WHERE post_id = ?`, [req.params.id]);
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
    if (!boolAdmin(me) && Number(reply.user_id) !== Number(req.user.id)) {
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

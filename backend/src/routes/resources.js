import { Router } from 'express';
import { insert, queryAll, queryOne, execute } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';
import { publicStudentId } from '../lib/mask.js';

const router = Router();
const CATEGORIES = ['课件', '历年卷', '软件工具', '学习资料', '其他'];

function looksLikeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sameId(a, b) {
  return a != null && b != null && Number(a) === Number(b);
}

function parseResourceBody(body) {
  const title = String(body?.title || '').trim();
  const description = String(body?.description || '').trim();
  const url = String(body?.url || '').trim();
  const category = String(body?.category || '其他').trim() || '其他';

  if (title.length < 2 || title.length > 120) {
    return { error: '标题请控制在 2–120 字' };
  }
  if (!looksLikeUrl(url)) {
    return { error: '请填写有效的 http/https 链接（网盘/文档均可）' };
  }
  if (description.length > 1000) {
    return { error: '简介请控制在 1000 字内' };
  }
  if (!CATEGORIES.includes(category)) {
    return { error: '分类无效' };
  }
  return { title, description, url, category };
}

router.get('/', auth, async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const rows = category
      ? await queryAll(
          `SELECT r.*, u.nickname, u.student_id,
                  (SELECT COUNT(*) FROM resource_comments c WHERE c.resource_id = r.id) AS comment_count
           FROM resources r
           JOIN users u ON u.id = r.user_id
           WHERE r.category = ?
           ORDER BY r.created_at DESC
           LIMIT 200`,
          [category]
        )
      : await queryAll(
          `SELECT r.*, u.nickname, u.student_id,
                  (SELECT COUNT(*) FROM resource_comments c WHERE c.resource_id = r.id) AS comment_count
           FROM resources r
           JOIN users u ON u.id = r.user_id
           ORDER BY r.created_at DESC
           LIMIT 200`
        );

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const admin = isAdminUser(me);
    res.json({
      categories: CATEGORIES,
      resources: rows.map((r) => {
        const owner = sameId(r.user_id, req.user.id);
        return {
          ...r,
          student_id: publicStudentId(r.student_id),
          comment_count: Number(r.comment_count || 0),
          can_edit: owner || admin,
          can_delete: owner || admin,
        };
      }),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载资源失败' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT r.*, u.nickname, u.student_id
       FROM resources r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '资源不存在' });

    const comments = await queryAll(
      `SELECT c.*, u.nickname, u.student_id
       FROM resource_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.resource_id = ?
       ORDER BY c.created_at ASC
       LIMIT 300`,
      [req.params.id]
    );

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const admin = isAdminUser(me);
    const owner = sameId(row.user_id, req.user.id);

    res.json({
      categories: CATEGORIES,
      resource: {
        ...row,
        student_id: publicStudentId(row.student_id),
        can_edit: owner || admin,
        can_delete: owner || admin,
      },
      comments: comments.map((c) => ({
        ...c,
        student_id: publicStudentId(c.student_id),
        can_delete: admin || sameId(c.user_id, req.user.id) || owner,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载详情失败' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const parsed = parseResourceBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const info = await insert(
      `INSERT INTO resources (user_id, title, description, url, category) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, parsed.title, parsed.description, parsed.url, parsed.category]
    );
    const row = await queryOne('SELECT * FROM resources WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({ resource: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发布失败' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '资源不存在' });

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!isAdminUser(me) && !sameId(row.user_id, req.user.id)) {
      return res.status(403).json({ error: '仅发布者可编辑' });
    }

    const parsed = parseResourceBody(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    await execute(
      `UPDATE resources SET title = ?, description = ?, url = ?, category = ? WHERE id = ?`,
      [parsed.title, parsed.description, parsed.url, parsed.category, req.params.id]
    );
    const updated = await queryOne(
      `SELECT r.*, u.nickname, u.student_id
       FROM resources r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = ?`,
      [req.params.id]
    );
    res.json({
      resource: {
        ...updated,
        student_id: publicStudentId(updated.student_id),
        can_edit: true,
        can_delete: true,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '保存失败' });
  }
});

router.delete('/comments/:id', auth, async (req, res) => {
  try {
    const comment = await queryOne('SELECT * FROM resource_comments WHERE id = ?', [req.params.id]);
    if (!comment) return res.status(404).json({ error: '评论不存在' });

    const resource = await queryOne('SELECT * FROM resources WHERE id = ?', [comment.resource_id]);
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const ok =
      isAdminUser(me) ||
      sameId(comment.user_id, req.user.id) ||
      sameId(resource?.user_id, req.user.id);
    if (!ok) return res.status(403).json({ error: '无权删除' });

    await execute(`DELETE FROM resource_comments WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '资源不存在' });

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!isAdminUser(me) && !sameId(row.user_id, req.user.id)) {
      return res.status(403).json({ error: '无权删除' });
    }

    await execute(`DELETE FROM resource_comments WHERE resource_id = ?`, [req.params.id]);
    await execute(`DELETE FROM resources WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

router.post('/:id/comments', auth, async (req, res) => {
  try {
    const row = await queryOne('SELECT id FROM resources WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '资源不存在' });

    const body = String(req.body?.body || '').trim();
    if (body.length < 1 || body.length > 1000) {
      return res.status(400).json({ error: '评论请控制在 1–1000 字' });
    }

    const info = await insert(
      `INSERT INTO resource_comments (resource_id, user_id, body) VALUES (?, ?, ?)`,
      [req.params.id, req.user.id, body]
    );
    const comment = await queryOne(
      `SELECT c.*, u.nickname, u.student_id
       FROM resource_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [info.lastInsertRowid]
    );
    res.status(201).json({
      comment: {
        ...comment,
        student_id: publicStudentId(comment.student_id),
        can_delete: true,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '评论失败' });
  }
});

export default router;

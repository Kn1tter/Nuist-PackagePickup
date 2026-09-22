import { Router } from 'express';
import { insert, queryAll, queryOne, execute } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';

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

router.get('/', auth, async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const rows = category
      ? await queryAll(
          `SELECT r.*, u.nickname, u.student_id
           FROM resources r
           JOIN users u ON u.id = r.user_id
           WHERE r.category = ?
           ORDER BY r.created_at DESC
           LIMIT 200`,
          [category]
        )
      : await queryAll(
          `SELECT r.*, u.nickname, u.student_id
           FROM resources r
           JOIN users u ON u.id = r.user_id
           ORDER BY r.created_at DESC
           LIMIT 200`
        );

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({
      categories: CATEGORIES,
      resources: rows.map((r) => ({
        ...r,
        can_delete: isAdminUser(me) || r.user_id === req.user.id,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载资源失败' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const url = String(req.body?.url || '').trim();
    const category = String(req.body?.category || '其他').trim() || '其他';

    if (title.length < 2 || title.length > 120) {
      return res.status(400).json({ error: '标题请控制在 2–120 字' });
    }
    if (!looksLikeUrl(url)) {
      return res.status(400).json({ error: '请填写有效的 http/https 链接（网盘/文档均可）' });
    }
    if (description.length > 1000) {
      return res.status(400).json({ error: '简介请控制在 1000 字内' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: '分类无效' });
    }

    const info = await insert(
      `INSERT INTO resources (user_id, title, description, url, category) VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, title, description, url, category]
    );
    const row = await queryOne('SELECT * FROM resources WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({ resource: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发布失败' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM resources WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '资源不存在' });

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!isAdminUser(me) && row.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }

    await execute(`DELETE FROM resources WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

export default router;

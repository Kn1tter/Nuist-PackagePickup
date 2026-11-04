import { Router } from 'express';
import { queryOne } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import {
  getHubBlurbs,
  setHubBlurb,
  isValidBlurbKey,
  HUB_BLURB_MAX,
} from '../lib/hubBlurbs.js';
import { getTodayInHistory, getTodayMeta } from '../lib/todayInHistory.js';

const router = Router();

/** GET /api/hub/today/meta — 仅节日/农历（瞬时，不拉外网） */
router.get('/today/meta', (_req, res) => {
  try {
    res.json(getTodayMeta());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载失败' });
  }
});

/** GET /api/hub/today — 历史上的今天；?light=1 主页预览（少汉化、更快） */
router.get('/today', async (req, res) => {
  try {
    const light = String(req.query.light || '') === '1';
    const data = await getTodayInHistory({ light });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载失败' });
  }
});

/** GET /api/hub/blurbs — 公开，返回首页入口简介 */
router.get('/blurbs', optionalAuth, async (req, res) => {
  try {
    const blurbs = await getHubBlurbs();
    let is_admin = false;
    if (req.user?.id) {
      const me = await queryOne('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
      is_admin = isAdminUser(me);
    }
    res.json({ blurbs, is_admin, max_len: HUB_BLURB_MAX });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载失败' });
  }
});

/** PUT /api/hub/blurbs/:key — 管理员更新某一入口简介 */
router.put('/blurbs/:key', auth, async (req, res) => {
  try {
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!isAdminUser(me)) {
      return res.status(403).json({ error: '仅管理员可编辑' });
    }
    const key = String(req.params.key || '');
    if (!isValidBlurbKey(key)) {
      return res.status(400).json({ error: '无效的入口' });
    }
    const value = await setHubBlurb(key, req.body?.text ?? req.body?.value);
    const blurbs = await getHubBlurbs();
    res.json({ ok: true, key, value, blurbs });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || '保存失败' });
  }
});

export default router;

import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { execute, isPostgres } from '../db/index.js';
import { sealSecret } from '../lib/secretBox.js';
import { ChaoxingClient } from '../lib/chaoxingClient.js';
import {
  fetchAndCacheForUser,
  getBinding,
  markFetchError,
  notifyUserIfNeeded,
  publicBinding,
  runChaoxingCron,
} from '../lib/chaoxingJob.js';
import { pushChaoxingAlert } from '../lib/chaoxingPush.js';

const router = Router();

function requireMember(req, res) {
  if (req.user?.is_guest) {
    res.status(403).json({ error: '访客请先注册登录' });
    return false;
  }
  return true;
}

function boolFrom(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  return v === true || v === 1 || v === '1' || v === 'true';
}

/** GET /api/chaoxing/binding */
router.get('/binding', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  const row = await getBinding(req.user.id);
  res.json({ binding: publicBinding(row) });
});

/** POST /api/chaoxing/binding  绑定/更新学习通账号 */
router.post('/binding', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || username.length > 80) {
    return res.status(400).json({ error: '请填写学习通账号（手机号/学号）' });
  }
  if (!password || password.length > 80) {
    return res.status(400).json({ error: '请填写学习通密码' });
  }

  try {
    const client = new ChaoxingClient({ username, password, delayMs: 200 });
    await client.login();
  } catch (e) {
    return res.status(400).json({ error: e.message || '学习通登录失败' });
  }

  const enc = sealSecret(password);
  const notifyEnabled = boolFrom(req.body?.notify_enabled, true);
  const hours = Math.min(168, Math.max(1, Number(req.body?.notify_hours_before) || 48));
  const courseLimit = Math.min(30, Math.max(1, Number(req.body?.course_limit) || 12));
  const bark = String(req.body?.push_bark_url || '').trim().slice(0, 300);
  const webhook = String(req.body?.push_webhook_url || '').trim().slice(0, 500);

  if (isPostgres()) {
    await execute(
      `INSERT INTO chaoxing_bindings (
         user_id, cx_username, cx_password_enc, notify_enabled, notify_hours_before,
         course_limit, push_bark_url, push_webhook_url, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         cx_username = EXCLUDED.cx_username,
         cx_password_enc = EXCLUDED.cx_password_enc,
         notify_enabled = EXCLUDED.notify_enabled,
         notify_hours_before = EXCLUDED.notify_hours_before,
         course_limit = EXCLUDED.course_limit,
         push_bark_url = EXCLUDED.push_bark_url,
         push_webhook_url = EXCLUDED.push_webhook_url,
         last_error = NULL,
         updated_at = NOW()`,
      [
        req.user.id,
        username,
        enc,
        notifyEnabled,
        hours,
        courseLimit,
        bark || null,
        webhook || null,
      ]
    );
  } else {
    await execute(
      `INSERT INTO chaoxing_bindings (
         user_id, cx_username, cx_password_enc, notify_enabled, notify_hours_before,
         course_limit, push_bark_url, push_webhook_url, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         cx_username = excluded.cx_username,
         cx_password_enc = excluded.cx_password_enc,
         notify_enabled = excluded.notify_enabled,
         notify_hours_before = excluded.notify_hours_before,
         course_limit = excluded.course_limit,
         push_bark_url = excluded.push_bark_url,
         push_webhook_url = excluded.push_webhook_url,
         last_error = NULL,
         updated_at = datetime('now')`,
      [
        req.user.id,
        username,
        enc,
        notifyEnabled ? 1 : 0,
        hours,
        courseLimit,
        bark || null,
        webhook || null,
      ]
    );
  }

  const row = await getBinding(req.user.id);
  res.json({ ok: true, binding: publicBinding(row) });
});

/** PATCH /api/chaoxing/binding  只改提醒设置（可不改密码） */
router.patch('/binding', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  const row = await getBinding(req.user.id);
  if (!row) return res.status(404).json({ error: '尚未绑定学习通' });

  const notifyEnabled =
    req.body?.notify_enabled === undefined
      ? row.notify_enabled
      : boolFrom(req.body.notify_enabled, true);
  const hours =
    req.body?.notify_hours_before === undefined
      ? Number(row.notify_hours_before ?? 48)
      : Math.min(168, Math.max(1, Number(req.body.notify_hours_before) || 48));
  const courseLimit =
    req.body?.course_limit === undefined
      ? Number(row.course_limit ?? 12)
      : Math.min(30, Math.max(1, Number(req.body.course_limit) || 12));
  const bark =
    req.body?.push_bark_url === undefined
      ? row.push_bark_url
      : String(req.body.push_bark_url || '').trim().slice(0, 300);
  const webhook =
    req.body?.push_webhook_url === undefined
      ? row.push_webhook_url
      : String(req.body.push_webhook_url || '').trim().slice(0, 500);

  await execute(
    isPostgres()
      ? `UPDATE chaoxing_bindings SET
           notify_enabled = ?, notify_hours_before = ?, course_limit = ?,
           push_bark_url = ?, push_webhook_url = ?, updated_at = NOW()
         WHERE user_id = ?`
      : `UPDATE chaoxing_bindings SET
           notify_enabled = ?, notify_hours_before = ?, course_limit = ?,
           push_bark_url = ?, push_webhook_url = ?, updated_at = datetime('now')
         WHERE user_id = ?`,
    [
      isPostgres() ? !!notifyEnabled : notifyEnabled ? 1 : 0,
      hours,
      courseLimit,
      bark || null,
      webhook || null,
      req.user.id,
    ]
  );

  res.json({ ok: true, binding: publicBinding(await getBinding(req.user.id)) });
});

/** DELETE /api/chaoxing/binding */
router.delete('/binding', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  await execute(`DELETE FROM chaoxing_notify_log WHERE user_id = ?`, [req.user.id]);
  await execute(`DELETE FROM chaoxing_homework_cache WHERE user_id = ?`, [req.user.id]);
  await execute(`DELETE FROM chaoxing_bindings WHERE user_id = ?`, [req.user.id]);
  res.json({ ok: true });
});

/** GET /api/chaoxing/homework?refresh=1&status=未交 */
router.get('/homework', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  const binding = await getBinding(req.user.id);
  if (!binding) return res.status(404).json({ error: '请先绑定学习通账号' });

  const force = String(req.query.refresh || '') === '1';
  const status = String(req.query.status || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const data = await fetchAndCacheForUser(binding, { force, mode: 'courses' });
    let homeworks = data.homeworks || [];
    if (status.length) {
      const set = new Set(status);
      homeworks = homeworks.filter((h) => set.has(h.status));
    }
    res.json({
      binding: publicBinding(await getBinding(req.user.id)),
      homeworks,
      courses: data.courses || [],
      errors: data.errors || [],
      cached: !!data.cached,
      fetched_at: data.fetched_at,
    });
  } catch (e) {
    await markFetchError(req.user.id, e);
    res.status(502).json({ error: e.message || '拉取作业失败' });
  }
});

/** POST /api/chaoxing/test-push */
router.post('/test-push', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  const binding = await getBinding(req.user.id);
  if (!binding) return res.status(404).json({ error: '请先绑定学习通' });
  const result = await pushChaoxingAlert(binding, {
    title: '学习通推送测试',
    body: '如果你在手机上看到这条，说明站内信/Bark/Webhook 通道正常。',
    link: '/homework',
  });
  res.json({ ok: true, result });
});

/** POST /api/chaoxing/notify-now  立即按规则推送一次（手动） */
router.post('/notify-now', auth, async (req, res) => {
  if (!requireMember(req, res)) return;
  const binding = await getBinding(req.user.id);
  if (!binding) return res.status(404).json({ error: '请先绑定学习通' });
  try {
    const data = await fetchAndCacheForUser(binding, { force: true });
    const result = await notifyUserIfNeeded(
      { ...binding, notify_enabled: true },
      data
    );
    res.json({ ok: true, result, pending: (data.homeworks || []).filter((h) => h.status === '未交').length });
  } catch (e) {
    await markFetchError(req.user.id, e);
    res.status(502).json({ error: e.message || '推送失败' });
  }
});

/**
 * GET|POST /api/chaoxing/cron
 * 定时任务入口。需要 Header: Authorization: Bearer $CRON_SECRET
 * 或 ?secret=
 */
async function cronHandler(req, res) {
  const secret = process.env.CRON_SECRET || '';
  const given =
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    String(req.query.secret || req.body?.secret || '');
  if (!secret || given !== secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const defaultLimit = process.env.VERCEL ? 3 : 40;
    const summary = await runChaoxingCron({
      limit: Number(req.query.limit || defaultLimit),
    });
    res.json({ ok: true, summary });
  } catch (e) {
    console.error('[chaoxing cron]', e);
    res.status(500).json({ error: e.message || 'cron failed' });
  }
}

router.get('/cron', cronHandler);
router.post('/cron', cronHandler);

export default router;

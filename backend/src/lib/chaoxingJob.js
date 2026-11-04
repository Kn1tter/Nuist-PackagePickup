import { execute, queryAll, queryOne, isPostgres } from '../db/index.js';
import { ChaoxingClient } from './chaoxingClient.js';
import { openSecret } from './secretBox.js';
import { buildPendingDigest, hwKey, pushChaoxingAlert } from './chaoxingPush.js';

const CACHE_TTL_MS = 20 * 60 * 1000;
const NOTIFY_DEDUP_HOURS = 20;

function nowSql() {
  return isPostgres() ? 'NOW()' : `datetime('now')`;
}

export function publicBinding(row) {
  if (!row) return null;
  return {
    bound: true,
    cx_username: row.cx_username,
    notify_enabled: !!(row.notify_enabled === true || row.notify_enabled === 1 || row.notify_enabled === 't'),
    notify_hours_before: Number(row.notify_hours_before ?? 48),
    course_limit: Number(row.course_limit ?? 12),
    push_bark_url: row.push_bark_url || '',
    push_webhook_url: row.push_webhook_url || '',
    last_fetch_at: row.last_fetch_at || null,
    last_notify_at: row.last_notify_at || null,
    last_error: row.last_error || null,
  };
}

export async function getBinding(userId) {
  return queryOne(`SELECT * FROM chaoxing_bindings WHERE user_id = ?`, [userId]);
}

export async function saveHomeworkCache(userId, payload) {
  const json = JSON.stringify(payload);
  if (isPostgres()) {
    await execute(
      `INSERT INTO chaoxing_homework_cache (user_id, payload, fetched_at)
       VALUES (?, ?, NOW())
       ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()`,
      [userId, json]
    );
  } else {
    await execute(
      `INSERT INTO chaoxing_homework_cache (user_id, payload, fetched_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, fetched_at = datetime('now')`,
      [userId, json]
    );
  }
}

export async function readHomeworkCache(userId, { maxAgeMs = CACHE_TTL_MS } = {}) {
  const row = await queryOne(`SELECT payload, fetched_at FROM chaoxing_homework_cache WHERE user_id = ?`, [
    userId,
  ]);
  if (!row?.payload) return null;
  const fetched = new Date(row.fetched_at).getTime();
  if (!Number.isFinite(fetched) || Date.now() - fetched > maxAgeMs) return null;
  try {
    return { ...JSON.parse(row.payload), cached: true, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

export async function fetchAndCacheForUser(binding, { force = false, mode = 'courses' } = {}) {
  if (!force) {
    const cached = await readHomeworkCache(binding.user_id);
    if (cached) return cached;
  }

  const password = openSecret(binding.cx_password_enc);
  const client = new ChaoxingClient({
    username: binding.cx_username,
    password,
    delayMs: 400,
  });
  await client.login();
  const result = await client.fetchHomeworks({
    mode,
    activeOnly: true,
    courseLimit: Number(binding.course_limit ?? 12),
  });

  const payload = {
    homeworks: result.homeworks,
    courses: result.courses,
    errors: result.errors,
    fetched_at: new Date().toISOString(),
  };
  await saveHomeworkCache(binding.user_id, payload);
  await execute(
    `UPDATE chaoxing_bindings SET last_fetch_at = ${nowSql()}, last_error = NULL WHERE user_id = ?`,
    [binding.user_id]
  );
  return { ...payload, cached: false };
}

export async function markFetchError(userId, err) {
  await execute(`UPDATE chaoxing_bindings SET last_error = ? WHERE user_id = ?`, [
    String(err?.message || err).slice(0, 500),
    userId,
  ]);
}

async function alreadyNotified(userId, key, kind) {
  const row = await queryOne(
    isPostgres()
      ? `SELECT id FROM chaoxing_notify_log
         WHERE user_id = ? AND homework_key = ? AND kind = ?
           AND created_at > NOW() - INTERVAL '${NOTIFY_DEDUP_HOURS} hours'
         LIMIT 1`
      : `SELECT id FROM chaoxing_notify_log
         WHERE user_id = ? AND homework_key = ? AND kind = ?
           AND created_at > datetime('now', '-${NOTIFY_DEDUP_HOURS} hours')
         LIMIT 1`,
    [userId, key, kind]
  );
  return !!row;
}

async function logNotify(userId, key, kind) {
  await execute(
    `INSERT INTO chaoxing_notify_log (user_id, homework_key, kind) VALUES (?, ?, ?)`,
    [userId, key, kind]
  );
}

export async function notifyUserIfNeeded(binding, data) {
  if (!(binding.notify_enabled === true || binding.notify_enabled === 1 || binding.notify_enabled === 't')) {
    return { skipped: true, reason: 'disabled' };
  }

  const digest = buildPendingDigest(data.homeworks || [], binding.notify_hours_before);
  if (!digest) return { skipped: true, reason: 'no_pending' };

  // digest 级别去重：用合成 key
  const digestKey = `digest:${digest.soonCount}:${digest.pendingCount}:${digest.keys.slice(0, 5).join(',')}`;
  if (await alreadyNotified(binding.user_id, digestKey, 'pending_digest')) {
    return { skipped: true, reason: 'dedup' };
  }

  // 也按单份作业记一份，避免同一作业反复刷
  let fresh = 0;
  for (const k of digest.keys) {
    if (!(await alreadyNotified(binding.user_id, k, 'pending_item'))) {
      fresh += 1;
      await logNotify(binding.user_id, k, 'pending_item');
    }
  }
  if (!fresh && digest.soonCount === 0) {
    return { skipped: true, reason: 'no_fresh' };
  }

  const push = await pushChaoxingAlert(binding, {
    title: digest.title,
    body: digest.body,
    link: '/homework',
  });
  await logNotify(binding.user_id, digestKey, 'pending_digest');
  await execute(`UPDATE chaoxing_bindings SET last_notify_at = ${nowSql()} WHERE user_id = ?`, [
    binding.user_id,
  ]);
  return { skipped: false, push, digest };
}

export async function runChaoxingCron({ limit = 40 } = {}) {
  const rows = await queryAll(
    isPostgres()
      ? `SELECT * FROM chaoxing_bindings
         WHERE notify_enabled = TRUE
         ORDER BY COALESCE(last_notify_at, TIMESTAMP '1970-01-01') ASC
         LIMIT ?`
      : `SELECT * FROM chaoxing_bindings
         WHERE notify_enabled = 1
         ORDER BY COALESCE(last_notify_at, '1970-01-01') ASC
         LIMIT ?`,
    [limit]
  );

  const summary = { users: rows.length, notified: 0, skipped: 0, errors: [] };
  for (const binding of rows) {
    try {
      const data = await fetchAndCacheForUser(binding, { force: true, mode: 'courses' });
      const result = await notifyUserIfNeeded(binding, data);
      if (result.skipped) summary.skipped += 1;
      else summary.notified += 1;
    } catch (e) {
      summary.errors.push({ user_id: binding.user_id, error: String(e.message || e) });
      await markFetchError(binding.user_id, e).catch(() => {});
    }
    // 用户间间隔，降低风控
    await new Promise((r) => setTimeout(r, 1500));
  }
  return summary;
}

export { hwKey };

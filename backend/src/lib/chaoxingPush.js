import { notifyUser } from './notify.js';

/** 站内信 + 可选 Bark / 通用 Webhook（手机推送） */
export async function pushChaoxingAlert(binding, { title, body, link = '/homework' }) {
  const userId = binding.user_id;
  await notifyUser(userId, title, body, link);

  const results = { inbox: true, bark: false, webhook: false, errors: [] };

  const barkRaw = String(binding.push_bark_url || '').trim();
  if (barkRaw) {
    try {
      const { endpoint, deviceKey } = parseBark(barkRaw);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          device_key: deviceKey,
          title,
          body: String(body).slice(0, 1200),
          group: '学习通作业',
          url: absoluteLink(link),
          level: 'timeSensitive',
        }),
      });
      results.bark = res.ok;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        results.errors.push(`Bark HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
      }
    } catch (e) {
      results.errors.push(`Bark: ${e.message || e}`);
    }
  }

  const webhook = String(binding.push_webhook_url || '').trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          link: absoluteLink(link),
          source: 'nuist-chaoxing',
        }),
      });
      results.webhook = res.ok;
      if (!res.ok) results.errors.push(`Webhook HTTP ${res.status}`);
    } catch (e) {
      results.errors.push(`Webhook: ${e.message || e}`);
    }
  }

  return results;
}

/** 兼容用户粘贴：纯 Key / https://api.day.app/Key / 自建域名/Key */
export function parseBark(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('Bark 地址为空');

  // 纯 key（字母数字）
  if (/^[A-Za-z0-9_-]{8,}$/.test(s) && !s.includes('/')) {
    return { endpoint: 'https://api.day.app/push', deviceKey: s };
  }

  let url;
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    throw new Error('Bark 地址格式不对');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  // /push → 需在 query? 不支持，要求 path 带 key
  let deviceKey = parts[0];
  if (!deviceKey || deviceKey === 'push') {
    deviceKey = url.searchParams.get('device_key') || url.searchParams.get('key') || '';
  }
  if (!deviceKey) throw new Error('未能从 Bark URL 解析到 Key');

  const endpoint = `${url.origin}/push`;
  return { endpoint, deviceKey };
}

function absoluteLink(path) {
  const origin = (process.env.FRONTEND_ORIGIN || '').split(',')[0]?.trim();
  if (origin && origin !== '*') {
    try {
      return new URL(path, origin.endsWith('/') ? origin : `${origin}/`).toString();
    } catch {
      /* fallthrough */
    }
  }
  return path;
}

export function buildPendingDigest(homeworks, hoursBefore) {
  const pending = homeworks.filter((h) => h.status === '未交');
  if (!pending.length) return null;

  const now = Date.now();
  const windowMs = Math.max(1, Number(hoursBefore) || 48) * 3600_000;
  const soon = pending.filter((h) => {
    if (!h.deadline || h.expired) return h.expired;
    const t = Date.parse(String(h.deadline).replace(' ', 'T'));
    return Number.isFinite(t) && t - now <= windowMs;
  });

  const focus = soon.length ? soon : pending;
  const lines = focus.slice(0, 8).map((h) => {
    const when = h.expired ? '已过期' : h.deadline || h.remaining || '截止未知';
    return `· [${h.courseName}] ${h.title}（${when}）`;
  });
  if (focus.length > 8) lines.push(`· …另有 ${focus.length - 8} 项`);

  const title = soon.length
    ? `学习通：${soon.length} 项作业临近截止`
    : `学习通：还有 ${pending.length} 项未交作业`;
  const body = lines.join('\n');
  return { title, body, pendingCount: pending.length, soonCount: soon.length, keys: focus.map(hwKey) };
}

export function hwKey(hw) {
  return `${hw.courseId || ''}|${hw.workId || ''}|${hw.title}|${hw.courseName}`;
}

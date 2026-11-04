/**
 * 轻量在线人数：HTTP 鉴权请求 + 各游戏 WS 登录都会刷新。
 * 超过 TTL 无活动视为离线。
 */

const TTL_MS = 3 * 60 * 1000;
/** @type {Map<number, { at: number, nickname?: string, student_id?: string, via: string }>} */
const online = new Map();

export function touchPresence(user, via = 'http') {
  if (!user?.id || user.id < 0 || user.is_guest) return;
  const id = Number(user.id);
  if (!Number.isFinite(id) || id <= 0) return;
  const prev = online.get(id);
  online.set(id, {
    at: Date.now(),
    nickname: user.nickname || prev?.nickname || '',
    student_id: user.student_id || prev?.student_id || '',
    via: via || prev?.via || 'http',
  });
}

export function leavePresence(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) return;
  online.delete(id);
}

function prune() {
  const t = Date.now();
  for (const [id, row] of online) {
    if (t - row.at > TTL_MS) online.delete(id);
  }
}

export function getOnlineStats() {
  prune();
  const list = [...online.entries()]
    .map(([userId, row]) => ({
      userId,
      nickname: row.nickname || '同学',
      student_id: row.student_id || '',
      via: row.via,
      idleSec: Math.max(0, Math.round((Date.now() - row.at) / 1000)),
    }))
    .sort((a, b) => a.idleSec - b.idleSec);
  return {
    online: list.length,
    ttlSec: Math.round(TTL_MS / 1000),
    users: list.slice(0, 100),
  };
}

setInterval(prune, 60 * 1000).unref?.();

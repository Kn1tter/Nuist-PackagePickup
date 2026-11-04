import { execute, queryAll, queryOne, isPostgres } from '../db/index.js';

const GAMES = new Set(['pool', 'skull', 'tank', 'dino', 'curling']);
const MATCH_GAMES = new Set(['pool', 'skull', 'tank', 'curling']);

export function normalizeGame(game) {
  const g = String(game || '').toLowerCase();
  return GAMES.has(g) ? g : null;
}

async function ensureRow(userId, game) {
  const row = await queryOne(
    `SELECT user_id FROM arcade_stats WHERE user_id = ? AND game = ?`,
    [userId, game]
  );
  if (row) return;
  await execute(
    `INSERT INTO arcade_stats (user_id, game, wins, losses, flees) VALUES (?, ?, 0, 0, 0)`,
    [userId, game]
  );
}

async function bump(userId, game, field) {
  if (!userId || !normalizeGame(game)) return;
  if (!['wins', 'losses', 'flees'].includes(field)) return;
  await ensureRow(userId, game);
  await execute(
    `UPDATE arcade_stats SET ${field} = ${field} + 1, updated_at = ${
      isPostgres() ? 'NOW()' : `datetime('now')`
    } WHERE user_id = ? AND game = ?`,
    [userId, game]
  );
}

/**
 * 记录一局结果。fleers 记逃跑，不重复记负；其余非胜者记负。
 */
export async function recordDinoScore(userId, score) {
  const n = Math.round(Number(score));
  if (!userId || !Number.isFinite(n) || n <= 0 || n > 99999) return null;
  await ensureRow(userId, 'dino');
  await execute(
    `UPDATE arcade_stats
     SET best_score = CASE WHEN COALESCE(best_score, 0) < ? THEN ? ELSE COALESCE(best_score, 0) END,
         updated_at = ${isPostgres() ? 'NOW()' : `datetime('now')`}
     WHERE user_id = ? AND game = 'dino'`,
    [n, n, userId]
  );
  const row = await queryOne(
    `SELECT best_score FROM arcade_stats WHERE user_id = ? AND game = 'dino'`,
    [userId]
  );
  return Number(row?.best_score) || n;
}

export async function recordArcadeResult({ game, winnerIds = [], loserIds = [], fleerIds = [] }) {
  const g = normalizeGame(game);
  if (!MATCH_GAMES.has(g)) return;

  const winners = new Set((winnerIds || []).map(Number).filter(Boolean));
  const fleers = new Set((fleerIds || []).map(Number).filter(Boolean));
  const losers = new Set((loserIds || []).map(Number).filter(Boolean));

  for (const id of winners) {
    if (fleers.has(id)) continue;
    await bump(id, g, 'wins');
  }
  for (const id of fleers) {
    await bump(id, g, 'flees');
  }
  for (const id of losers) {
    if (winners.has(id) || fleers.has(id)) continue;
    await bump(id, g, 'losses');
  }
}

export async function getLeaderboard({ game = null, limit = 20 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const g = normalizeGame(game);

  if (g === 'dino') {
    const rows = await queryAll(
      `SELECT s.user_id, s.game, s.wins, s.losses, s.flees, s.best_score,
              u.nickname, u.student_id, u.signature
       FROM arcade_stats s
       JOIN users u ON u.id = s.user_id
       WHERE s.game = 'dino' AND COALESCE(s.best_score, 0) > 0
       ORDER BY s.best_score DESC, s.updated_at ASC, s.user_id ASC
       LIMIT ?`,
      [lim]
    );
    return rows.map(mapRow);
  }

  if (g) {
    const rows = await queryAll(
      `SELECT s.user_id, s.game, s.wins, s.losses, s.flees, s.best_score,
              u.nickname, u.student_id, u.signature
       FROM arcade_stats s
       JOIN users u ON u.id = s.user_id
       WHERE s.game = ?
       ORDER BY s.wins DESC, s.losses ASC, s.flees ASC, s.user_id ASC
       LIMIT ?`,
      [g, lim]
    );
    return rows.map(mapRow);
  }

  const rows = await queryAll(
    `SELECT s.user_id,
            SUM(s.wins) AS wins,
            SUM(s.losses) AS losses,
            SUM(s.flees) AS flees,
            0 AS best_score,
            u.nickname, u.student_id, u.signature
     FROM arcade_stats s
     JOIN users u ON u.id = s.user_id
     WHERE s.game <> 'dino'
     GROUP BY s.user_id, u.nickname, u.student_id, u.signature
     ORDER BY SUM(s.wins) DESC, SUM(s.losses) ASC, SUM(s.flees) ASC, s.user_id ASC
     LIMIT ?`,
    [lim]
  );

  return rows.map((r) => mapRow({ ...r, game: 'all' }));
}

export async function getUserStats(userId) {
  const rows = await queryAll(
    `SELECT game, wins, losses, flees, best_score FROM arcade_stats WHERE user_id = ?`,
    [userId]
  );
  const byGame = {
    pool: zeros(),
    skull: zeros(),
    tank: zeros(),
    curling: zeros(),
    dino: { best_score: 0 },
  };
  for (const r of rows) {
    if (r.game === 'dino') {
      byGame.dino = { best_score: Number(r.best_score) || 0 };
      continue;
    }
    if (byGame[r.game]) {
      byGame[r.game] = {
        wins: Number(r.wins) || 0,
        losses: Number(r.losses) || 0,
        flees: Number(r.flees) || 0,
      };
    }
  }
  return {
    pool: byGame.pool,
    skull: byGame.skull,
    tank: byGame.tank,
    curling: byGame.curling,
    dino: byGame.dino,
    all: {
      wins: byGame.pool.wins + byGame.skull.wins + byGame.tank.wins + byGame.curling.wins,
      losses:
        byGame.pool.losses + byGame.skull.losses + byGame.tank.losses + byGame.curling.losses,
      flees: byGame.pool.flees + byGame.skull.flees + byGame.tank.flees + byGame.curling.flees,
    },
  };
}

function zeros() {
  return { wins: 0, losses: 0, flees: 0 };
}

function mapRow(r) {
  return {
    user_id: r.user_id,
    game: r.game || 'all',
    nickname: r.nickname || '同学',
    student_id: r.student_id,
    signature: r.signature || '',
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
    flees: Number(r.flees) || 0,
    best_score: Number(r.best_score) || 0,
  };
}

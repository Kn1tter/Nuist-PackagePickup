import { Router } from 'express';
import { queryOne, execute } from '../db/index.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { getLeaderboard, getUserStats, normalizeGame, recordDinoScore } from '../lib/arcadeStats.js';

const router = Router();

const SIG_MAX = 40;

/** GET /api/arcade/leaderboard?game=pool|skull|tank|curling|dino|all&limit=20 */
router.get('/leaderboard', optionalAuth, async (req, res) => {
  try {
    const raw = String(req.query.game || 'all').toLowerCase();
    const game = raw === 'all' || !raw ? null : normalizeGame(raw);
    if (raw && raw !== 'all' && !game) {
      return res.status(400).json({ error: 'game 仅支持 pool / skull / tank / curling / dino / all' });
    }
    const board = await getLeaderboard({ game, limit: req.query.limit });
    res.json({ game: game || 'all', leaderboard: board });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载排行榜失败' });
  }
});

/** GET /api/arcade/me/stats */
router.get('/me/stats', auth, async (req, res) => {
  try {
    if (req.user?.is_guest) {
      return res.json({
        stats: {
          all: { wins: 0, losses: 0, flees: 0 },
          pool: { wins: 0, losses: 0, flees: 0 },
          skull: { wins: 0, losses: 0, flees: 0 },
          tank: { wins: 0, losses: 0, flees: 0 },
          curling: { wins: 0, losses: 0, flees: 0 },
          dino: { best_score: 0 },
        },
        user: {
          id: req.user.id,
          nickname: '访客',
          student_id: 'guest',
          signature: '',
        },
      });
    }
    const stats = await getUserStats(req.user.id);
    const me = await queryOne(
      `SELECT id, nickname, student_id, signature FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.json({
      stats,
      user: {
        id: me?.id,
        nickname: me?.nickname,
        student_id: me?.student_id,
        signature: me?.signature || '',
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载战绩失败' });
  }
});

/** POST /api/arcade/dino/score  body: { score } 只保留更高分 */
router.post('/dino/score', auth, async (req, res) => {
  try {
    const best = await recordDinoScore(req.user.id, req.body?.score);
    if (best == null) return res.status(400).json({ error: '分数无效' });
    res.json({ ok: true, best });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '保存分数失败' });
  }
});

/** PATCH /api/arcade/me/signature  body: { signature } */
router.patch('/me/signature', auth, async (req, res) => {
  try {
    const signature = String(req.body?.signature ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, SIG_MAX);
    await execute(`UPDATE users SET signature = ? WHERE id = ?`, [signature, req.user.id]);
    const me = await queryOne(
      `SELECT id, nickname, student_id, signature FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.json({
      ok: true,
      user: {
        id: me.id,
        nickname: me.nickname,
        student_id: me.student_id,
        signature: me.signature || '',
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '保存签名失败' });
  }
});

export default router;

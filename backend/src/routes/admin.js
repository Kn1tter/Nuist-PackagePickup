import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { queryAll, queryOne, execute } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';
import { deleteUserById } from '../lib/deleteUser.js';
import { rateLimit } from '../lib/rateLimit.js';
import { getOnlineStats } from '../lib/presence.js';
import { stats as poolStats } from '../lib/poolRooms.js';
import { stats as skullStats } from '../lib/skullRooms.js';
import { stats as tankStats } from '../lib/tankRooms.js';
import { stats as dinoStats } from '../lib/dinoRooms.js';
import { stats as curlingStats } from '../lib/curlingRooms.js';

const router = Router();

const adminWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: '操作过于频繁，请稍后再试',
});

async function requireAdmin(req, res) {
  const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!isAdminUser(me)) {
    res.status(403).json({ error: '仅管理员可操作' });
    return null;
  }
  return me;
}

function publicAdminUser(row) {
  return {
    id: row.id,
    student_id: row.student_id,
    nickname: row.nickname,
    credit_score: row.credit_score,
    is_admin: isAdminUser(row),
    created_at: row.created_at,
  };
}

/** 支持数字 id 或学号 */
async function findTargetUser(idOrStudentId) {
  const raw = String(idOrStudentId || '').trim();
  if (!raw) return null;
  // 学号通常 8–12 位，优先按学号查，避免与自增 id 混淆
  if (/^\d{8,12}$/.test(raw)) {
    const bySid = await queryOne('SELECT * FROM users WHERE student_id = ?', [raw]);
    if (bySid) return bySid;
  }
  if (/^\d+$/.test(raw)) {
    const byId = await queryOne('SELECT * FROM users WHERE id = ?', [Number(raw)]);
    if (byId) return byId;
  }
  return queryOne('SELECT * FROM users WHERE student_id = ?', [raw]);
}

/** GET /api/admin/server — 在线人数与房间概况 */
router.get('/server', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const mem = process.memoryUsage();
    const online = getOnlineStats();
    res.json({
      online: online.online,
      onlineUsers: online.users,
      onlineTtlSec: online.ttlSec,
      uptimeSec: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      arcade: {
        pool: poolStats(),
        skull: skullStats(),
        tank: tankStats(),
        dino: dinoStats(),
        curling: curlingStats(),
      },
      time: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载服务器状态失败' });
  }
});

/** GET /api/admin/users?q=&limit= */
router.get('/users', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    let rows;
    if (q) {
      const like = `%${q}%`;
      rows = await queryAll(
        `SELECT id, student_id, nickname, credit_score, is_admin, created_at
         FROM users
         WHERE student_id LIKE ? OR nickname LIKE ? OR CAST(id AS TEXT) = ?
         ORDER BY id DESC
         LIMIT ?`,
        [like, like, q, limit]
      );
    } else {
      rows = await queryAll(
        `SELECT id, student_id, nickname, credit_score, is_admin, created_at
         FROM users
         ORDER BY id DESC
         LIMIT ?`,
        [limit]
      );
    }

    res.json({ users: rows.map(publicAdminUser) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载用户失败' });
  }
});

/** GET /api/admin/users/:idOrStudentId */
router.get('/users/:idOrStudentId', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const user = await findTargetUser(req.params.idOrStudentId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user: publicAdminUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '查询失败' });
  }
});

/**
 * POST /api/admin/users/:idOrStudentId/reset-password
 * body: { password: "新密码" }
 */
router.post('/users/:idOrStudentId/reset-password', auth, adminWriteLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const user = await findTargetUser(req.params.idOrStudentId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const password = String(req.body?.password || '');
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }
    if (password.length > 72) {
      return res.status(400).json({ error: '密码过长' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [password_hash, user.id]);

    res.json({
      ok: true,
      user: publicAdminUser(user),
      message: `已重置 ${user.student_id} 的密码`,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '重置密码失败' });
  }
});

/**
 * DELETE /api/admin/users/:idOrStudentId
 * 会清理论坛/订单/消息等关联数据
 */
router.delete('/users/:idOrStudentId', auth, adminWriteLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;

    const user = await findTargetUser(req.params.idOrStudentId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    if (Number(user.id) === Number(me.id)) {
      return res.status(400).json({ error: '不能删除自己的账号' });
    }
    if (isAdminUser(user)) {
      return res.status(400).json({ error: '不能删除管理员账号' });
    }

    const deleted = await deleteUserById(user.id);
    res.json({ ok: true, deleted, message: `已删除用户 ${deleted.student_id}` });
  } catch (e) {
    console.error(e);
    const status = e.status || 500;
    res.status(status).json({ error: e.message || '删除用户失败' });
  }
});

export default router;

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { execute, insert, isPostgres, queryOne } from '../db/index.js';
import { isAdminUser, promoteIfAdminStudent, syncAdmins } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';
import { getJwtSecret } from '../lib/jwt.js';
import { rateLimit } from '../lib/rateLimit.js';
import { publicXp } from '../lib/xp.js';
import { guestPublicUser, guestTokenPayload, isGuestPayload } from '../lib/guest.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: '登录/注册过于频繁，请 15 分钟后再试',
});

function signToken(user, extra = {}) {
  return jwt.sign(
    { id: user.id, student_id: user.student_id, ...extra },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
}

/** 按上海自然日判断是否还能改昵称 */
function shanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function canChangeNicknameToday(nicknameChangedAt) {
  if (!nicknameChangedAt) return true;
  const last = new Date(nicknameChangedAt);
  if (Number.isNaN(last.getTime())) return true;
  return shanghaiDayKey(last) !== shanghaiDayKey();
}

function publicUser(row) {
  if (row?.is_guest || isGuestPayload(row)) {
    return guestPublicUser();
  }
  const xpInfo = publicXp(row);
  return {
    id: row.id,
    student_id: row.student_id,
    phone: row.phone || '',
    email: row.email || '',
    nickname: row.nickname,
    signature: row.signature || '',
    credit_score: row.credit_score,
    xp: xpInfo.xp,
    level: xpInfo.level,
    xp_into_level: xpInfo.current,
    xp_to_next: xpInfo.need,
    xp_progress: xpInfo.progress,
    is_admin: isAdminUser(row),
    is_guest: false,
    created_at: row.created_at,
    nickname_changed_at: row.nickname_changed_at || null,
    can_change_nickname: canChangeNicknameToday(row.nickname_changed_at),
  };
}

function isValidStudentId(id) {
  return /^\d{8,12}$/.test(String(id || '').trim());
}

function isValidPhone(phone) {
  return /^1\d{10}$/.test(String(phone || '').trim());
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { student_id, password, nickname, signature, phone } = req.body || {};
    if (!isValidStudentId(student_id)) {
      return res.status(400).json({ error: '学号格式不正确（请填写 8–12 位数字）' });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ error: '请填写正确的手机号（11 位，1 开头）' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    const phoneNorm = String(phone).trim();
    const sig = String(signature ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);

    const exists = await queryOne('SELECT id FROM users WHERE student_id = ?', [student_id]);
    if (exists) {
      return res.status(409).json({ error: '该学号已注册' });
    }

    const password_hash = bcrypt.hashSync(String(password), 10);
    const info = await insert(
      `INSERT INTO users (student_id, phone, password_hash, nickname, signature)
       VALUES (?, ?, ?, ?, ?)`,
      [student_id, phoneNorm, password_hash, nickname || `同学${String(student_id).slice(-4)}`, sig]
    );

    const user = await queryOne('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid]);
    await promoteIfAdminStudent(user.student_id);
    await syncAdmins();
    const fresh = await queryOne('SELECT * FROM users WHERE id = ?', [user.id]);
    res.status(201).json({ token: signToken(fresh), user: publicUser(fresh) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '注册失败' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { student_id, password } = req.body || {};
    const user = await queryOne('SELECT * FROM users WHERE student_id = ?', [student_id]);
    if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
      return res.status(401).json({ error: '学号或密码错误' });
    }
    await promoteIfAdminStudent(user.student_id);
    await syncAdmins();
    const fresh = await queryOne('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ token: signToken(fresh), user: publicUser(fresh) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '登录失败' });
  }
});

/** 访客登录：可浏览，不可发帖/发单等写操作 */
router.post('/guest', authLimiter, (_req, res) => {
  const user = guestPublicUser();
  const token = signToken(guestTokenPayload(), { is_guest: true });
  res.json({ token, user });
});

router.get('/me', auth, async (req, res) => {
  try {
    if (req.user?.is_guest) {
      return res.json({ user: guestPublicUser() });
    }
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '获取用户失败' });
  }
});

/** PATCH /api/auth/me/nickname  body: { nickname } — 每天最多改一次（上海时区自然日） */
router.patch('/me/nickname', auth, async (req, res) => {
  try {
    if (req.user?.is_guest) {
      return res.status(403).json({ error: '访客不能修改昵称' });
    }
    const nickname = String(req.body?.nickname ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20);
    if (!nickname) {
      return res.status(400).json({ error: '昵称不能为空' });
    }
    if (nickname.length < 2) {
      return res.status(400).json({ error: '昵称至少 2 个字' });
    }

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!me) return res.status(404).json({ error: '用户不存在' });
    if (String(me.nickname || '') === nickname) {
      return res.json({ user: publicUser(me) });
    }
    if (!canChangeNicknameToday(me.nickname_changed_at)) {
      return res.status(429).json({ error: '每天只能修改一次昵称，请明天再试' });
    }

    if (isPostgres()) {
      await execute(`UPDATE users SET nickname = ?, nickname_changed_at = NOW() WHERE id = ?`, [
        nickname,
        req.user.id,
      ]);
    } else {
      await execute(
        `UPDATE users SET nickname = ?, nickname_changed_at = datetime('now') WHERE id = ?`,
        [nickname, req.user.id]
      );
    }

    const fresh = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: publicUser(fresh) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '修改昵称失败' });
  }
});

export default router;

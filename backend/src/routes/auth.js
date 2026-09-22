import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { insert, queryOne } from '../db/index.js';
import { isAdminUser, promoteIfAdminStudent, syncAdmins } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';
import { getJwtSecret } from '../lib/jwt.js';
import { rateLimit } from '../lib/rateLimit.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: '登录/注册过于频繁，请 15 分钟后再试',
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, student_id: user.student_id },
    getJwtSecret(),
    { expiresIn: '7d' }
  );
}

function publicUser(row) {
  return {
    id: row.id,
    student_id: row.student_id,
    phone: row.phone,
    nickname: row.nickname,
    credit_score: row.credit_score,
    is_admin: isAdminUser(row),
    created_at: row.created_at,
  };
}

function isValidStudentId(id) {
  return /^\d{8,12}$/.test(String(id || '').trim());
}

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { student_id, phone, password, nickname } = req.body || {};
    if (!isValidStudentId(student_id)) {
      return res.status(400).json({ error: '学号格式不正确（请填写 8–12 位数字）' });
    }
    if (!/^1\d{10}$/.test(String(phone || ''))) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    const exists = await queryOne('SELECT id FROM users WHERE student_id = ?', [student_id]);
    if (exists) {
      return res.status(409).json({ error: '该学号已注册' });
    }

    const password_hash = bcrypt.hashSync(String(password), 10);
    const info = await insert(
      `INSERT INTO users (student_id, phone, password_hash, nickname)
       VALUES (?, ?, ?, ?)`,
      [student_id, phone, password_hash, nickname || `同学${String(student_id).slice(-4)}`]
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

router.get('/me', auth, async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '获取用户失败' });
  }
});

export default router;

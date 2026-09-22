import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/jwt.js';

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = { id: payload.id, student_id: payload.student_id };
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      req.user = { id: payload.id, student_id: payload.student_id };
    } catch {
      /* ignore */
    }
  }
  next();
}

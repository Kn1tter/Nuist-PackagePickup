import jwt from 'jsonwebtoken';
import { getJwtSecret, jwtAuthErrorMessage } from '../lib/jwt.js';
import { isGuestPayload } from '../lib/guest.js';
import { touchPresence } from '../lib/presence.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function attachUser(req, payload) {
  req.user = {
    id: payload.id,
    student_id: payload.student_id,
    nickname: payload.nickname,
    is_guest: isGuestPayload(payload),
  };
}

export function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    attachUser(req, payload);
    if (req.user.is_guest && WRITE_METHODS.has(String(req.method || '').toUpperCase())) {
      return res.status(403).json({ error: '访客仅可浏览，注册登录后即可发帖、发单等' });
    }
    touchPresence(req.user, 'http');
    next();
  } catch (err) {
    return res.status(401).json({ error: jwtAuthErrorMessage(err) });
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret());
      attachUser(req, payload);
      if (!req.user.is_guest) touchPresence(req.user, 'http');
    } catch {
      /* ignore */
    }
  }
  next();
}

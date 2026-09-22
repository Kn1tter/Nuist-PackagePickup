/** Simple in-memory IP rate limiter (per serverless instance; still raises attack cost). */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 30, message = '请求过于频繁，请稍后再试' } = {}) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key = String(
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
    );
    const now = Date.now();
    let bucket = hits.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      hits.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: message });
    }
    // opportunistic cleanup
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (now - v.start >= windowMs) hits.delete(k);
      }
    }
    next();
  };
}

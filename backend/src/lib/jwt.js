/** JWT signing secret — never fall back to dev-secret when deployed. */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const deployed = Boolean(process.env.VERCEL || process.env.DATABASE_URL);
  if (deployed) {
    if (!secret || secret === 'dev-secret' || String(secret).length < 16) {
      throw new Error(
        'JWT_SECRET must be a strong random string (16+ chars) when DATABASE_URL/VERCEL is set'
      );
    }
    return secret;
  }
  return secret || 'dev-secret';
}

/** jwt.verify 失败时的可读提示（过期 / 无效不要混成一句） */
export function jwtAuthErrorMessage(err) {
  if (err?.name === 'TokenExpiredError') {
    return '登录已过期，请重新登录';
  }
  if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
    return '登录状态无效，请重新登录';
  }
  return '登录校验失败，请重新登录';
}

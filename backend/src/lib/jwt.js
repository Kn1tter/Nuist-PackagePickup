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

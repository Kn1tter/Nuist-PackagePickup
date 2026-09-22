/** Mask student id for public feeds (own profile / admin views keep full id). */
export function publicStudentId(sid) {
  const s = String(sid || '');
  if (!s) return '';
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

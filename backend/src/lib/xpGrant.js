import { execute, queryOne } from '../db/index.js';
import { levelFromXp } from './xp.js';

export async function addUserXp(userId, amount) {
  const delta = Math.floor(Number(amount) || 0);
  if (!userId || !delta) return null;
  await execute(`UPDATE users SET xp = CASE WHEN xp + ? < 0 THEN 0 ELSE xp + ? END WHERE id = ?`, [
    delta,
    delta,
    userId,
  ]);
  const row = await queryOne(`SELECT id, xp FROM users WHERE id = ?`, [userId]);
  return row ? levelFromXp(row.xp) : null;
}

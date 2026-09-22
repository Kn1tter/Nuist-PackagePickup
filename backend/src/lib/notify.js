import { insert } from '../db/index.js';

export async function notifyUser(userId, title, body, link = null) {
  if (!userId) return;
  await insert(`INSERT INTO messages (user_id, title, body, link) VALUES (?, ?, ?, ?)`, [
    userId,
    String(title).slice(0, 120),
    String(body).slice(0, 2000),
    link,
  ]);
}

import { execute, queryAll, queryOne } from '../db/index.js';

/**
 * 按依赖顺序清理用户关联数据后删除账号。
 * 多数 FK 无 ON DELETE CASCADE，直接 DELETE users 会失败。
 */
export async function deleteUserById(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('无效用户 id');
  }

  const user = await queryOne('SELECT id, student_id, nickname, is_admin FROM users WHERE id = ?', [
    id,
  ]);
  if (!user) {
    const err = new Error('用户不存在');
    err.status = 404;
    throw err;
  }

  const orderRows = await queryAll(`SELECT id FROM orders WHERE user_id = ?`, [id]);
  const orderIds = orderRows.map((r) => r.id);

  if (orderIds.length) {
    const placeholders = orderIds.map(() => '?').join(',');
    await execute(`DELETE FROM reviews WHERE order_id IN (${placeholders})`, orderIds);
  }

  await execute(`DELETE FROM reviews WHERE from_user_id = ? OR to_user_id = ?`, [id, id]);
  await execute(`DELETE FROM orders WHERE user_id = ?`, [id]);
  await execute(`UPDATE orders SET courier_id = NULL WHERE courier_id = ?`, [id]);

  await execute(`DELETE FROM forum_post_likes WHERE user_id = ?`, [id]);
  await execute(
    `DELETE FROM forum_post_likes WHERE post_id IN (SELECT id FROM forum_posts WHERE user_id = ?)`,
    [id]
  );
  await execute(`DELETE FROM forum_replies WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM forum_posts WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM changelogs WHERE user_id = ?`, [id]);

  await execute(`DELETE FROM resource_comments WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM resources WHERE user_id = ?`, [id]);

  await execute(`DELETE FROM feedbacks WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM messages WHERE user_id = ?`, [id]);

  await execute(`DELETE FROM game_chat_messages WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM game_invites WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM game_group_members WHERE user_id = ?`, [id]);

  const createdGroups = await queryAll(`SELECT id FROM game_groups WHERE creator_id = ?`, [id]);
  for (const g of createdGroups) {
    await execute(`DELETE FROM game_chat_messages WHERE group_id = ?`, [g.id]);
    await execute(`DELETE FROM game_invites WHERE group_id = ?`, [g.id]);
    await execute(`DELETE FROM game_group_members WHERE group_id = ?`, [g.id]);
    await execute(`DELETE FROM game_groups WHERE id = ?`, [g.id]);
  }

  await execute(`DELETE FROM schedule_courses WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM schedule_settings WHERE user_id = ?`, [id]);
  await execute(`DELETE FROM arcade_stats WHERE user_id = ?`, [id]);

  await execute(`DELETE FROM users WHERE id = ?`, [id]);

  return {
    id: user.id,
    student_id: user.student_id,
    nickname: user.nickname,
  };
}

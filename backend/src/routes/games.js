import { Router } from 'express';
import { insert, queryAll, queryOne, execute } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth } from '../middleware/auth.js';

const router = Router();

async function isMember(groupId, userId) {
  return Boolean(
    await queryOne(`SELECT 1 AS ok FROM game_group_members WHERE group_id = ? AND user_id = ?`, [
      groupId,
      userId,
    ])
  );
}

/** 游戏组列表 */
router.get('/groups', auth, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT g.*,
              u.nickname AS creator_name,
              (SELECT COUNT(*) FROM game_group_members m WHERE m.group_id = g.id) AS member_count,
              (SELECT COUNT(*) FROM game_invites i WHERE i.group_id = g.id AND i.status = 'open') AS open_invites
       FROM game_groups g
       JOIN users u ON u.id = g.creator_id
       ORDER BY g.created_at DESC
       LIMIT 100`
    );
    const mine = await queryAll(`SELECT group_id FROM game_group_members WHERE user_id = ?`, [
      req.user.id,
    ]);
    const joined = new Set(mine.map((m) => Number(m.group_id)));
    res.json({
      groups: rows.map((g) => ({
        ...g,
        member_count: Number(g.member_count || 0),
        open_invites: Number(g.open_invites || 0),
        joined: joined.has(Number(g.id)),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载游戏组失败' });
  }
});

/** 新建游戏组（创建者自动加入） */
router.post('/groups', auth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (name.length < 1 || name.length > 60) {
      return res.status(400).json({ error: '游戏名请控制在 1–60 字' });
    }
    if (description.length > 500) {
      return res.status(400).json({ error: '简介请控制在 500 字内' });
    }
    const exists = await queryOne(`SELECT id FROM game_groups WHERE name = ?`, [name]);
    if (exists) return res.status(409).json({ error: '该游戏组已存在' });

    const info = await insert(
      `INSERT INTO game_groups (name, description, creator_id) VALUES (?, ?, ?)`,
      [name, description, req.user.id]
    );
    await insert(`INSERT INTO game_group_members (group_id, user_id) VALUES (?, ?)`, [
      info.lastInsertRowid,
      req.user.id,
    ]);
    const group = await queryOne(`SELECT * FROM game_groups WHERE id = ?`, [info.lastInsertRowid]);
    res.status(201).json({ group });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '创建失败' });
  }
});

/** 组详情 + 成员 + 邀请 */
router.get('/groups/:id', auth, async (req, res) => {
  try {
    const group = await queryOne(
      `SELECT g.*, u.nickname AS creator_name
       FROM game_groups g
       JOIN users u ON u.id = g.creator_id
       WHERE g.id = ?`,
      [req.params.id]
    );
    if (!group) return res.status(404).json({ error: '游戏组不存在' });

    const members = await queryAll(
      `SELECT m.user_id, m.joined_at, u.nickname, u.student_id
       FROM game_group_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY m.joined_at ASC`,
      [req.params.id]
    );
    const invites = await queryAll(
      `SELECT i.*, u.nickname
       FROM game_invites i
       JOIN users u ON u.id = i.user_id
       WHERE i.group_id = ?
       ORDER BY i.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );

    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const joined = await isMember(req.params.id, req.user.id);
    const canManage = isAdminUser(me) || Number(group.creator_id) === Number(req.user.id);

    res.json({
      group: { ...group, joined, can_manage: canManage },
      members,
      invites: invites.map((i) => ({
        ...i,
        can_delete: canManage || Number(i.user_id) === Number(req.user.id) || isAdminUser(me),
      })),
      viewer: { is_admin: isAdminUser(me), joined },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载失败' });
  }
});

router.post('/groups/:id/join', auth, async (req, res) => {
  try {
    const group = await queryOne(`SELECT id FROM game_groups WHERE id = ?`, [req.params.id]);
    if (!group) return res.status(404).json({ error: '游戏组不存在' });
    if (await isMember(req.params.id, req.user.id)) {
      return res.json({ ok: true, joined: true });
    }
    await insert(`INSERT INTO game_group_members (group_id, user_id) VALUES (?, ?)`, [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true, joined: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加入失败' });
  }
});

router.post('/groups/:id/leave', auth, async (req, res) => {
  try {
    const group = await queryOne(`SELECT * FROM game_groups WHERE id = ?`, [req.params.id]);
    if (!group) return res.status(404).json({ error: '游戏组不存在' });
    if (Number(group.creator_id) === Number(req.user.id)) {
      return res.status(400).json({ error: '创建者不能退出，可删除该组' });
    }
    await execute(`DELETE FROM game_group_members WHERE group_id = ? AND user_id = ?`, [
      req.params.id,
      req.user.id,
    ]);
    res.json({ ok: true, joined: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '退出失败' });
  }
});

router.delete('/groups/:id', auth, async (req, res) => {
  try {
    const group = await queryOne(`SELECT * FROM game_groups WHERE id = ?`, [req.params.id]);
    if (!group) return res.status(404).json({ error: '游戏组不存在' });
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!isAdminUser(me) && Number(group.creator_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: '无权删除' });
    }
    await execute(`DELETE FROM game_invites WHERE group_id = ?`, [req.params.id]);
    await execute(`DELETE FROM game_group_members WHERE group_id = ?`, [req.params.id]);
    await execute(`DELETE FROM game_groups WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

/** 组内发开黑邀请（需已加入） */
router.post('/groups/:id/invites', auth, async (req, res) => {
  try {
    const group = await queryOne(`SELECT id FROM game_groups WHERE id = ?`, [req.params.id]);
    if (!group) return res.status(404).json({ error: '游戏组不存在' });
    if (!(await isMember(req.params.id, req.user.id))) {
      return res.status(403).json({ error: '请先加入该游戏组再发邀请' });
    }

    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const contact = String(req.body?.contact || '').trim();
    if (title.length < 2 || title.length > 120) {
      return res.status(400).json({ error: '标题请控制在 2–120 字' });
    }
    if (body.length < 2 || body.length > 1000) {
      return res.status(400).json({ error: '内容请控制在 2–1000 字' });
    }
    if (contact.length > 80) {
      return res.status(400).json({ error: '联系方式请控制在 80 字内' });
    }

    const info = await insert(
      `INSERT INTO game_invites (group_id, user_id, title, body, contact) VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, title, body, contact || null]
    );
    const invite = await queryOne(`SELECT * FROM game_invites WHERE id = ?`, [info.lastInsertRowid]);
    res.status(201).json({ invite });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发布失败' });
  }
});

router.post('/invites/:id/close', auth, async (req, res) => {
  try {
    const invite = await queryOne(`SELECT * FROM game_invites WHERE id = ?`, [req.params.id]);
    if (!invite) return res.status(404).json({ error: '邀请不存在' });
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const group = await queryOne(`SELECT * FROM game_groups WHERE id = ?`, [invite.group_id]);
    const ok =
      isAdminUser(me) ||
      Number(invite.user_id) === Number(req.user.id) ||
      Number(group?.creator_id) === Number(req.user.id);
    if (!ok) return res.status(403).json({ error: '无权操作' });
    await execute(`UPDATE game_invites SET status = 'closed' WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '操作失败' });
  }
});

router.delete('/invites/:id', auth, async (req, res) => {
  try {
    const invite = await queryOne(`SELECT * FROM game_invites WHERE id = ?`, [req.params.id]);
    if (!invite) return res.status(404).json({ error: '邀请不存在' });
    const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const group = await queryOne(`SELECT * FROM game_groups WHERE id = ?`, [invite.group_id]);
    const ok =
      isAdminUser(me) ||
      Number(invite.user_id) === Number(req.user.id) ||
      Number(group?.creator_id) === Number(req.user.id);
    if (!ok) return res.status(403).json({ error: '无权删除' });
    await execute(`DELETE FROM game_invites WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

export default router;

import { Router } from 'express';
import { execute, insert, queryAll, queryOne } from '../db/index.js';
import { isAdminUser } from '../db/migrate.js';
import { auth, optionalAuth } from '../middleware/auth.js';
import { notifyUser } from '../lib/notify.js';
import { EXPRESS_COMPANIES } from '../lib/pickupDict.js';

const router = Router();

const JOIN_ADMIN_QQ = '1440205803';

async function requireAdmin(req, res) {
  const me = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!isAdminUser(me)) {
    res.status(403).json({ error: '仅管理员可操作' });
    return null;
  }
  return me;
}

const VALID_SIZES = new Set(['small', 'medium', 'large']);
const EXPRESS_SET = new Set(EXPRESS_COMPANIES);
const STATUS_FLOW = {
  pending: ['accepted', 'cancelled'],
  accepted: ['picked', 'cancelled'],
  picked: ['delivered'],
  delivered: ['done'],
  done: [],
  cancelled: [],
};

function maskPickupCode(code) {
  const s = String(code || '');
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}****${s.slice(-2)}`;
}

function maskTracking(no) {
  const s = String(no || '');
  if (s.length <= 6) return '****';
  return `${s.slice(0, 3)}****${s.slice(-3)}`;
}

function sameId(a, b) {
  return a != null && b != null && Number(a) === Number(b);
}

function shapeOrder(row, viewerId, { revealCode = false } = {}) {
  const isCourier = sameId(row.courier_id, viewerId);
  const isOwner = sameId(row.user_id, viewerId);
  const courierMayReveal = isCourier && ['accepted', 'picked', 'delivered', 'done'].includes(row.status);
  const canSeeFullCode = isOwner || (revealCode && courierMayReveal);

  return {
    id: row.id,
    user_id: row.user_id,
    courier_id: row.courier_id,
    phone_last4: row.phone_last4,
    dorm_building: row.dorm_building,
    express_company: row.express_company,
    package_size: row.package_size,
    reward: Number(row.reward),
    remark: row.remark || '',
    tracking_no: canSeeFullCode
      ? row.tracking_no || ''
      : row.tracking_no
        ? maskTracking(row.tracking_no)
        : '',
    status: row.status,
    paid_offline: !!row.paid_offline,
    pickup_photo_url: row.pickup_photo_url,
    delivery_photo_url: row.delivery_photo_url,
    created_at: row.created_at,
    accepted_at: row.accepted_at,
    picked_at: row.picked_at,
    delivered_at: row.delivered_at,
    pickup_code: canSeeFullCode
      ? row.pickup_code
      : isCourier
        ? maskPickupCode(row.pickup_code)
        : null,
    can_reveal_code: courierMayReveal,
    role: isOwner ? 'owner' : isCourier ? 'courier' : 'other',
  };
}

/** 发单选项（快递公司仍用字典；宿舍楼为自由填写） */
router.get('/options', optionalAuth, (_req, res) => {
  res.json({
    express_companies: EXPRESS_COMPANIES,
    package_sizes: [
      { value: 'small', label: '小件（文件/鞋盒以内）' },
      { value: 'medium', label: '中件（日常包裹）' },
      { value: 'large', label: '大件（需双手/较重）' },
    ],
  });
});

/** 官方派送专员列表（公开） */
router.get('/specialists', optionalAuth, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT id, nickname, qq, note, created_at FROM courier_specialists ORDER BY id ASC`
    );
    let is_admin = false;
    if (req.user?.id) {
      const me = await queryOne('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
      is_admin = isAdminUser(me);
    }
    res.json({
      specialists: rows,
      is_admin,
      join_admin_qq: JOIN_ADMIN_QQ,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载专员失败' });
  }
});

/** 管理员添加官方派送专员 */
router.post('/specialists', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const nickname = String(req.body?.nickname || '').trim().slice(0, 40);
    const qq = String(req.body?.qq || '').replace(/\D/g, '').slice(0, 20);
    const note = String(req.body?.note || '').trim().slice(0, 80);
    if (!nickname) return res.status(400).json({ error: '请填写昵称' });
    if (!/^\d{5,12}$/.test(qq)) return res.status(400).json({ error: 'QQ 号格式不正确' });
    const dup = await queryOne(`SELECT id FROM courier_specialists WHERE qq = ?`, [qq]);
    if (dup) return res.status(409).json({ error: '该 QQ 已在专员列表中' });
    const info = await insert(
      `INSERT INTO courier_specialists (nickname, qq, note) VALUES (?, ?, ?)`,
      [nickname, qq, note]
    );
    const row = await queryOne(`SELECT * FROM courier_specialists WHERE id = ?`, [
      info.lastInsertRowid,
    ]);
    res.status(201).json({ specialist: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '添加失败' });
  }
});

/** 管理员删除官方派送专员 */
router.delete('/specialists/:id', auth, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '无效 id' });
    await execute(`DELETE FROM courier_specialists WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status = 'pending', mine } = req.query;
    const viewerId = req.user?.id ?? null;
    if ((mine === 'posted' || mine === 'accepted') && !viewerId) {
      return res.status(401).json({ error: '未登录' });
    }
    let rows;
    if (mine === 'posted') {
      rows = await queryAll('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [viewerId]);
    } else if (mine === 'accepted') {
      rows = await queryAll('SELECT * FROM orders WHERE courier_id = ? ORDER BY id DESC', [
        viewerId,
      ]);
    } else {
      rows = await queryAll(
        'SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 100',
        [status]
      );
    }
    res.json({ orders: rows.map((r) => shapeOrder(r, viewerId)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '获取订单失败' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const {
      pickup_code,
      phone_last4,
      dorm_building,
      express_company,
      package_size = 'small',
      reward,
      remark,
      tracking_no,
    } = req.body || {};

    const code = String(pickup_code || '').trim();
    const dorm = String(dorm_building || '').trim();
    const company = String(express_company || '').trim();
    const track = String(tracking_no || '').trim();
    const note = String(remark || '').trim();

    if (!code || code.length > 50) {
      return res.status(400).json({ error: '取件码必填，且不超过 50 字' });
    }
    if (!dorm || dorm.length > 40) {
      return res.status(400).json({ error: '请填写宿舍楼（不超过 40 字）' });
    }
    if (!EXPRESS_SET.has(company)) {
      return res.status(400).json({ error: '请从列表选择快递公司' });
    }
    if (!/^\d{8,30}$/.test(track)) {
      return res.status(400).json({ error: '快递单号须为 8–30 位数字' });
    }
    if (!/^\d{4}$/.test(String(phone_last4 || ''))) {
      return res.status(400).json({ error: '请填写手机号后 4 位数字' });
    }
    if (!VALID_SIZES.has(package_size)) {
      return res.status(400).json({ error: '包裹尺寸无效' });
    }
    if (note.length > 200) {
      return res.status(400).json({ error: '备注请控制在 200 字内' });
    }
    const rewardNum = Number(reward);
    if (!Number.isFinite(rewardNum) || rewardNum < 1 || rewardNum > 99) {
      return res.status(400).json({ error: '报酬请填写 1–99 元' });
    }

    const info = await insert(
      `INSERT INTO orders
        (user_id, pickup_code, phone_last4, dorm_building, express_company, package_size, reward, remark, tracking_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        code,
        phone_last4,
        dorm,
        company,
        package_size,
        rewardNum,
        note || null,
        track,
      ]
    );

    const row = await queryOne('SELECT * FROM orders WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({ order: shapeOrder(row, req.user.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发单失败' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '订单不存在' });

    const viewerId = req.user?.id ?? null;
    const isCourier = sameId(row.courier_id, viewerId);
    const isOwner = sameId(row.user_id, viewerId);
    if (!isCourier && !isOwner && row.status !== 'pending') {
      return res.status(403).json({ error: '无权查看该订单' });
    }

    const reveal = req.query.reveal === '1';
    if (reveal && !isCourier && !isOwner) {
      return res.status(403).json({ error: '无权查看完整取件码' });
    }

    res.json({ order: shapeOrder(row, viewerId, { revealCode: reveal || isOwner }) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '获取详情失败' });
  }
});

router.post('/:id/accept', auth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '订单不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '订单已被接或已取消' });
    if (sameId(row.user_id, req.user.id)) {
      return res.status(400).json({ error: '不能接自己的单' });
    }

    const now = new Date().toISOString();
    const result = await execute(
      `UPDATE orders
       SET courier_id = ?, status = 'accepted', accepted_at = ?
       WHERE id = ? AND status = 'pending'`,
      [req.user.id, now, row.id]
    );

    if (!result.changes) {
      return res.status(409).json({ error: '手慢了，订单刚被别人接走' });
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = ?', [row.id]);
    await notifyUser(
      row.user_id,
      '有人接单了',
      `你的代拿单 #${row.id}（${row.dorm_building}）已被接单，骑手会去取件。`,
      `/orders/${row.id}`
    );
    res.json({ order: shapeOrder(updated, req.user.id, { revealCode: true }) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '接单失败' });
  }
});

router.post('/:id/status', auth, async (req, res) => {
  try {
    const { status, paid_offline } = req.body || {};
    const row = await queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '订单不存在' });

    const allowed = STATUS_FLOW[row.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `当前状态 ${row.status} 不能变为 ${status}` });
    }

    const isCourier = sameId(row.courier_id, req.user.id);
    const isOwner = sameId(row.user_id, req.user.id);

    if (status === 'cancelled') {
      if (!isOwner && !isCourier) return res.status(403).json({ error: '无权取消' });
    } else if (['picked', 'delivered'].includes(status)) {
      if (!isCourier) return res.status(403).json({ error: '只有接单人可更新此状态' });
    } else if (status === 'done') {
      if (!isOwner) return res.status(403).json({ error: '只有发单人可确认完成' });
    }

    const now = new Date().toISOString();
    const fields = ['status = ?'];
    const params = [status];
    if (status === 'picked') {
      fields.push('picked_at = ?');
      params.push(now);
    }
    if (status === 'delivered') {
      fields.push('delivered_at = ?');
      params.push(now);
    }
    if (status === 'done' && paid_offline) {
      fields.push('paid_offline = ?');
      params.push(true);
    }
    params.push(row.id);
    await execute(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, params);

    if (status === 'cancelled') {
      const targetId = isCourier ? row.courier_id : row.user_id;
      if (targetId) {
        await execute(
          'UPDATE users SET credit_score = CASE WHEN credit_score - 5 < 0 THEN 0 ELSE credit_score - 5 END WHERE id = ?',
          [targetId]
        );
      }
      const otherId = isOwner ? row.courier_id : row.user_id;
      await notifyUser(
        otherId,
        '订单已取消',
        `代拿单 #${row.id}（${row.dorm_building}）已被取消。`,
        `/orders/${row.id}`
      );
    }
    if (status === 'picked') {
      await notifyUser(
        row.user_id,
        '包裹已取件',
        `代拿单 #${row.id} 骑手已取件，正送往 ${row.dorm_building}。`,
        `/orders/${row.id}`
      );
    }
    if (status === 'delivered') {
      await notifyUser(
        row.user_id,
        '包裹已送达',
        `代拿单 #${row.id} 已送达，请确认收货并线下结算。`,
        `/orders/${row.id}`
      );
    }
    if (status === 'done' && row.courier_id) {
      await execute(
        'UPDATE users SET credit_score = CASE WHEN credit_score + 1 > 100 THEN 100 ELSE credit_score + 1 END WHERE id = ?',
        [row.courier_id]
      );
      await notifyUser(
        row.courier_id,
        '订单已完成',
        `代拿单 #${row.id} 发单人已确认收货${paid_offline ? '（线下已付）' : ''}。`,
        `/orders/${row.id}`
      );
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = ?', [row.id]);
    res.json({ order: shapeOrder(updated, req.user.id, { revealCode: isOwner || isCourier }) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '更新状态失败' });
  }
});

export default router;

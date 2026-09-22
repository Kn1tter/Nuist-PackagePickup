import { Router } from 'express';
import { execute, insert, queryAll, queryOne } from '../db/index.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const VALID_SIZES = new Set(['small', 'medium', 'large']);
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

function sameId(a, b) {
  return a != null && b != null && Number(a) === Number(b);
}

function shapeOrder(row, viewerId, { revealCode = false } = {}) {
  const isCourier = sameId(row.courier_id, viewerId);
  const isOwner = sameId(row.user_id, viewerId);
  const canSeeFullCode =
    revealCode && isCourier && ['accepted', 'picked', 'delivered', 'done'].includes(row.status);

  return {
    id: row.id,
    user_id: row.user_id,
    courier_id: row.courier_id,
    phone_last4: row.phone_last4,
    dorm_building: row.dorm_building,
    express_company: row.express_company,
    package_size: row.package_size,
    reward: Number(row.reward),
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
      : isOwner || isCourier
        ? maskPickupCode(row.pickup_code)
        : null,
    can_reveal_code: isCourier && ['accepted', 'picked', 'delivered', 'done'].includes(row.status),
    role: isOwner ? 'owner' : isCourier ? 'courier' : 'other',
  };
}

router.get('/', auth, async (req, res) => {
  try {
    const { status = 'pending', mine } = req.query;
    let rows;
    if (mine === 'posted') {
      rows = await queryAll('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
    } else if (mine === 'accepted') {
      rows = await queryAll('SELECT * FROM orders WHERE courier_id = ? ORDER BY id DESC', [
        req.user.id,
      ]);
    } else {
      rows = await queryAll(
        'SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 100',
        [status]
      );
    }
    res.json({ orders: rows.map((r) => shapeOrder(r, req.user.id)) });
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
    } = req.body || {};

    if (!pickup_code || !dorm_building) {
      return res.status(400).json({ error: '取件码和宿舍楼必填' });
    }
    if (!/^\d{4}$/.test(String(phone_last4 || ''))) {
      return res.status(400).json({ error: '请填写手机号后 4 位' });
    }
    if (!VALID_SIZES.has(package_size)) {
      return res.status(400).json({ error: '包裹尺寸无效' });
    }
    const rewardNum = Number(reward);
    if (!Number.isFinite(rewardNum) || rewardNum < 1 || rewardNum > 99) {
      return res.status(400).json({ error: '报酬请填写 1–99 元' });
    }

    const info = await insert(
      `INSERT INTO orders
        (user_id, pickup_code, phone_last4, dorm_building, express_company, package_size, reward)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        String(pickup_code).trim(),
        phone_last4,
        String(dorm_building).trim(),
        express_company || null,
        package_size,
        rewardNum,
      ]
    );

    const row = await queryOne('SELECT * FROM orders WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json({ order: shapeOrder(row, req.user.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '发单失败' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '订单不存在' });

    const isCourier = sameId(row.courier_id, req.user.id);
    const isOwner = sameId(row.user_id, req.user.id);
    if (!isCourier && !isOwner && row.status !== 'pending') {
      return res.status(403).json({ error: '无权查看该订单' });
    }

    const reveal = req.query.reveal === '1';
    if (reveal && !isCourier) {
      return res.status(403).json({ error: '只有接单人可查看完整取件码' });
    }

    res.json({ order: shapeOrder(row, req.user.id, { revealCode: reveal }) });
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
    await execute(
      `UPDATE orders
       SET courier_id = ?, status = 'accepted', accepted_at = ?
       WHERE id = ? AND status = 'pending'`,
      [req.user.id, now, row.id]
    );

    const updated = await queryOne('SELECT * FROM orders WHERE id = ?', [row.id]);
    res.json({ order: shapeOrder(updated, req.user.id) });
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
    }
    if (status === 'done' && row.courier_id) {
      await execute(
        'UPDATE users SET credit_score = CASE WHEN credit_score + 1 > 100 THEN 100 ELSE credit_score + 1 END WHERE id = ?',
        [row.courier_id]
      );
    }

    const updated = await queryOne('SELECT * FROM orders WHERE id = ?', [row.id]);
    res.json({ order: shapeOrder(updated, req.user.id) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '更新状态失败' });
  }
});

export default router;

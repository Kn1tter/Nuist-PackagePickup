import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { auth } from '../middleware/auth.js';
import { execute, queryOne } from '../db/index.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../uploads');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 1.5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error('仅支持 JPG / PNG / WebP 图片'));
    }
    cb(null, true);
  },
});

function extFor(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

async function persistPhoto(buffer, mime, orderId, kind) {
  const name = `${orderId}-${kind}-${Date.now()}${extFor(mime)}`;
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'order-photos';

  if (supabaseUrl && serviceKey) {
    const objectPath = `orders/${name}`;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`对象存储上传失败: ${res.status} ${text.slice(0, 120)}`);
    }
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
  }

  // Local / non-Vercel: write disk
  if (!process.env.VERCEL) {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, name), buffer);
    return `/uploads/${name}`;
  }

  // Vercel without Supabase Storage: keep data URL in DB (small images only)
  if (buffer.length > MAX_BYTES) {
    throw new Error('图片过大');
  }
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

router.post('/order-photo', auth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) {
        const msg = err.message || '上传失败';
        const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
        return res.status(status).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? '图片请小于 1.5MB' : msg,
        });
      }
      const { order_id, kind } = req.body || {};
      if (!req.file) return res.status(400).json({ error: '未收到图片' });
      if (!['pickup', 'delivery'].includes(kind)) {
        return res.status(400).json({ error: 'kind 必须是 pickup 或 delivery' });
      }

      const row = await queryOne('SELECT * FROM orders WHERE id = ?', [order_id]);
      if (!row) return res.status(404).json({ error: '订单不存在' });
      if (Number(row.courier_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: '只有接单人可上传凭证照片' });
      }
      if (kind === 'pickup' && !['accepted', 'picked', 'delivered', 'done'].includes(row.status)) {
        return res.status(400).json({ error: '当前状态不能上传取件凭证' });
      }
      if (kind === 'delivery' && !['picked', 'delivered', 'done'].includes(row.status)) {
        return res.status(400).json({ error: '请先标记已取件再上传送达凭证' });
      }

      const url = await persistPhoto(req.file.buffer, req.file.mimetype, row.id, kind);
      const col = kind === 'pickup' ? 'pickup_photo_url' : 'delivery_photo_url';
      await execute(`UPDATE orders SET ${col} = ? WHERE id = ?`, [url, row.id]);

      res.json({ url });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message || '上传失败' });
    }
  });
});

export default router;

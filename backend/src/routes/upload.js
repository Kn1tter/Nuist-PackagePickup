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
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/order-photo', auth, upload.single('file'), async (req, res) => {
  try {
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

    const url = `/uploads/${req.file.filename}`;
    const col = kind === 'pickup' ? 'pickup_photo_url' : 'delivery_photo_url';
    await execute(`UPDATE orders SET ${col} = ? WHERE id = ?`, [url, row.id]);

    res.json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '上传失败' });
  }
});

export default router;

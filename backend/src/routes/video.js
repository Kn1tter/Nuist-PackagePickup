import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import {
  extractFirstUrl,
  getTicket,
  prepareDownload,
  publicTicket,
  streamTicketItem,
} from '../lib/videoDownload.js';

const router = Router();

const createLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: '下载请求过于频繁，请稍后再试',
});

function clientKey(req) {
  return String(
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown'
  );
}

function ownerId(req) {
  if (req.user?.id != null) return `u:${req.user.id}`;
  return `anon:${clientKey(req)}`;
}

/** 解析链接，返回短时下载票（不落盘） */
router.post('/prepare', optionalAuth, createLimit, async (req, res) => {
  try {
    const raw = String(req.body?.url || req.body?.text || '').trim();
    const url = extractFirstUrl(raw) || raw;
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: '请粘贴有效的视频分享链接' });
    }
    const ticket = await prepareDownload({ userId: ownerId(req), url });
    res.status(201).json({ ticket: publicTicket(ticket) });
  } catch (err) {
    res.status(400).json({ error: err.message || '解析失败' });
  }
});

/**
 * 浏览器直下：Content-Disposition attachment → 进用户下载文件夹。
 * 用 ticket id 作短时密钥（无需 Authorization，才能触发浏览器原生下载）。
 * 内容流式转发，服务器不保留文件。
 */
router.get('/stream/:id/:index', async (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: '下载已过期，请重新解析' });
  }
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ error: '无效的文件序号' });
  }
  try {
    await streamTicketItem(ticket, index, res);
  } catch (err) {
    if (res.headersSent) {
      try {
        res.destroy(err);
      } catch {
        /* ignore */
      }
      return;
    }
    res.status(502).json({ error: err.message || '下载失败' });
  }
});

export default router;

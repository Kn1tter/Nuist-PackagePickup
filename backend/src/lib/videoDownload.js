import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import {
  classifyPanUrl,
  nameFromDirectUrl,
  panRequestHeaders,
  panShareMessage,
} from './panDirect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE =
  process.env.VIDEO_COOKIE_FILE ||
  path.join(__dirname, '../../data/video-cookies.txt');
const OLD_CACHE = path.join(__dirname, '../../uploads/video-cache');

const MAX_BYTES = Number(process.env.VIDEO_MAX_BYTES) || 1024 * 1024 * 1024; // 1GB，浏览器本机下载
const TICKET_TTL_MS = 5 * 60 * 1000;
const URL_RE = /https?:\/\/[^\s"'<>[\]]+/g;

const VIDEO_HOST_RE =
  /b23\.tv|bilibili\.com|acg\.tv|douyin\.com|iesdouyin\.com|v\.douyin\.com|kuaishou\.com|v\.qq\.com|youtube\.com|youtu\.be|xiaohongshu\.com|xhslink\.com/i;

/** @type {Map<string, object>} */
const tickets = new Map();

// 清理旧版落盘缓存（不再保留服务器文件）
try {
  fs.rmSync(OLD_CACHE, { recursive: true, force: true });
} catch {
  /* ignore */
}

export function extractFirstUrl(text = '') {
  const urls = String(text).match(URL_RE) || [];
  return rankUrls(urls)[0] || '';
}

function rankUrls(urls) {
  const video = [];
  const others = [];
  for (const u of urls) {
    if (/\.(jpg|jpeg|png|gif|webp|ico)(\?|$)/i.test(u)) continue;
    if (VIDEO_HOST_RE.test(u)) video.push(u);
    else others.push(u);
  }
  return [...video, ...others];
}

function prefersParseApi(url) {
  return VIDEO_HOST_RE.test(url);
}

function safeFilename(name, fallback = 'video.mp4') {
  const raw = String(name || fallback)
    .replace(/[<>:"/\\|?*#%\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = (raw || fallback).slice(0, 80);
  if (/\.[a-z0-9]{1,8}$/i.test(cleaned)) return cleaned;
  const ext = /\.[a-z0-9]{1,8}$/i.exec(fallback)?.[0] || '';
  return `${cleaned}${ext}`;
}

export function getTicket(id) {
  const t = tickets.get(id);
  if (!t) return null;
  if (Date.now() - t.createdAt > TICKET_TTL_MS) {
    tickets.delete(id);
    return null;
  }
  return t;
}

/**
 * 只解析、不落盘；返回短时 ticket，供浏览器直下。
 */
export async function prepareDownload({ userId, url }) {
  let items = [];
  let title = '视频';
  let type = 'video';

  const pan = classifyPanUrl(url);
  if (pan.type === 'pan-share' || pan.type === 'pan-page') {
    throw new Error(panShareMessage(pan.name || '网盘'));
  }
  if (pan.type === 'pan-direct') {
    const filename = safeFilename(nameFromDirectUrl(url), 'download.bin');
    title = filename;
    type = 'file';
    items = [
      {
        kind: 'file',
        source: url,
        filename,
        headers: panRequestHeaders(pan.kind),
      },
    ];
    const id = crypto.randomBytes(8).toString('hex');
    const ticket = { id, userId, url, title, type, items, createdAt: Date.now() };
    tickets.set(id, ticket);
    return ticket;
  }

  if (prefersParseApi(url)) {
    try {
      const data = await parseShareUrl(url);
      title = data.title || title;
      if (data.type === 'image') {
        type = 'image';
        const images = data.images || [];
        if (!images.length) throw new Error('图文里没有图片');
        items = images.map((src, i) => ({
          kind: 'image',
          source: src,
          referer: url,
          filename: safeFilename(`${title}_${i + 1}.jpg`, `img_${i + 1}.jpg`),
        }));
      } else {
        const direct = data.url || '';
        if (!direct) throw new Error('解析结果里没有视频直链');
        items = [
          {
            kind: 'video',
            source: direct,
            referer: url,
            filename: safeFilename(`${title}.mp4`, 'video.mp4'),
          },
        ];
      }
    } catch (parseErr) {
      items = [
        {
          kind: 'video',
          source: null,
          ytUrl: url,
          filename: 'video.mp4',
          parseError: parseErr.message,
        },
      ];
    }
  } else {
    items = [
      {
        kind: 'video',
        source: null,
        ytUrl: url,
        filename: 'video.mp4',
      },
    ];
  }

  const id = crypto.randomBytes(8).toString('hex');
  const ticket = {
    id,
    userId,
    url,
    title,
    type,
    items,
    createdAt: Date.now(),
  };
  tickets.set(id, ticket);
  return ticket;
}

export function publicTicket(ticket) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    title: ticket.title,
    type: ticket.type,
    url: ticket.url,
    files: ticket.items.map((it, index) => ({
      index,
      name: it.filename,
      kind: it.kind,
      downloadUrl: `/api/video/stream/${ticket.id}/${index}`,
    })),
    expiresInSec: Math.floor(TICKET_TTL_MS / 1000),
  };
}

async function parseShareUrl(url) {
  const api = `https://openapi.dwo.cc/api/svparse?url=${encodeURIComponent(url)}`;
  const res = await fetch(api, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 429) throw new Error('解析接口繁忙（请求过于频繁），请稍后再试');
  if (!res.ok) throw new Error(`解析失败：HTTP ${res.status}`);
  const data = await res.json();
  if (data.code === 429) throw new Error('解析接口繁忙（请求过于频繁），请稍后再试');
  if (data.code !== 200) throw new Error(`解析失败：${data.msg || '未知错误'}`);
  const d = data.data || {};
  if (!d || typeof d !== 'object') throw new Error('解析结果为空');
  return d;
}

function upstreamHeaders(referer = '') {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  if (referer) headers.Referer = referer;
  return headers;
}

function setAttachmentHeaders(res, filename, contentType, contentLength) {
  const ascii = String(filename)
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 60) || 'video.mp4';
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  if (contentLength != null) res.setHeader('Content-Length', String(contentLength));
}

/**
 * 把内容流式写给浏览器（attachment），不在服务器保留文件。
 * 注意：成功拿到上游后再设 Content-Disposition，避免错误 JSON 被当成附件导致 Chrome「没有文件」。
 */
export async function streamTicketItem(ticket, index, res) {
  const item = ticket.items[index];
  if (!item) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }

  const filename = item.filename || 'video.mp4';

  if (item.source) {
    const headers = { ...upstreamHeaders(item.referer || ticket.url), ...(item.headers || {}) };
    if (/bilivideo\.com|bilibili\.com/i.test(item.source)) {
      headers.Referer = 'https://www.bilibili.com';
    } else if (/douyin|ixigua|byteicdn|zjcdn|snssdk/i.test(item.source + (item.referer || ''))) {
      headers.Referer = 'https://www.douyin.com/';
    }
    const upstream = await fetch(item.source, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(300000),
    });
    if (!upstream.ok) {
      throw new Error(`直链下载失败：HTTP ${upstream.status}`);
    }
    const len = upstream.headers.get('content-length');
    if (len && Number(len) > MAX_BYTES) {
      throw new Error(`文件超过 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 限制`);
    }
    const ctype =
      upstream.headers.get('content-type') ||
      (item.kind === 'image' ? 'image/jpeg' : 'video/mp4');
    if (!upstream.body) throw new Error('上游无内容');

    setAttachmentHeaders(res, filename, ctype, len || undefined);
    await pipeline(Readable.fromWeb(upstream.body), res);
    return;
  }

  // yt-dlp：临时目录下载 → 立刻流给浏览器 → 删除
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuist-vid-'));
  try {
    const filepath = await ytDlpToTemp(item.ytUrl || ticket.url, tmpDir);
    const size = fs.statSync(filepath).size;
    if (size > MAX_BYTES) {
      throw new Error(`文件超过 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 限制`);
    }
    const ext = path.extname(filepath).toLowerCase();
    const types = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    setAttachmentHeaders(res, filename, types[ext] || 'application/octet-stream', size);
    await pipeline(fs.createReadStream(filepath), res);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function ytDlpToTemp(url, dir) {
  return new Promise((resolve, reject) => {
    const outtmpl = path.join(dir, '%(id)s.%(ext)s');
    const args = [
      '-f',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format',
      'mp4',
      '-o',
      outtmpl,
      '--restrict-filenames',
      '--no-playlist',
      '--no-warnings',
      '--retries',
      '3',
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      url,
    ];
    if (fs.existsSync(COOKIE_FILE)) {
      args.unshift('--cookies', COOKIE_FILE);
    }
    const bin = process.env.YT_DLP_BIN || 'yt-dlp';
    const child = spawn(bin, args, {
      env: { ...process.env, http_proxy: '', https_proxy: '', HTTP_PROXY: '', HTTPS_PROXY: '' },
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') reject(new Error('服务器未安装 yt-dlp，请联系管理员'));
      else reject(err);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const msg = stderr.trim().split('\n').pop() || `yt-dlp 退出码 ${code}`;
        reject(new Error(msg.slice(0, 300)));
        return;
      }
      try {
        const files = fs.readdirSync(dir).filter((n) => !n.startsWith('.'));
        if (!files.length) {
          reject(new Error('下载完成但未找到文件'));
          return;
        }
        resolve(path.join(dir, files[0]));
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function cleanupExpiredTickets() {
  const now = Date.now();
  for (const [id, t] of tickets) {
    if (now - t.createdAt >= TICKET_TTL_MS) tickets.delete(id);
  }
}

setInterval(cleanupExpiredTickets, 60 * 1000).unref?.();

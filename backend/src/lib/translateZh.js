/**
 * 轻量英→中自动汉化（历史上的今天等）
 * MyMemory 免费接口 + 内存/磁盘缓存，避免重复翻译。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '../../data/translate-cache.json');
const MAX_CACHE = 4000;

/** @type {Map<string, string>} */
const mem = new Map();
let loaded = false;
let saveTimer = null;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && v.trim()) mem.set(k, v);
      }
    }
  } catch {
    /* first run or missing file */
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      const obj = {};
      let i = 0;
      for (const [k, v] of mem) {
        obj[k] = v;
        if (++i >= MAX_CACHE) break;
      }
      fs.writeFileSync(CACHE_PATH, JSON.stringify(obj));
    } catch (e) {
      console.warn('[translateZh] cache save failed:', e.message || e);
    }
  }, 800);
  saveTimer.unref?.();
}

function hashKey(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 24);
}

/** 拉丁字母明显多于汉字 → 需要汉化 */
export function needsZhTranslate(text) {
  const s = String(text || '');
  if (!s.trim()) return false;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin >= 12 && latin > cjk * 2;
}

async function translateOnce(text) {
  const q = String(text).slice(0, 480);
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(q) +
    '&langpair=en|zh-CN';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'nuist-packagepickup/1.0 (translate)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const out = String(json?.responseData?.translatedText || '').trim();
    if (!out || /MYMEMORY WARNING/i.test(out)) throw new Error('empty/quota');
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 翻译单条；失败则返回原文。
 * @returns {Promise<{ text: string, translated: boolean, original?: string }>}
 */
export async function toZh(text) {
  const raw = String(text || '').trim();
  if (!raw) return { text: '', translated: false };
  if (!needsZhTranslate(raw)) return { text: raw, translated: false };

  ensureLoaded();
  const key = hashKey(raw);
  if (mem.has(key)) {
    return { text: mem.get(key), translated: true, original: raw };
  }

  try {
    const zh = await translateOnce(raw);
    // 若结果仍几乎全是英文，视为失败
    if (needsZhTranslate(zh)) return { text: raw, translated: false };
    mem.set(key, zh);
    scheduleSave();
    return { text: zh, translated: true, original: raw };
  } catch (e) {
    console.warn('[translateZh] failed:', e.message || e);
    return { text: raw, translated: false };
  }
}

/** 顺序翻译列表（限速，避免打爆免费配额） */
export async function translateEventTexts(events, { concurrency = 2 } = {}) {
  ensureLoaded();
  const list = Array.isArray(events) ? events : [];
  const out = new Array(list.length);
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const i = idx++;
      const ev = list[i] || {};
      const raw = String(ev.text || '').trim();
      const tr = await toZh(raw);
      out[i] = {
        year: ev.year ?? null,
        text: tr.text,
        ...(ev._bucket ? { _bucket: ev._bucket } : {}),
        ...(tr.translated && tr.original ? { text_en: tr.original } : {}),
      };
      // 轻微间隔，降低限流概率
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  const n = Math.max(1, Math.min(concurrency, list.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * 历史上的今天 + 今日节日（北京时间，按日缓存自动换新）
 * 国内源偏旧 + muffinlabs/byabbe 近年源；英文条目经 translateZh 自动汉化。
 */
import { Solar } from 'lunar-javascript';
import { translateEventTexts } from './translateZh.js';

const TZ = 'Asia/Shanghai';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const FULL_LIMIT = 40;
const PREVIEW_NEWEST = 3;
const PREVIEW_OLDEST = 3;
const RECENT_YEAR = 2001;

/** @type {{ key: string, data: object, at: number } | null} */
let cache = null;

function shanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  return {
    year,
    month,
    day,
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function weekdayLabel(year, month, day) {
  const d = new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+08:00`
  );
  return `星期${WEEKDAYS[d.getUTCDay()]}`;
}

/** 倒计时只盯这些常见节日（库里杂项纪念日太多） */
const MAJOR_FESTIVALS = new Set([
  '元旦节',
  '元旦',
  '春节',
  '除夕',
  '元宵节',
  '情人节',
  '妇女节',
  '植树节',
  '清明',
  '清明节',
  '劳动节',
  '青年节',
  '母亲节',
  '儿童节',
  '端午节',
  '父亲节',
  '建党节',
  '建军节',
  '七夕节',
  '七夕',
  '中元节',
  '教师节',
  '国庆节',
  '中秋节',
  '重阳节',
  '万圣节前夜',
  '万圣节',
  '光棍节',
  '感恩节',
  '平安夜',
  '圣诞节',
  '腊八节',
  '小年',
  '冬至',
]);

function dayFestivals(solar) {
  const lunar = solar.getLunar();
  const names = [
    ...solar.getFestivals(),
    ...solar.getOtherFestivals(),
    ...lunar.getFestivals(),
    ...lunar.getOtherFestivals(),
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const jieQi = String(lunar.getJieQi?.() || '').trim();
  if (jieQi && (jieQi === '清明' || jieQi === '冬至' || jieQi.endsWith('节'))) {
    if (!names.includes(jieQi) && !names.includes(`${jieQi}节`)) names.unshift(jieQi);
  }

  const seen = new Set();
  const festivals = [];
  for (const n of names) {
    if (seen.has(n)) continue;
    seen.add(n);
    festivals.push(n);
  }
  return { festivals, jieQi: jieQi || '', lunarText: lunar.toString() };
}

function collectFestivals(year, month, day) {
  return dayFestivals(Solar.fromYmd(year, month, day));
}

function pickMajorName(festivals) {
  for (const n of festivals) {
    if (MAJOR_FESTIVALS.has(n)) return n;
  }
  return '';
}

/** 从今天起往后找最近一个常见节日（含今天 → daysLeft=0） */
function findNextMajorFestival(year, month, day) {
  const start = Solar.fromYmd(year, month, day);
  for (let i = 0; i <= 400; i++) {
    const solar = i === 0 ? start : start.next(i);
    const { festivals } = dayFestivals(solar);
    const name = pickMajorName(festivals);
    if (!name) continue;
    const y = solar.getYear();
    const m = solar.getMonth();
    const d = solar.getDay();
    return {
      name,
      festivals: festivals.filter((n) => MAJOR_FESTIVALS.has(n)),
      dateKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      dateLabel: `${y}年${m}月${d}日`,
      daysLeft: i,
      /** 节日当天 0 点（北京）ISO，前端用来做时分秒倒计时 */
      at: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+08:00`,
    };
  }
  return null;
}

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'nuist-packagepickup/1.0 (campus hub; today-in-history)',
        'Api-User-Agent': 'nuist-packagepickup/1.0 (campus hub; today-in-history)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseYear(v) {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function dedupeKey(e) {
  return `${e.year || ''}::${String(e.text || '')
    .slice(0, 28)
    .toLowerCase()}`;
}

function mergeEvents(lists, limit = FULL_LIMIT) {
  const seen = new Set();
  const all = [];
  for (const list of lists) {
    for (const e of list || []) {
      const year = parseYear(e.year);
      const text = String(e.text || '').trim();
      if (!text) continue;
      const row = { year, text };
      const k = dedupeKey(row);
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(row);
    }
  }
  return all.sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, limit);
}

/** 主页预览：最新 3 个年份的事件 + 最老 3 个年份的事件 */
export function buildPreview(events) {
  const list = Array.isArray(events) ? events : [];
  const years = [
    ...new Set(list.map((e) => parseYear(e.year)).filter((y) => y != null)),
  ].sort((a, b) => b - a);
  if (years.length <= PREVIEW_NEWEST + PREVIEW_OLDEST) {
    return list.map((e) => ({ ...e, _bucket: 'newest' }));
  }
  const newestYears = new Set(years.slice(0, PREVIEW_NEWEST));
  const oldestYears = new Set(years.slice(-PREVIEW_OLDEST));
  const perYearCap = 2;
  function pick(bucketYears, bucket) {
    const counts = new Map();
    const out = [];
    for (const e of list) {
      const y = parseYear(e.year);
      if (!bucketYears.has(y)) continue;
      if (bucket === 'oldest' && newestYears.has(y)) continue;
      const n = counts.get(y) || 0;
      if (n >= perYearCap) continue;
      counts.set(y, n + 1);
      out.push({ ...e, _bucket: bucket });
    }
    return out;
  }
  return [...pick(newestYears, 'newest'), ...pick(oldestYears, 'oldest')];
}

async function fetchXxapi(month, day) {
  const json = await fetchJson(
    `https://v2.xxapi.cn/api/history?month=${month}&day=${day}`
  );
  const rows = Array.isArray(json?.data) ? json.data : [];
  const events = [];
  for (const row of rows) {
    const s = String(row || '').trim();
    const m = s.match(/^(\d{1,4})年(\d{1,2})月(\d{1,2})日\s*(.+)$/);
    if (m) {
      if (Number(m[2]) !== month || Number(m[3]) !== day) continue;
      events.push({ year: Number(m[1]), text: m[4].trim() });
    } else if (s) events.push({ year: null, text: s });
  }
  if (!events.length) throw new Error('xxapi empty');
  return events;
}

async function fetchAsilu(month, day) {
  const json = await fetchJson(
    `https://api.asilu.com/today?month=${month}&day=${day}`
  );
  const rows = Array.isArray(json?.data) ? json.data : [];
  const events = rows
    .filter((r) => !r.type || r.type === 'event')
    .map((r) => ({ year: r.year, text: r.title || r.text }));
  if (!events.length) throw new Error('asilu empty');
  return events;
}

async function fetchMuffin(month, day) {
  const json = await fetchJson(
    `http://history.muffinlabs.com/date/${month}/${day}`,
    12000
  );
  const rows = Array.isArray(json?.data?.Events) ? json.data.Events : [];
  const events = rows.map((e) => ({ year: e.year, text: e.text }));
  if (!events.length) throw new Error('muffin empty');
  return events;
}

async function fetchByabbe(month, day) {
  const json = await fetchJson(
    `https://byabbe.se/on-this-day/${month}/${day}/events.json`,
    12000
  );
  const rows = Array.isArray(json?.events) ? json.events : [];
  const events = rows.map((e) => ({
    year: e.year,
    text: e.description || e.text,
  }));
  if (!events.length) throw new Error('byabbe empty');
  return events;
}

async function fetchWiki(month, day) {
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/zh/onthisday/events/${month}/${day}`;
  const json = await fetchJson(url, 12000);
  const events = (Array.isArray(json?.events) ? json.events : []).map((e) => ({
    year: e.year,
    text: e.text,
  }));
  if (!events.length) throw new Error('wiki empty');
  return events;
}

async function fetchEvents(month, day) {
  const sources = [
    ['xxapi', () => fetchXxapi(month, day)],
    ['asilu', () => fetchAsilu(month, day)],
    ['muffinlabs', () => fetchMuffin(month, day)],
    ['byabbe', () => fetchByabbe(month, day)],
    ['wikipedia-zh', () => fetchWiki(month, day)],
  ];

  const settled = await Promise.all(
    sources.map(async ([name, fn]) => {
      try {
        const events = await fn();
        return { name, events };
      } catch (e) {
        console.warn(`[todayInHistory] ${name} failed:`, e.message || e);
        return { name, events: null };
      }
    })
  );

  const ok = settled.filter((s) => Array.isArray(s.events) && s.events.length);
  if (!ok.length) return { events: [], source: 'fallback' };

  const chinese = ok
    .filter((s) => s.name === 'xxapi' || s.name === 'asilu' || s.name === 'wikipedia-zh')
    .flatMap((s) => s.events);
  const english = ok
    .filter((s) => s.name === 'muffinlabs' || s.name === 'byabbe')
    .flatMap((s) => s.events);

  const recent = mergeEvents(
    [[...english, ...chinese].filter((e) => (parseYear(e.year) || 0) >= RECENT_YEAR)],
    20
  );
  const olderZh = mergeEvents(
    [chinese.filter((e) => (parseYear(e.year) || 0) < RECENT_YEAR)],
    FULL_LIMIT
  );
  const olderEn = mergeEvents(
    [english.filter((e) => (parseYear(e.year) || 0) < RECENT_YEAR)],
    15
  );

  const events = mergeEvents([recent, olderZh, olderEn], FULL_LIMIT);
  const source = ok.map((s) => s.name).join('+');
  return { events, source };
}

function buildPayload(parts, festivalsInfo, events, preview, source) {
  return {
    dateKey: parts.dateKey,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: weekdayLabel(parts.year, parts.month, parts.day),
    dateLabel: `${parts.year}年${parts.month}月${parts.day}日`,
    lunarText: festivalsInfo.lunarText,
    jieQi: festivalsInfo.jieQi,
    festivals: festivalsInfo.festivals,
    nextFestival: findNextMajorFestival(parts.year, parts.month, parts.day),
    /** 完整时间线（已汉化） */
    events,
    /** 主页摘要：最新三年事件 + 最老三年事件 */
    preview,
    source,
    serverTime: new Date().toISOString(),
    timezone: TZ,
  };
}

/** 仅节日/农历/日期 —— 本地计算，瞬时返回（主页节日不用等历史接口） */
export function getTodayMeta() {
  const parts = shanghaiParts();
  const festivalsInfo = collectFestivals(parts.year, parts.month, parts.day);
  const nextFestival = findNextMajorFestival(parts.year, parts.month, parts.day);
  return {
    dateKey: parts.dateKey,
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: weekdayLabel(parts.year, parts.month, parts.day),
    dateLabel: `${parts.year}年${parts.month}月${parts.day}日`,
    lunarText: festivalsInfo.lunarText,
    jieQi: festivalsInfo.jieQi,
    festivals: festivalsInfo.festivals,
    nextFestival,
    serverTime: new Date().toISOString(),
    timezone: TZ,
  };
}

/**
 * 获取今日摘要；跨自然日（北京时间）自动刷新。
 * @param {{ light?: boolean }} [opts] light=true 时只汉化预览条数，主页更快
 */
export async function getTodayInHistory(opts = {}) {
  const light = !!opts.light;
  const parts = shanghaiParts();
  if (cache?.key === parts.dateKey && cache.data) {
    // 轻量请求且已有完整缓存：直接复用
    if (!light || cache.data.events?.length) {
      return {
        ...cache.data,
        serverTime: new Date().toISOString(),
        cached: true,
      };
    }
  }

  const festivalsInfo = collectFestivals(parts.year, parts.month, parts.day);
  const { events: rawEvents, source } = await fetchEvents(parts.month, parts.day);

  if (light) {
    // 主页：先汉化预览（最新/最老年份），完整列表留给时间线页
    const roughPreview = buildPreview(rawEvents);
    const preview = await translateEventTexts(roughPreview, { concurrency: 3 });
    // 恢复 bucket（翻译会丢掉额外字段）
    for (let i = 0; i < preview.length; i++) {
      preview[i]._bucket = roughPreview[i]?._bucket || preview[i]._bucket;
    }
    const data = buildPayload(parts, festivalsInfo, [], preview, source);
    // 不覆盖已有完整缓存；仅在无缓存时写入轻量结果
    if (!(cache?.key === parts.dateKey && cache.data?.events?.length)) {
      cache = { key: parts.dateKey, data, at: Date.now() };
    }
    // 后台补全汉化，不挡主页
    warmFullTranslation(parts, festivalsInfo, rawEvents, source).catch((e) =>
      console.warn('[todayInHistory] warm failed:', e.message || e)
    );
    return { ...data, cached: false, light: true };
  }

  const events = await translateEventTexts(rawEvents, { concurrency: 2 });
  const preview = buildPreview(events);
  const data = buildPayload(parts, festivalsInfo, events, preview, source);
  cache = { key: parts.dateKey, data, at: Date.now() };
  return { ...data, cached: false };
}

let warming = false;
async function warmFullTranslation(parts, festivalsInfo, rawEvents, source) {
  if (warming) return;
  if (cache?.key === parts.dateKey && cache.data?.events?.length) return;
  warming = true;
  try {
    const events = await translateEventTexts(rawEvents, { concurrency: 2 });
    const preview = buildPreview(events);
    const data = buildPayload(parts, festivalsInfo, events, preview, source);
    if (parts.dateKey === shanghaiParts().dateKey) {
      cache = { key: parts.dateKey, data, at: Date.now() };
    }
  } finally {
    warming = false;
  }
}

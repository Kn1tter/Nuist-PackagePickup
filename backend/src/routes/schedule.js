import { Router } from 'express';
import { insert, queryAll, queryOne, execute, isPostgres } from '../db/index.js';
import { auth } from '../middleware/auth.js';

const router = Router();

const DAY_MAP = {
  周一: 1,
  星期一: 1,
  周二: 2,
  星期二: 2,
  周三: 3,
  星期三: 3,
  周四: 4,
  星期四: 4,
  周五: 5,
  星期五: 5,
  周六: 6,
  星期六: 6,
  周日: 7,
  周天: 7,
  星期日: 7,
};

/** 解析 "1-16" / "1-8,10-16" / "1,3,5" */
export function weekMatches(weeksStr, week) {
  const w = Number(week);
  if (!w || w < 1) return false;
  const raw = String(weeksStr || '1-16').trim();
  if (!raw) return true;
  for (const part of raw.split(/[,，、\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-~～到至]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (w >= Math.min(a, b) && w <= Math.max(a, b)) return true;
      continue;
    }
    if (Number(part) === w) return true;
  }
  return false;
}

function calcWeek(termStartDate, now = new Date()) {
  if (!termStartDate) return 1;
  const start = new Date(`${termStartDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;
  const diff = now.getTime() - start.getTime();
  if (diff < 0) return 1;
  return Math.floor(diff / (7 * 24 * 3600 * 1000)) + 1;
}

function normalizeCourse(input) {
  const name = String(input.name || '').trim();
  const location = String(input.location || '').trim();
  const day_of_week = Number(input.day_of_week);
  const start_time = String(input.start_time || '').trim();
  const end_time = String(input.end_time || '').trim();
  const weeks = String(input.weeks || '1-16').trim() || '1-16';

  if (!name || name.length > 80) return { error: '课程名 1–80 字' };
  if (!(day_of_week >= 1 && day_of_week <= 7)) return { error: '星期必须是 1–7' };
  if (!/^\d{1,2}:\d{2}$/.test(start_time) || !/^\d{1,2}:\d{2}$/.test(end_time)) {
    return { error: '时间格式用 16:00' };
  }
  if (weeks.length > 80) return { error: '周次过长' };
  if (location.length > 120) return { error: '地点过长' };

  const pad = (t) => {
    const [h, m] = t.split(':');
    return `${String(Number(h)).padStart(2, '0')}:${m}`;
  };

  return {
    name,
    location,
    day_of_week,
    start_time: pad(start_time),
    end_time: pad(end_time),
    weeks,
  };
}

/** 粘贴行：大学物理|周一|16:00-18:00|滨江楼A101|1-16 */
function parsePasteLine(line) {
  const parts = String(line)
    .trim()
    .split(/[|｜\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  let name = parts[0];
  let dayRaw = parts[1];
  let timeRaw = parts[2];
  let location = parts[3] || '';
  let weeks = parts[4] || '1-16';

  // 也支持：大学物理 周一 16:00-18:00 滨江楼
  if (parts.length === 1) return null;

  let day_of_week = DAY_MAP[dayRaw] || Number(dayRaw);
  if (!(day_of_week >= 1 && day_of_week <= 7)) {
    // try embedded
    for (const [k, v] of Object.entries(DAY_MAP)) {
      if (line.includes(k)) {
        day_of_week = v;
        break;
      }
    }
  }

  const tm = timeRaw.match(/(\d{1,2}:\d{2})\s*[-~～到至]\s*(\d{1,2}:\d{2})/);
  if (!tm) return null;

  return normalizeCourse({
    name,
    day_of_week,
    start_time: tm[1],
    end_time: tm[2],
    location,
    weeks: weeks.replace(/周/g, ''),
  });
}

router.get('/', auth, async (req, res) => {
  try {
    const courses = await queryAll(
      `SELECT * FROM schedule_courses WHERE user_id = ? ORDER BY day_of_week ASC, start_time ASC`,
      [req.user.id]
    );
    const settings = await queryOne(`SELECT * FROM schedule_settings WHERE user_id = ?`, [
      req.user.id,
    ]);
    const term_start_date = settings?.term_start_date || null;
    const current_week = calcWeek(term_start_date);
    res.json({ courses, term_start_date, current_week });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '加载课表失败' });
  }
});

router.put('/settings', auth, async (req, res) => {
  try {
    const term_start_date = String(req.body?.term_start_date || '').trim();
    if (term_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(term_start_date)) {
      return res.status(400).json({ error: '开学日格式 YYYY-MM-DD' });
    }
    const exists = await queryOne(`SELECT user_id FROM schedule_settings WHERE user_id = ?`, [
      req.user.id,
    ]);
    if (exists) {
      await execute(
        isPostgres()
          ? `UPDATE schedule_settings SET term_start_date = ?, updated_at = NOW() WHERE user_id = ?`
          : `UPDATE schedule_settings SET term_start_date = ?, updated_at = datetime('now') WHERE user_id = ?`,
        [term_start_date || null, req.user.id]
      );
    } else {
      await insert(`INSERT INTO schedule_settings (user_id, term_start_date) VALUES (?, ?)`, [
        req.user.id,
        term_start_date || null,
      ]);
    }
    res.json({ ok: true, current_week: calcWeek(term_start_date || null) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '保存失败' });
  }
});

router.post('/courses', auth, async (req, res) => {
  try {
    const c = normalizeCourse(req.body || {});
    if (c.error) return res.status(400).json({ error: c.error });
    const info = await insert(
      `INSERT INTO schedule_courses (user_id, name, location, day_of_week, start_time, end_time, weeks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, c.name, c.location, c.day_of_week, c.start_time, c.end_time, c.weeks]
    );
    const row = await queryOne(`SELECT * FROM schedule_courses WHERE id = ?`, [info.lastInsertRowid]);
    res.status(201).json({ course: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '添加失败' });
  }
});

router.post('/import', auth, async (req, res) => {
  try {
    const text = String(req.body?.text || '');
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (!lines.length) return res.status(400).json({ error: '没有可导入的行' });

    const added = [];
    const errors = [];
    for (const line of lines) {
      const parsed = parsePasteLine(line);
      if (!parsed || parsed.error) {
        errors.push(`${line.slice(0, 40)}…`);
        continue;
      }
      const info = await insert(
        `INSERT INTO schedule_courses (user_id, name, location, day_of_week, start_time, end_time, weeks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          parsed.name,
          parsed.location,
          parsed.day_of_week,
          parsed.start_time,
          parsed.end_time,
          parsed.weeks,
        ]
      );
      added.push(info.lastInsertRowid);
    }
    if (!added.length) {
      return res.status(400).json({
        error: '未能识别任何课程。每行格式：课程名|周一|16:00-18:00|滨江楼A101|1-16',
      });
    }
    res.json({ ok: true, count: added.length, skipped: errors.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '导入失败' });
  }
});

router.delete('/courses/:id', auth, async (req, res) => {
  try {
    const row = await queryOne(`SELECT * FROM schedule_courses WHERE id = ?`, [req.params.id]);
    if (!row || Number(row.user_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: '课程不存在' });
    }
    await execute(`DELETE FROM schedule_courses WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '删除失败' });
  }
});

router.delete('/courses', auth, async (req, res) => {
  try {
    await execute(`DELETE FROM schedule_courses WHERE user_id = ?`, [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '清空失败' });
  }
});

/** 某日某周的课（给悬浮窗） */
router.get('/day', auth, async (req, res) => {
  try {
    const day = Number(req.query.day);
    const settings = await queryOne(`SELECT * FROM schedule_settings WHERE user_id = ?`, [
      req.user.id,
    ]);
    const week = Number(req.query.week) || calcWeek(settings?.term_start_date || null);
    if (!(day >= 1 && day <= 7)) return res.status(400).json({ error: 'day 必须 1–7' });

    const courses = await queryAll(
      `SELECT * FROM schedule_courses WHERE user_id = ? AND day_of_week = ? ORDER BY start_time ASC`,
      [req.user.id, day]
    );
    const items = courses
      .filter((c) => weekMatches(c.weeks, week))
      .map((c) => ({
        id: c.id,
        name: c.name,
        location: c.location || '',
        start_time: c.start_time,
        end_time: c.end_time,
        weeks: c.weeks,
        label: `第${week}周 ${c.start_time}-${c.end_time} ${c.name} ${c.location || ''}`.trim(),
      }));

    res.json({ week, day, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || '查询失败' });
  }
});

export default router;

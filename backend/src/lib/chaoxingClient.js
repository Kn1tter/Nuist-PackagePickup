/**
 * 学习通（超星）只读客户端：登录、课程、作业状态与截止时间。
 * 仅用于查询绑定用户本人数据；请控制频率。
 */
import crypto from 'crypto';

const AES_KEY = Buffer.from('u2oh6Vu^HWe4_AES');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const STATUS_PENDING = /未交|未提交/;
const STATUS_PEER = /待互評|待互评/;
const STATUS_REVIEW = /待批閱|待批阅|待批改/;
const STATUS_DONE = /已完成|已批改|已互評|已互评/;
const REMAINING_RE = /剩余\s*(\d+)\s*小时\s*(\d+)\s*分钟/;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function encryptChaoxingAes(text) {
  const cipher = crypto.createCipheriv('aes-128-cbc', AES_KEY, AES_KEY);
  return Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]).toString('base64');
}

export function classifyStatus(raw) {
  const text = String(raw || '').trim();
  if (STATUS_PENDING.test(text)) return '未交';
  if (STATUS_PEER.test(text)) return '待互评';
  if (STATUS_REVIEW.test(text)) return '待批阅';
  if (STATUS_DONE.test(text)) return '已完成';
  return text || '未知';
}

export function remainingToDeadline(remaining, now = new Date()) {
  const m = String(remaining || '').match(REMAINING_RE);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const d = new Date(now.getTime() + (hours * 60 + minutes) * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  absorb(res) {
    const list =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : String(res.headers.get('set-cookie') || '')
            .split(/,(?=[^;]+?=)/)
            .filter(Boolean);
    for (const raw of list) {
      const part = String(raw).split(';')[0];
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1).trim();
      if (k) this.map.set(k, v);
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  get(name) {
    return this.map.get(name) || null;
  }
}

export class ChaoxingClient {
  constructor({ username, password, delayMs = 350 } = {}) {
    this.username = String(username || '').trim();
    this.password = String(password || '');
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.jar = new CookieJar();
  }

  async _wait() {
    if (this.delayMs) await sleep(this.delayMs);
  }

  async request(url, { method = 'GET', headers = {}, body = undefined, form = undefined } = {}) {
    const h = {
      'User-Agent': UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Cookie: this.jar.header(),
      ...headers,
    };
    let payload = body;
    if (form) {
      h['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      payload = new URLSearchParams(form).toString();
    }
    const res = await fetch(url, { method, headers: h, body: payload, redirect: 'manual' });
    this.jar.absorb(res);

    // follow redirects manually to keep cookies
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (loc) {
        const next = new URL(loc, url).toString();
        await this._wait();
        return this.request(next, { method: 'GET', headers });
      }
    }
    return res;
  }

  async login() {
    const res = await this.request('https://passport2.chaoxing.com/fanyalogin', {
      method: 'POST',
      headers: {
        Origin: 'https://passport2.chaoxing.com',
        Referer:
          'https://passport2.chaoxing.com/login?fid=&newversion=true&refer=http%3A%2F%2Fi.chaoxing.com',
        'X-Requested-With': 'XMLHttpRequest',
      },
      form: {
        fid: '-1',
        uname: encryptChaoxingAes(this.username),
        password: encryptChaoxingAes(this.password),
        refer: 'https%3A%2F%2Fi.chaoxing.com',
        t: 'true',
        forbidotherlogin: '0',
        validate: '',
        doubleFactorLogin: '0',
        independentId: '0',
        independentNameId: '0',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.status) {
      throw new Error(data?.msg2 || data?.msg || '学习通登录失败');
    }
    await this.request('https://i.chaoxing.com/');
    await this._wait();
    return { uid: this.jar.get('_uid') || this.jar.get('UID') };
  }

  async listCourses({ activeOnly = true } = {}) {
    const res = await this.request(
      'https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1'
    );
    const data = await res.json();
    if (data?.result !== 1) throw new Error(data?.msg || '获取课程失败');
    const courses = [];
    for (const channel of data.channelList || []) {
      const content = channel?.content || {};
      const courseData = content?.course?.data?.[0];
      if (!courseData?.id || !content?.id) continue;
      const isRetire = Number(content.isretire || 0);
      if (activeOnly && isRetire !== 0) continue;
      courses.push({
        courseId: String(courseData.id),
        classId: String(content.id),
        cpi: String(content.cpi || ''),
        name: String(courseData.name || '未命名课程'),
        teacher: String(courseData.teacherfactor || ''),
        isRetire,
      });
    }
    await this._wait();
    return courses;
  }

  extractWorkEnc(html) {
    const m1 = String(html).match(/id=["']workEnc["'][^>]*value=["']([^"']+)["']/i);
    if (m1?.[1]) return m1[1];
    const m2 = String(html).match(/id=["']enc["'][^>]*value=["']([^"']+)["']/i);
    if (m2?.[1]) return m2[1];
    const m3 = String(html).match(/[?&]enc=([a-f0-9]{32})/i);
    return m3?.[1] || null;
  }

  async getWorkEnc(course) {
    const url = new URL('https://mooc1.chaoxing.com/visit/stucoursemiddle');
    url.searchParams.set('courseid', course.courseId);
    url.searchParams.set('clazzid', course.classId);
    url.searchParams.set('cpi', course.cpi);
    url.searchParams.set('ismooc2', '1');
    url.searchParams.set('v', '2');
    const res = await this.request(url.toString());
    const html = await res.text();
    const enc = this.extractWorkEnc(html);
    if (!enc) throw new Error(`课程「${course.name}」未找到 workEnc`);
    await this._wait();
    return enc;
  }

  parseWorkListHtml(html, course, now = new Date()) {
    const items = [];
    const liRe = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = liRe.exec(html))) {
      const attrs = match[1] || '';
      const inner = match[2] || '';
      const dataM = attrs.match(/\bdata=["']([^"']+)["']/i);
      if (!dataM) continue;
      const detailUrl = dataM[1];
      const titleM =
        inner.match(/class=["'][^"']*overHidden2[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) ||
        inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const statusM = inner.match(/class=["'][^"']*status[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
      const timeM = inner.match(/class=["'][^"']*time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

      const title = stripTags(titleM?.[1] || '');
      const statusRaw = stripTags(statusM?.[1] || '');
      const remaining = timeM ? stripTags(timeM[1]) : null;
      const status = classifyStatus(statusRaw);
      const deadline = remainingToDeadline(remaining, now);
      const expired = status === '未交' && !timeM;
      let workId = '';
      try {
        workId = new URL(detailUrl, 'https://mooc1.chaoxing.com').searchParams.get('workId') || '';
      } catch {
        /* ignore */
      }

      items.push({
        courseName: course.name,
        title,
        status,
        statusRaw,
        remaining,
        deadline,
        expired,
        courseId: course.courseId,
        classId: course.classId,
        cpi: course.cpi,
        workId,
        detailUrl: detailUrl.startsWith('http')
          ? detailUrl
          : `https://mooc1.chaoxing.com${detailUrl}`,
        source: 'course_work_list',
      });
    }

    let totalPages = 1;
    const pageChunk = html.match(/id=["']page["'][\s\S]*?<\/div>/i)?.[0] || '';
    const nums = [...pageChunk.matchAll(/>(\d+)</g)].map((m) => Number(m[1])).filter(Boolean);
    if (nums.length) totalPages = Math.max(...nums);
    return { items, totalPages };
  }

  async listCourseHomeworks(course, workEnc) {
    const enc = workEnc || (await this.getWorkEnc(course));
    let pageNum = 1;
    let totalPages = 1;
    const all = [];
    while (pageNum <= totalPages) {
      const url = new URL('https://mooc1.chaoxing.com/mooc-ans/mooc2/work/list');
      url.searchParams.set('courseId', course.courseId);
      url.searchParams.set('classId', course.classId);
      url.searchParams.set('cpi', course.cpi);
      url.searchParams.set('enc', enc);
      url.searchParams.set('pageNum', String(pageNum));
      url.searchParams.set('ut', 's');
      url.searchParams.set('isdisplaytable', '2');
      const res = await this.request(url.toString());
      const html = await res.text();
      const parsed = this.parseWorkListHtml(html, course);
      all.push(...parsed.items);
      totalPages = parsed.totalPages;
      pageNum += 1;
      await this._wait();
    }
    return all;
  }

  async fetchFastHomeworks(now = new Date()) {
    const res = await this.request('https://mooc1-api.chaoxing.com/work/stu-work');
    const html = await res.text();
    const items = [];
    const liRe = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = liRe.exec(html))) {
      const attrs = match[1] || '';
      const inner = match[2] || '';
      const dataM = attrs.match(/\bdata=["']([^"']+)["']/i);
      if (!dataM) continue;
      const detailUrl = dataM[1];
      const titleM = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (!titleM) continue;
      const spans = [...inner.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)];
      if (spans.length < 2) continue;
      let statusRaw = '';
      let courseName = '';
      let remaining = null;
      for (const s of spans) {
        const a = s[1] || '';
        const t = stripTags(s[2]);
        if (/class=["'][^"']*\bstatus\b/.test(a)) statusRaw = t;
        else if (/class=["'][^"']*\bfr\b/.test(a)) remaining = t;
      }
      if (!statusRaw) statusRaw = stripTags(spans[0][2]);
      courseName = stripTags(spans[1][2]);
      const status = classifyStatus(statusRaw);
      let workId = '';
      try {
        const u = new URL(detailUrl, 'https://mooc1-api.chaoxing.com');
        workId = u.searchParams.get('taskrefId') || u.searchParams.get('workId') || '';
      } catch {
        /* ignore */
      }
      items.push({
        courseName,
        title: stripTags(titleM[1]),
        status,
        statusRaw,
        remaining,
        deadline: remainingToDeadline(remaining, now),
        expired: status === '未交' && !remaining,
        courseId: '',
        classId: '',
        cpi: '',
        workId,
        detailUrl: detailUrl.startsWith('http')
          ? detailUrl
          : `https://mooc1-api.chaoxing.com${detailUrl}`,
        source: 'stu_work',
      });
    }
    await this._wait();
    return items;
  }

  async fetchHomeworks({
    mode = 'courses',
    activeOnly = true,
    courseLimit = 12,
    statusFilter = null,
  } = {}) {
    const errors = [];
    let courses = [];
    let homeworks = [];

    if (mode === 'fast' || mode === 'both') {
      try {
        homeworks.push(...(await this.fetchFastHomeworks()));
      } catch (e) {
        errors.push(`fast: ${e.message || e}`);
      }
    }

    if (mode === 'courses' || mode === 'both') {
      try {
        courses = await this.listCourses({ activeOnly });
        if (courseLimit != null) courses = courses.slice(0, Math.max(0, Number(courseLimit)));
        for (const course of courses) {
          try {
            homeworks.push(...(await this.listCourseHomeworks(course)));
          } catch (e) {
            errors.push(`课程「${course.name}」: ${e.message || e}`);
          }
        }
      } catch (e) {
        errors.push(`courses: ${e.message || e}`);
      }
    }

    const dedup = new Map();
    for (const hw of homeworks) {
      const key = `${hw.courseId}|${hw.workId}|${hw.title}|${hw.courseName}`;
      const prev = dedup.get(key);
      if (!prev || (prev.source === 'stu_work' && hw.source === 'course_work_list')) {
        if (prev && !hw.deadline && prev.deadline) {
          hw.deadline = prev.deadline;
          hw.remaining = hw.remaining || prev.remaining;
        }
        dedup.set(key, hw);
      }
    }
    homeworks = [...dedup.values()];

    if (statusFilter?.length) {
      const wanted = new Set(statusFilter);
      homeworks = homeworks.filter((h) => wanted.has(h.status));
    }

    const rank = { 未交: 0, 待互评: 1, 待批阅: 2, 已完成: 3 };
    homeworks.sort((a, b) => {
      const ra = rank[a.status] ?? 9;
      const rb = rank[b.status] ?? 9;
      if (ra !== rb) return ra - rb;
      const ta = a.expired ? 1e18 : a.deadline ? Date.parse(a.deadline.replace(' ', 'T')) || 1e17 : 1e17;
      const tb = b.expired ? 1e18 : b.deadline ? Date.parse(b.deadline.replace(' ', 'T')) || 1e17 : 1e17;
      if (ta !== tb) return ta - tb;
      return String(a.courseName).localeCompare(String(b.courseName), 'zh');
    });

    return { courses, homeworks, errors };
  }
}

import { execute, queryAll, isPostgres } from '../db/index.js';

export const HUB_BLURB_KEYS = [
  'forum',
  'pickup',
  'resources',
  'games',
  'arcade',
  'schedule',
  'homework',
  'video',
];

export const DEFAULT_HUB_BLURBS = {
  forum: '吐槽、求助、反馈校园生活，和同学一起把南信大变好一点。',
  pickup: '发单、接单、线下结算；取件码仅接单后可见。',
  resources: '课件、历年卷、软件与学习资料链接，分类浏览、一键打开。',
  games: '自建游戏组，加入后发开黑邀请，找南信大的搭子。',
  arcade: '台球、冰壶、坦克等联机小游戏，登录即可开房对战。',
  schedule: '录入课表后按日生成网页悬浮窗，一眼看到时间、课程与楼号。',
  homework: '绑定学习通后查看作业提交状态与截止时间，临近截止可站内信/Bark 提醒。',
  video: '粘贴抖音 / B 站分享链接，游客也可解析下载到本地。',
};

const KEY_PREFIX = 'hub.blurb.';
const MAX_LEN = 120;

export function settingKey(blurbKey) {
  return `${KEY_PREFIX}${blurbKey}`;
}

export function isValidBlurbKey(key) {
  return HUB_BLURB_KEYS.includes(String(key || ''));
}

export async function getHubBlurbs() {
  const out = { ...DEFAULT_HUB_BLURBS };
  try {
    const rows = await queryAll(
      `SELECT key, value FROM site_settings WHERE key LIKE ?`,
      [`${KEY_PREFIX}%`]
    );
    for (const row of rows) {
      const k = String(row.key || '').replace(KEY_PREFIX, '');
      if (isValidBlurbKey(k) && row.value != null) {
        out[k] = String(row.value);
      }
    }
  } catch {
    /* table may not exist yet during first boot edge */
  }
  return out;
}

export async function setHubBlurb(blurbKey, text) {
  if (!isValidBlurbKey(blurbKey)) {
    const err = new Error('无效的入口键');
    err.status = 400;
    throw err;
  }
  const value = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN);
  if (!value) {
    const err = new Error('简介不能为空');
    err.status = 400;
    throw err;
  }

  const key = settingKey(blurbKey);
  if (isPostgres()) {
    await execute(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
  } else {
    await execute(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, value]
    );
  }
  return value;
}

export { MAX_LEN as HUB_BLURB_MAX };

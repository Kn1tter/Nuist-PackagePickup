/**
 * 非线性经验：升到下一级所需 XP = floor(BASE * level^EXP)
 * level 从 1 起；总经验越高，升级越慢。
 */
const BASE = 40;
const EXP = 1.65;
const MAX_LEVEL = 60;

export function xpToNextLevel(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
  return Math.max(20, Math.floor(BASE * lv ** EXP));
}

/** 累计升到某级所需总 XP（达到该级的门槛，level=1 时为 0） */
export function totalXpForLevel(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL + 1, Number(level) || 1));
  let sum = 0;
  for (let i = 1; i < lv; i++) sum += xpToNextLevel(i);
  return sum;
}

export function levelFromXp(rawXp) {
  const xp = Math.max(0, Math.floor(Number(rawXp) || 0));
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const need = xpToNextLevel(level);
    if (xp < spent + need) {
      return {
        level,
        xp,
        current: xp - spent,
        need,
        progress: need ? Math.min(1, (xp - spent) / need) : 1,
        max_level: MAX_LEVEL,
      };
    }
    spent += need;
    level += 1;
  }
  return {
    level: MAX_LEVEL,
    xp,
    current: xp - spent,
    need: xpToNextLevel(MAX_LEVEL),
    progress: 1,
    max_level: MAX_LEVEL,
  };
}

export function publicXp(userRow) {
  return levelFromXp(userRow?.xp ?? 0);
}

/** 论坛行为奖励 */
export const XP_REWARDS = {
  post: 18,
  reply: 10,
  liked: 12,
};

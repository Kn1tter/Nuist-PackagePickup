/**
 * 冰壶：俯视冰道，摩擦减速 + 旋转侧向（curl）+ 壶间弹性碰撞。
 */

export const WORLD_W = 960;
export const WORLD_H = 480;
export const STONE_R = 15;
export const BUTTON = { x: 780, y: 240 };
/** 大本营环半径（外→内） */
export const HOUSE_RINGS = [118, 78, 40, 14];
/** 后挡线（壶中心越过则出局） */
export const BACK_LINE = 920;
/** 前掷线 / hog 简化：壶须越过才算有效计分区 */
export const HOG_LINE = 520;
export const THROW_X = 72;
export const ICE_TOP = 36;
export const ICE_BOT = WORLD_H - 36;

const FRICTION = 0.9835;
const MIN_V = 0.055;
const CURL_K = 0.0032;
const RESTITUTION = 0.92;
const MAX_STEPS = 2400;
const FRAME_EVERY = 5;

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distToButton(stone) {
  return Math.sqrt(dist2(stone, BUTTON));
}

export function inHouse(stone) {
  return distToButton(stone) <= HOUSE_RINGS[0] + STONE_R * 0.15;
}

export function isOut(stone) {
  if (!stone || stone.out) return true;
  if (stone.x - STONE_R > BACK_LINE) return true;
  if (stone.y < ICE_TOP - STONE_R * 0.5 || stone.y > ICE_BOT + STONE_R * 0.5) return true;
  if (stone.x < -STONE_R * 2) return true;
  return false;
}

function clampY(y) {
  return Math.max(ICE_TOP + STONE_R, Math.min(ICE_BOT - STONE_R, y));
}

function resolvePair(a, b) {
  if (a.out || b.out) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const min = STONE_R * 2;
  if (d2 <= 0 || d2 >= min * min) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const overlap = min - d;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;
  a.y = clampY(a.y);
  b.y = clampY(b.y);

  const avn = a.vx * nx + a.vy * ny;
  const bvn = b.vx * nx + b.vy * ny;
  const impulse = ((1 + RESTITUTION) * (avn - bvn)) / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

function stepStones(stones) {
  for (const s of stones) {
    if (s.out) continue;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > MIN_V) {
      // curl：垂直于速度方向的侧向加速（旋向）
      const cx = -s.vy / sp;
      const cy = s.vx / sp;
      s.vx += cx * s.curl * sp * CURL_K;
      s.vy += cy * s.curl * sp * CURL_K;
      s.vx *= FRICTION;
      s.vy *= FRICTION;
    } else {
      s.vx = 0;
      s.vy = 0;
    }
    s.x += s.vx;
    s.y += s.vy;
    s.y = clampY(s.y);
    if (isOut(s)) {
      s.out = true;
      s.vx = 0;
      s.vy = 0;
    }
  }
  for (let i = 0; i < stones.length; i++) {
    for (let j = i + 1; j < stones.length; j++) {
      resolvePair(stones[i], stones[j]);
    }
  }
  for (const s of stones) {
    if (!s.out && isOut(s)) {
      s.out = true;
      s.vx = 0;
      s.vy = 0;
    }
  }
}

function moving(stones) {
  return stones.some((s) => !s.out && (Math.abs(s.vx) > MIN_V || Math.abs(s.vy) > MIN_V));
}

/**
 * @param {object[]} stones 现有壶（会被拷贝）
 * @param {{ ownerId:number, team:number|null, color:string, seat:number, power:number, angleDeg:number, curl:number, aimY:number }} shot
 */
export function simulateThrow(stones, shot) {
  const list = stones.map((s) => ({
    id: s.id,
    ownerId: s.ownerId,
    team: s.team,
    color: s.color,
    seat: s.seat,
    x: s.x,
    y: s.y,
    vx: 0,
    vy: 0,
    curl: 0,
    out: !!s.out,
  }));

  const power = Math.max(2.2, Math.min(16.5, Number(shot.power) || 8));
  const angle = ((Number(shot.angleDeg) || 0) * Math.PI) / 180;
  const curl = Math.max(-1, Math.min(1, Number(shot.curl) || 0));
  const aimY = clampY(Number(shot.aimY) || BUTTON.y);

  const thrown = {
    id: shot.id || `s-${Date.now()}`,
    ownerId: shot.ownerId,
    team: shot.team,
    color: shot.color,
    seat: shot.seat,
    x: THROW_X,
    y: aimY,
    vx: Math.cos(angle) * power,
    vy: Math.sin(angle) * power,
    curl,
    out: false,
  };
  list.push(thrown);

  const frames = [];
  let steps = 0;
  while (moving(list) && steps < MAX_STEPS) {
    stepStones(list);
    if (steps % FRAME_EVERY === 0) {
      frames.push(
        list.map((s) => ({
          id: s.id,
          x: Math.round(s.x * 10) / 10,
          y: Math.round(s.y * 10) / 10,
          out: !!s.out,
          color: s.color,
          ownerId: s.ownerId,
          team: s.team,
          seat: s.seat,
        }))
      );
    }
    steps += 1;
  }
  for (const s of list) {
    s.vx = 0;
    s.vy = 0;
    if (isOut(s)) s.out = true;
  }

  const finalStones = list
    .filter((s) => !s.out)
    .map((s) => ({
      id: s.id,
      ownerId: s.ownerId,
      team: s.team,
      color: s.color,
      seat: s.seat,
      x: Math.round(s.x * 10) / 10,
      y: Math.round(s.y * 10) / 10,
      out: false,
    }));

  return { stones: finalStones, frames, thrownId: thrown.id, steps };
}

/**
 * 经典计分：拥有离钮最近壶的一方，按「比对方最近壶更近」的壶数得分。
 * sideKey: 'team' | 'ownerId'
 */
export function scoreEnd(stones, { sideKey = 'team' } = {}) {
  const live = (stones || []).filter((s) => !s.out && s.x >= HOG_LINE - STONE_R);
  if (!live.length) return { scoringSide: null, points: 0, closestId: null };

  const ranked = live
    .map((s) => ({ s, d: distToButton(s) }))
    .sort((a, b) => a.d - b.d);
  const best = ranked[0];
  const side = sideKey === 'team' ? best.s.team : best.s.ownerId;
  if (side === null || side === undefined) {
    return { scoringSide: null, points: 0, closestId: best.s.id };
  }

  let oppClosest = Infinity;
  for (const { s, d } of ranked) {
    const sid = sideKey === 'team' ? s.team : s.ownerId;
    if (sid !== side) {
      oppClosest = d;
      break;
    }
  }

  let points = 0;
  for (const { s, d } of ranked) {
    const sid = sideKey === 'team' ? s.team : s.ownerId;
    if (sid !== side) break;
    if (d < oppClosest) points += 1;
    else break;
  }

  return { scoringSide: side, points, closestId: best.s.id };
}

/**
 * 弹弹堂风格简易坦克：回合制、风力、随机双层地形。
 * 大混战 2–5 人，或 2v2 团队战；服务端权威弹道与伤害。
 */

import { recordArcadeResult } from './arcadeStats.js';
import { BOT_DIFFICULTIES, botDiffPublic, normalizeBotDiff } from './botDiff.js';

const MAX_ROOMS = 8;
const ROOM_TTL_MS = 30 * 60 * 1000;
const RECONNECT_MS = 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 大混战人数上限 */
const MAX_PLAYERS_FFA = 5;
/** 2v2 固定 4 人 */
const MAX_PLAYERS_TEAMS = 4;
/** 测试房人数上限 */
const MAX_PLAYERS_TEST = 5;
const MIN_PLAYERS = 2;
const TEAM_NAMES = ['红队', '蓝队'];
const MODE_FFA = 'ffa';
const MODE_TEAMS = 'teams';

function normalizeMode(mode) {
  return String(mode || '').toLowerCase() === MODE_TEAMS ? MODE_TEAMS : MODE_FFA;
}

function roomCap(room) {
  if (room?.testMode) return MAX_PLAYERS_TEST;
  if (room?.mode === MODE_TEAMS) return MAX_PLAYERS_TEAMS;
  return MAX_PLAYERS_FFA;
}

function isEnemy(room, a, b) {
  if (!a || !b || a.userId === b.userId) return false;
  if (room.mode !== MODE_TEAMS) return true;
  return Number(a.team) !== Number(b.team);
}

function assignTeamSeat(room, seat) {
  if (room.mode !== MODE_TEAMS) return null;
  // 0,1 → 红队；2,3 → 蓝队
  return seat < 2 ? 0 : 1;
}

function paintTeamColors(room) {
  for (const t of [0, 1]) {
    const mates = room.players.filter((p) => Number(p.team) === t);
    mates.forEach((p, idx) => {
      p.color = t === 0 ? (idx === 0 ? '#e85d4c' : '#f0a08f') : idx === 0 ? '#3b82c4' : '#8eb8e8';
    });
  }
}

function rebalanceTeams(room) {
  if (room.mode !== MODE_TEAMS) {
    for (const p of room.players) p.team = null;
    room.players.forEach((p, i) => {
      p.color = COLORS[i % COLORS.length];
    });
    return;
  }
  room.players.forEach((p, i) => {
    if (p.team !== 0 && p.team !== 1) p.team = assignTeamSeat(room, i);
  });
  // 某队超过 2 人时，把多余的挪到另一队
  for (const t of [0, 1]) {
    const mates = room.players.filter((p) => Number(p.team) === t);
    while (mates.length > 2) {
      const extra = mates.pop();
      extra.team = t === 0 ? 1 : 0;
    }
  }
  paintTeamColors(room);
}

function lobbyHint(room) {
  if (room.testMode) return `管理员测试模式 · ${room.players.length} 辆坦克`;
  if (room.vsBot) return room.message;
  if (room.mode === MODE_TEAMS) {
    const n = room.players.length;
    if (n >= 4) return '2v2 已满员，房主可以开始（同队不受伤）';
    return `2v2 团队战 · ${n}/4 · 红队对蓝队`;
  }
  const n = room.players.length;
  if (n >= MAX_PLAYERS_FFA) return '大混战已满员（5 人），房主可以开始';
  return `大混战 · ${n}/${MAX_PLAYERS_FFA} · 最后存活者获胜`;
}

export const WORLD_W = 960;
export const WORLD_H = 480;
const COLS = 160;
const COL_W = WORLD_W / COLS;
const TANK_R = 9;
const HP_MAX = 100;
const MOVE_BUDGET = 90;
const TURN_MS = 60 * 1000;
/** 重力偏大、初速适中 → 满力仍是抛物线，不会「拉满直线」 */
const GRAVITY = 0.145;
const POWER_BASE = 1.75;
const POWER_GAIN = 0.068;
const AIR_DRAG = 0.991;
const BLAST_R = 28;
const MAX_DMG = 58;
const TERRAIN_SOFT = 16;

/** 坦克品种：大厅可选，开局锁定 */
export const TANK_TYPES = {
  default: {
    id: 'default',
    name: '默认坦克',
    blurb: '均衡：血量、移动、爆炸范围都适中',
    hpMax: 100,
    moveBudget: 90,
    blastR: 28,
    maxDmg: 58,
    directMult: 1,
    rangeMult: 1.12,
    damageTakenMult: 1,
  },
  pierce: {
    id: 'pierce',
    name: '破甲坦克',
    blurb: '直接命中伤害更高，但本回合移动更少',
    hpMax: 100,
    moveBudget: 52,
    blastR: 24,
    maxDmg: 54,
    directMult: 1.7,
    rangeMult: 1.12,
    damageTakenMult: 1,
  },
  bomber: {
    id: 'bomber',
    name: '轰炸坦克',
    blurb: '爆炸范围更大，但血量只有 80',
    hpMax: 80,
    moveBudget: 85,
    blastR: 46,
    maxDmg: 52,
    directMult: 1,
    rangeMult: 1.08,
    damageTakenMult: 1,
  },
  sniper: {
    id: 'sniper',
    name: '狙击坦克',
    blurb: '射程更远、移动更多，但受到伤害增加',
    hpMax: 100,
    moveBudget: 125,
    blastR: 20,
    maxDmg: 46,
    directMult: 1.12,
    rangeMult: 1.5,
    damageTakenMult: 1.4,
  },
  glass: {
    id: 'glass',
    name: '玻璃坦克',
    blurb: '射程介于默认与狙击之间；打人或被打都是一炮死，对地形破坏更小',
    hpMax: 100,
    moveBudget: 95,
    blastR: 16,
    maxDmg: 58,
    directMult: 1,
    rangeMult: 1.31,
    damageTakenMult: 1,
    /** 炮弹碰到敌人 → 秒杀；被别人打到 → 秒杀 */
    oneshotHit: true,
    oneshotTaken: true,
    /** 挖地更轻 */
    terrainSoftMult: 0.35,
    terrainRadiusMult: 0.55,
  },
  vamp: {
    id: 'vamp',
    name: '吸血坦克',
    blurb: '70/100 血；打中别人回血 90%（不可超过上限），对地形破坏更小',
    hpMax: 70,
    moveBudget: 90,
    blastR: 22,
    maxDmg: 52,
    directMult: 1,
    rangeMult: 1.12,
    damageTakenMult: 1,
    /** 对敌人造成伤害的回血比例 */
    lifesteal: 0.9,
    terrainSoftMult: 0.35,
    terrainRadiusMult: 0.55,
  },
  yjz: {
    id: 'yjz',
    name: 'yjz（全解放）',
    blurb: '150 血；狙击射程与机动；破甲直伤 + 轰炸范围 + 吸血；非一炮死',
    hpMax: 150,
    moveBudget: 125,
    blastR: 46,
    maxDmg: 58,
    directMult: 1.7,
    rangeMult: 1.5,
    damageTakenMult: 1,
    lifesteal: 0.55,
  },
};

function getTankType(p) {
  const id = p?.tankType && TANK_TYPES[p.tankType] ? p.tankType : 'default';
  return TANK_TYPES[id];
}

/** yjz（全解放）仅管理员可在玩家对战中选用；人机/测试房不限 */
const ADMIN_ONLY_TANK = new Set(['yjz']);

function tankTypesPublic() {
  return Object.values(TANK_TYPES).map((t) => ({
    id: t.id,
    name: t.name,
    blurb: t.blurb,
    hpMax: t.hpMax,
    moveBudget: t.moveBudget,
    adminOnly: ADMIN_ONLY_TANK.has(t.id),
  }));
}

function canPickTankType(room, user, typeId) {
  if (!ADMIN_ONLY_TANK.has(typeId)) return true;
  if (room.vsBot || room.testMode) return true;
  return !!user?.is_admin;
}

const COLORS = ['#e85d4c', '#3b82c4', '#3fa86a', '#c9a227', '#9b59b6'];

/** @type {Map<string, any>} */
const rooms = new Map();

function now() {
  return Date.now();
}

function makeCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return c;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }
}

function mulberry32(a) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 下层凹凸丘陵 + 上层碎裂平台（随机性更高） */
export function generateTerrain(seed = (Math.random() * 1e9) | 0) {
  const rand = mulberry32(seed >>> 0);
  const ground = new Array(COLS);
  let h = 95 + rand() * 55;
  for (let i = 0; i < COLS; i++) {
    const t = i / COLS;
    // 多层噪声：大起伏 + 中频丘陵 + 高频小坎
    const big = Math.sin(t * Math.PI * (1.2 + rand() * 0.8) + rand() * 6) * (28 + rand() * 22);
    const mid = Math.sin(t * Math.PI * (4 + rand() * 3) + rand() * 4) * (12 + rand() * 14);
    h += (rand() - 0.5) * 14 + big * 0.08 + mid * 0.12;
    // 偶尔挖坑 / 鼓包
    if (rand() < 0.045) h -= 18 + rand() * 28;
    if (rand() < 0.04) h += 14 + rand() * 22;
    h = Math.max(48, Math.min(230, h));
    ground[i] = Math.round(h);
  }
  // 只做很轻的平滑，保留凹凸
  for (let pass = 0; pass < 1; pass++) {
    const next = ground.slice();
    for (let i = 1; i < COLS - 1; i++) {
      next[i] = Math.round(ground[i] * 0.55 + (ground[i - 1] + ground[i + 1]) * 0.225);
    }
    for (let i = 0; i < COLS; i++) ground[i] = next[i];
  }

  const upper = new Array(COLS).fill(0);
  // 二层整体压低：更靠近地面丘陵，随机幅度也缩小
  const deckBase = 175 + Math.round(rand() * 30);
  const gapCount = 1 + (rand() > 0.4 ? 1 : 0) + (rand() > 0.75 ? 1 : 0);
  const gaps = [];
  for (let g = 0; g < gapCount; g++) {
    gaps.push({
      c: 0.18 + rand() * 0.64,
      half: 0.04 + rand() * 0.07,
    });
  }
  for (let i = 0; i < COLS; i++) {
    const t = i / (COLS - 1);
    if (t < 0.08 || t > 0.92) continue;
    if (gaps.some((g) => Math.abs(t - g.c) < g.half)) continue;
    // 上层本身也起伏
    const bump = Math.round(Math.sin(t * Math.PI * 3 + seed) * 10 + (rand() - 0.5) * 8);
    upper[i] = Math.max(deckBase + bump, ground[i] + 42);
  }
  // 再打一些碎洞
  for (let n = 0; n < 2 + Math.floor(rand() * 3); n++) {
    const a = Math.floor(COLS * (0.12 + rand() * 0.7));
    const w = 3 + Math.floor(rand() * 7);
    for (let i = a; i < Math.min(COLS, a + w); i++) upper[i] = 0;
  }
  // 偶发稍高平台段（仍比旧版矮）
  if (rand() > 0.35) {
    const a = Math.floor(COLS * (0.12 + rand() * 0.25));
    const b = Math.min(COLS - 1, a + 10 + Math.floor(rand() * 18));
    const y2 = deckBase + 14 + Math.floor(rand() * 22);
    for (let i = a; i <= b; i++) {
      if (ground[i] + 40 < y2) upper[i] = y2;
    }
  }

  return { seed, cols: COLS, colW: COL_W, ground, upper, worldW: WORLD_W, worldH: WORLD_H };
}

function terrainTopAt(terrain, x) {
  const i = Math.max(0, Math.min(terrain.cols - 1, Math.floor(x / terrain.colW)));
  const g = terrain.ground[i] || 0;
  const u = terrain.upper[i] || 0;
  const groundTop = WORLD_H - g;
  if (u > 0) {
    const upperTop = WORLD_H - u;
    const upperBottom = upperTop + 16;
    return { groundTop, upperTop, upperBottom, hasUpper: true };
  }
  return { groundTop, upperTop: null, upperBottom: null, hasUpper: false };
}

function settleTank(terrain, tank) {
  const tops = terrainTopAt(terrain, tank.x);
  // 已在上层或紧贴上层顶面 → 留在上层；否则落到地面
  const onUpper =
    tops.hasUpper &&
    tank.layer === 'upper' &&
    tank.y <= tops.upperBottom + 4 &&
    tank.y >= tops.upperTop - TANK_R - 6;
  if (onUpper || (tops.hasUpper && Math.abs(tank.y + TANK_R - tops.upperTop) < 10 && tank.layer === 'upper')) {
    tank.y = tops.upperTop - TANK_R;
    tank.layer = 'upper';
  } else if (tops.hasUpper && tank.y + TANK_R < tops.upperTop - 8) {
    // 仍在空中偏上但失去平台 → 掉到地面
    tank.y = tops.groundTop - TANK_R;
    tank.layer = 'ground';
  } else {
    tank.y = tops.groundTop - TANK_R;
    tank.layer = 'ground';
  }
  // 上层被打穿时掉下去
  if (tank.layer === 'upper' && !tops.hasUpper) {
    tank.y = tops.groundTop - TANK_R;
    tank.layer = 'ground';
  }
  tank.x = Math.max(TANK_R + 4, Math.min(WORLD_W - TANK_R - 4, tank.x));
}

function carveTerrain(terrain, cx, cy, radius, soft = TERRAIN_SOFT) {
  const r2 = radius * radius;
  const dig = Math.max(3, Math.round(soft));
  for (let i = 0; i < terrain.cols; i++) {
    const x = (i + 0.5) * terrain.colW;
    const dx = x - cx;
    if (dx * dx > r2) continue;
    const groundTop = WORLD_H - terrain.ground[i];
    const dyG = groundTop - cy;
    if (dx * dx + dyG * dyG <= r2) {
      terrain.ground[i] = Math.max(40, terrain.ground[i] - dig);
    }
    if (terrain.upper[i] > 0) {
      const upperTop = WORLD_H - terrain.upper[i];
      const dyU = upperTop - cy;
      if (dx * dx + dyU * dyU <= r2) {
        // 打穿缺口（轻伤炮弹更难打穿上层）
        if (Math.abs(dx) < radius * (soft < TERRAIN_SOFT * 0.6 ? 0.45 : 0.85)) {
          terrain.upper[i] = 0;
        }
      }
    }
  }
}

function alivePlayers(room) {
  return room.players.filter((p) => !p.dead && !p.fled);
}

function nextAliveIdx(room, from) {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = room.players[idx];
    if (!p.dead && !p.fled) return idx;
  }
  return from;
}

function applyTankStats(room, { fleeOnly = false } = {}) {
  if (!room || room.statsRecorded || room.status !== 'ended') return;
  room.statsRecorded = true;
  // 管理员测试局 / 人机局不记排行榜
  if (room.testMode || room.vsBot) return;
  const fleerIds = room.players
    .filter((p) => p.fled)
    .map((p) => Number(p.userId))
    .filter(Boolean);
  // 超时/逃跑导致终局：只记逃跑方，不给其余人胜/负
  if (fleeOnly) {
    recordArcadeResult({
      game: 'tank',
      winnerIds: [],
      loserIds: [],
      fleerIds,
    }).catch((e) => console.error('[tank stats]', e.message));
    return;
  }
  if (room.mode === MODE_TEAMS && room.winnerTeam != null) {
    const winT = Number(room.winnerTeam);
    const winnerIds = room.players
      .filter((p) => Number(p.team) === winT && !p.fled)
      .map((p) => Number(p.userId))
      .filter((id) => id > 0);
    const loserIds = room.players
      .filter((p) => Number(p.team) !== winT)
      .map((p) => Number(p.userId))
      .filter((id) => id > 0);
    recordArcadeResult({
      game: 'tank',
      winnerIds,
      loserIds,
      fleerIds,
    }).catch((e) => console.error('[tank stats]', e.message));
    return;
  }
  const winnerId = room.winnerId ? Number(room.winnerId) : null;
  const loserIds = room.players
    .map((p) => Number(p.userId))
    .filter((id) => id && id !== winnerId && id > 0);
  recordArcadeResult({
    game: 'tank',
    winnerIds: winnerId && winnerId > 0 ? [winnerId] : [],
    loserIds,
    fleerIds,
  }).catch((e) => console.error('[tank stats]', e.message));
}

function controlsPlayer(room, userId, p) {
  if (!p) return false;
  if (p.userId === userId) return true;
  return !!(room.testMode && p.controlledBy === userId);
}

function isRoomOwner(room, userId) {
  if (room.ownerId != null && room.ownerId === userId) return true;
  return room.players[0]?.userId === userId;
}

function checkWin(room, { fleeOnly = false } = {}) {
  const alive = alivePlayers(room);
  if (room.mode === MODE_TEAMS) {
    const teamsLeft = new Set(alive.map((p) => Number(p.team)));
    if (teamsLeft.size > 1) return false;
    room.status = 'ended';
    room.phase = 'ended';
    if (teamsLeft.size === 1) {
      const winTeam = [...teamsLeft][0];
      room.winnerTeam = winTeam;
      room.winnerId = alive[0]?.userId ?? null;
      const names = alive.map((p) => p.nickname).join('、');
      room.message = fleeOnly
        ? `${TEAM_NAMES[winTeam]} 留下（${names}）`
        : `${TEAM_NAMES[winTeam]} 获胜！（${names}）`;
    } else {
      room.winnerTeam = null;
      room.winnerId = null;
      room.message = '两队皆灭';
    }
    clearTurnTimer(room);
    applyTankStats(room, { fleeOnly });
    return true;
  }
  if (alive.length <= 1) {
    room.status = 'ended';
    room.phase = 'ended';
    room.winnerTeam = null;
    if (alive.length === 1) {
      room.winnerId = alive[0].userId;
      room.message = fleeOnly
        ? `${alive[0].nickname} 为最后留下的玩家`
        : `${alive[0].nickname} 获胜！`;
    } else {
      room.winnerId = null;
      room.message = '无人幸存';
    }
    clearTurnTimer(room);
    applyTankStats(room, { fleeOnly });
    return true;
  }
  return false;
}

/** 风力：0 最常见，级别越高概率越低，范围约 -11..11 */
function rollWind() {
  const max = 11;
  let total = 0;
  const weights = [];
  for (let k = 0; k <= max; k++) {
    // (max+1-k)^2 → |风|=0 权重最大，|风|=11 最小
    const w = (max + 1 - k) * (max + 1 - k);
    weights.push(w);
    total += w;
  }
  let r = Math.random() * total;
  let mag = 0;
  for (let k = 0; k <= max; k++) {
    r -= weights[k];
    if (r <= 0) {
      mag = k;
      break;
    }
  }
  if (mag === 0) return 0;
  return (Math.random() < 0.5 ? -1 : 1) * mag;
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
}

function beginTurn(room) {
  clearTurnTimer(room);
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  const p = room.players[room.turnIdx];
  if (!p || p.dead || p.fled) {
    room.turnIdx = nextAliveIdx(room, room.turnIdx);
  }
  const cur = room.players[room.turnIdx];
  const tt = getTankType(cur);
  cur.moveLeft = tt.moveBudget;
  room.phase = 'aim';
  room.wind = rollWind();
  room.shot = null;
  if (cur.isBot) {
    room.turnEndsAt = now() + 20000;
    room.message = `${cur.nickname}（${tt.name}）思考中 · 风 ${room.wind > 0 ? '→' : room.wind < 0 ? '←' : '·'}${Math.abs(room.wind)}`;
    room.botTimer = setTimeout(() => runTankBot(room), 700 + Math.random() * 900);
    return;
  }
  room.turnEndsAt = now() + TURN_MS;
  room.message = `${cur.nickname}（${tt.name}）的回合 · 风 ${room.wind > 0 ? '→' : room.wind < 0 ? '←' : '·'}${Math.abs(room.wind)}`;
  room.turnTimer = setTimeout(() => {
    if (room.status !== 'playing' || room.phase !== 'aim') return;
    const timed = room.players[room.turnIdx];
    if (!timed || timed.dead || timed.fled || timed.isBot) return;
    timed.dead = true;
    timed.fled = true;
    room.message = `${timed.nickname} 超过 60 秒未操作，视为逃跑`;
    clearTurnTimer(room);
    if (checkWin(room, { fleeOnly: true })) {
      broadcast(room);
      return;
    }
    advanceTurn(room);
    broadcast(room);
  }, TURN_MS);
}

function advanceTurn(room) {
  if (checkWin(room)) return;
  room.turnIdx = nextAliveIdx(room, room.turnIdx);
  beginTurn(room);
}

function publicState(room, forUserId, { withTerrain = false } = {}) {
  const turnP = room.players[room.turnIdx];
  const youCanAct =
    room.status === 'playing' &&
    room.phase === 'aim' &&
    controlsPlayer(room, forUserId, turnP);
  let you = room.players.findIndex((p) => p.userId === forUserId);
  if (room.testMode && controlsPlayer(room, forUserId, turnP)) {
    you = room.turnIdx;
  } else if (you < 0 && room.testMode) {
    you = room.players.findIndex((p) => controlsPlayer(room, forUserId, p));
  }
  const inLobby = room.status === 'lobby' || room.status === 'waiting';
  const sendTerrain = withTerrain || room._forceTerrain || inLobby || room.status === 'ended';
  const state = {
    id: room.id,
    status: room.status,
    phase: room.phase,
    turnIdx: room.turnIdx,
    wind: room.wind,
    turnEndsAt: room.turnEndsAt,
    message: room.message,
    winnerId: room.winnerId,
    winnerTeam: room.winnerTeam,
    mode: room.mode || MODE_FFA,
    testMode: !!room.testMode,
    vsBot: !!room.vsBot,
    botDiff: room.botDiff || null,
    youCanAct,
    terrainRev: room.terrainRev || 0,
    shot: room.shot,
    players: room.players.map((p, idx) => {
      const mine = controlsPlayer(room, forUserId, p);
      const tt = getTankType(p);
      return {
        userId: p.userId,
        nickname: p.nickname,
        student_id: p.student_id,
        color: p.color,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        angle: p.angle,
        facing: p.facing,
        hp: p.hp,
        dead: p.dead,
        fled: p.fled,
        layer: p.layer,
        moveLeft: mine && (room.testMode ? idx === room.turnIdx || room.status === 'lobby' : true) ? p.moveLeft : undefined,
        connected: !!p.ws && !p.discAt,
        isMe: mine,
        seat: idx,
        puppet: !!p.controlledBy,
        isBot: !!p.isBot,
        team: p.team,
        teamName: p.team == null ? null : TEAM_NAMES[Number(p.team)] || null,
        tankType: tt.id,
        tankName: tt.name,
        hpMax: tt.hpMax,
      };
    }),
    you,
    maxPlayers: roomCap(room),
    hpMax: HP_MAX,
  };
  if (sendTerrain && room.terrain) {
    state.terrain = {
      cols: room.terrain.cols,
      colW: room.terrain.colW,
      ground: room.terrain.ground,
      upper: room.terrain.upper,
      worldW: room.terrain.worldW,
      worldH: room.terrain.worldH,
      seed: room.terrain.seed,
      rev: room.terrainRev || 0,
    };
  }
  // 大厅才带品种列表，对局中省带宽
  if (inLobby) {
    state.tankTypes = tankTypesPublic();
    state.botDiffs = botDiffPublic();
  }
  return state;
}

function broadcast(room, opts = {}) {
  /** 测试房多座位共用同一连接，按 ws 去重 */
  const byWs = new Map();
  for (const p of room.players) {
    if (!p.ws) continue;
    const viewerId = room.testMode ? room.ownerId : p.userId;
    if (!byWs.has(p.ws)) byWs.set(p.ws, viewerId);
  }
  const withTerrain = !!opts.withTerrain || !!room._forceTerrain;
  for (const [sock, viewerId] of byWs) {
    send(sock, { type: 'state', state: publicState(room, viewerId, { withTerrain }) });
  }
  if (room._forceTerrain) room._forceTerrain = false;
}

function muzzleSpeed(power) {
  // 非线性：后段收力，满力拉远但仍是弧线，不会近似直线
  const p = Math.max(5, Math.min(100, Number(power) || 50));
  const t = p / 100;
  const curved = Math.pow(t, 0.72) * 0.82 + t * 0.1;
  return POWER_BASE + curved * 100 * POWER_GAIN;
}

function simulateShot(room, shooter, power) {
  const ang = (shooter.angle * Math.PI) / 180;
  const facing = shooter.facing >= 0 ? 1 : -1;
  const speed = muzzleSpeed(power) * getTankType(shooter).rangeMult;
  let vx = Math.cos(ang) * speed * facing;
  // angle 0 = flat right relative to facing; 90 = straight up
  let vy = -Math.sin(ang) * speed;
  let x = shooter.x + facing * (TANK_R + 3) * Math.cos(ang);
  let y = shooter.y - Math.sin(ang) * (TANK_R + 3);
  const path = [{ x, y }];
  const windAccel = room.wind * 0.0065;
  let hit = null;

  for (let step = 0; step < 2400; step++) {
    vx = (vx + windAccel) * AIR_DRAG;
    vy = vy * AIR_DRAG + GRAVITY;
    x += vx;
    y += vy;
    path.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });

    if (x < -20 || x > WORLD_W + 20 || y > WORLD_H + 40) {
      hit = { type: 'oob', x, y };
      break;
    }

    const tops = terrainTopAt(room.terrain, x);
    // 撞上层板（从上方或侧面）
    if (tops.hasUpper && y >= tops.upperTop && y <= tops.upperBottom && vy >= 0) {
      hit = { type: 'terrain', x, y, layer: 'upper' };
      break;
    }
    if (tops.hasUpper && y >= tops.upperTop && y <= tops.upperBottom && Math.abs(vy) < 1.2) {
      hit = { type: 'terrain', x, y, layer: 'upper' };
      break;
    }
    // 撞地面
    if (y >= tops.groundTop) {
      hit = { type: 'terrain', x, y, layer: 'ground' };
      break;
    }

    for (const p of room.players) {
      if (p.dead || p.fled || p.userId === shooter.userId) continue;
      if (!isEnemy(room, shooter, p)) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= (TANK_R + 4) * (TANK_R + 4)) {
        hit = { type: 'tank', x, y, targetId: p.userId };
        break;
      }
    }
    if (hit) break;
  }

  if (!hit) hit = { type: 'oob', x, y };
  // 保证落点在路径末尾
  const last = path[path.length - 1];
  if (!last || last.x !== hit.x || last.y !== hit.y) {
    path.push({ x: Math.round(hit.x * 10) / 10, y: Math.round(hit.y * 10) / 10 });
  }
  // 均匀降采样，保留更多帧（约 60fps 观感），末点必须是命中点
  const MAX_PTS = 480;
  let out = path;
  if (path.length > MAX_PTS) {
    const slim = [];
    const lastIdx = path.length - 1;
    for (let i = 0; i < MAX_PTS - 1; i++) {
      const idx = Math.round((i / (MAX_PTS - 1)) * lastIdx);
      slim.push(path[idx]);
    }
    slim.push(path[lastIdx]);
    out = slim;
  }
  // 播放时长：偏慢方便看弧线，且与客户端约定一致
  const durationMs = Math.min(14000, Math.max(2200, Math.round(out.length * 22)));
  return { path: out, hit, power, durationMs };
}

function tryShot(room, shooter, angle, power, facing) {
  const saved = { angle: shooter.angle, facing: shooter.facing };
  shooter.angle = angle;
  shooter.facing = facing;
  const result = simulateShot(room, shooter, power);
  shooter.angle = saved.angle;
  shooter.facing = saved.facing;
  return result;
}

function pickTankBotAim(room, shooter, diff) {
  const targets = room.players.filter(
    (p) => !p.dead && !p.fled && isEnemy(room, shooter, p)
  );
  if (!targets.length) return { angle: 45, power: 55, facing: shooter.facing || 1 };

  let bestHit = null;
  let bestNear = null;
  const angleStep = diff.perfect ? 1 : 3;
  const powerStep = diff.perfect ? 2 : 5;

  for (const target of targets) {
    const facing = target.x >= shooter.x ? 1 : -1;
    for (let angle = 5; angle <= 88; angle += angleStep) {
      for (let power = 12; power <= 100; power += powerStep) {
        const result = tryShot(room, shooter, angle, power, facing);
        const hit = result.hit;
        if (hit?.type === 'tank' && hit.targetId === target.userId) {
          const cand = { angle, power, facing, dist: 0 };
          if (!bestHit || Math.abs(power - 55) < Math.abs(bestHit.power - 55)) bestHit = cand;
          if (diff.perfect) return bestHit;
        }
        if (hit && hit.type !== 'oob') {
          const dx = hit.x - target.x;
          const dy = hit.y - target.y;
          const dist = dx * dx + dy * dy;
          if (!bestNear || dist < bestNear.dist) {
            bestNear = { angle, power, facing, dist };
          }
        }
      }
    }
  }

  let pick = bestHit || bestNear || { angle: 45, power: 60, facing: shooter.facing || 1 };

  if (diff.perfect) return pick;

  if (Math.random() < diff.tankMissChance) {
    pick = {
      angle: Math.max(5, Math.min(88, pick.angle + (Math.random() - 0.5) * 40)),
      power: Math.max(12, Math.min(100, pick.power + (Math.random() - 0.5) * 50)),
      facing: pick.facing,
    };
  } else {
    pick = {
      angle: Math.max(5, Math.min(88, pick.angle + (Math.random() - 0.5) * 2 * diff.tankAngleNoise)),
      power: Math.max(12, Math.min(100, pick.power + (Math.random() - 0.5) * 2 * diff.tankPowerNoise)),
      facing: pick.facing,
    };
  }
  return pick;
}

function executeFire(room, actor, power) {
  clearTurnTimer(room);
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
  const pwr = Math.max(5, Math.min(100, Number(power) || 50));
  room.phase = 'flying';
  const result = simulateShot(room, actor, pwr);
  const durationMs = result.durationMs || Math.min(14000, Math.max(2200, result.path.length * 22));
  room.pendingBlast = {
    x: result.hit.x,
    y: result.hit.y,
    shooterId: actor.userId,
    directTargetId: result.hit.type === 'tank' ? result.hit.targetId : null,
    blastR: getTankType(actor).blastR,
  };
  room.shot = {
    path: result.path,
    hit: result.hit,
    power: pwr,
    shooterId: actor.userId,
    damaged: [],
    durationMs,
    blastR: getTankType(actor).blastR,
    tankType: getTankType(actor).id,
  };
  room.message = `${actor.nickname}（${getTankType(actor).name}）开火！力度 ${Math.round(pwr)}`;
  broadcast(room);

  setTimeout(() => {
    if (room.status !== 'playing') return;
    if (room.pendingBlast) {
      const blast = room.pendingBlast;
      room.pendingBlast = null;
      const damaged = applyBlast(room, blast.x, blast.y, blast.shooterId, {
        directTargetId: blast.directTargetId,
      });
      if (room.shot) room.shot = { ...room.shot, damaged };
      broadcast(room);
    }
    setTimeout(() => {
      if (room.status !== 'playing') return;
      room.shot = null;
      if (!checkWin(room)) {
        advanceTurn(room);
      }
      broadcast(room);
    }, 320);
  }, durationMs);
}

function runTankBot(room) {
  if (!room || room.status !== 'playing' || room.phase !== 'aim') return;
  const actor = room.players[room.turnIdx];
  if (!actor?.isBot || actor.dead || actor.fled) return;
  const diff = normalizeBotDiff(room.botDiff);
  const aim = pickTankBotAim(room, actor, diff);
  actor.facing = aim.facing;
  actor.angle = aim.angle;
  room.message = `${actor.nickname} 瞄准 ${Math.round(aim.angle)}° · 力度 ${Math.round(aim.power)}`;
  broadcast(room);
  setTimeout(() => {
    if (room.status !== 'playing' || room.phase !== 'aim') return;
    if (room.players[room.turnIdx] !== actor) return;
    executeFire(room, actor, aim.power);
  }, 450);
}

function applyBlast(room, cx, cy, shooterId, opts = {}) {
  const shooter = room.players.find((p) => p.userId === shooterId);
  const st = getTankType(shooter);
  const blastR = st.blastR;
  const maxDmg = st.maxDmg;
  const directId = opts.directTargetId;
  const damaged = [];
  let lifeStolen = 0;
  for (const p of room.players) {
    if (p.dead || p.fled) continue;
    // 团队战：队友不受爆炸伤害（自伤仍算）
    if (shooter && p.userId !== shooterId && !isEnemy(room, shooter, p)) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > blastR + TANK_R) continue;
    const falloff = 1 - dist / (blastR + TANK_R);
    let dmg = Math.round(maxDmg * falloff * falloff);
    if (directId != null && p.userId === directId) {
      dmg = Math.round(dmg * st.directMult);
    }
    const vt = getTankType(p);
    dmg = Math.round(dmg * vt.damageTakenMult);
    if (p.userId === shooterId) dmg = Math.round(dmg * 0.35); // 自伤减轻
    // 玻璃：打到别人一炮死；被别人打到也一炮死（自伤仍按上面减轻）
    if (dmg >= 1 && p.userId !== shooterId) {
      if (st.oneshotHit || vt.oneshotTaken) dmg = p.hp;
    }
    if (dmg < 1) continue;
    const dealt = Math.min(dmg, p.hp);
    p.hp = Math.max(0, p.hp - dmg);
    damaged.push({ userId: p.userId, dmg, hp: p.hp });
    if (p.userId !== shooterId && st.lifesteal > 0) {
      lifeStolen += dealt;
    }
    if (p.hp <= 0) {
      p.dead = true;
      room.message = `${p.nickname} 被击毁`;
    }
  }
  // 吸血：按对敌人造成的实际伤害回血，不超过自身血量上限（不可溢出）
  if (shooter && !shooter.dead && !shooter.fled && st.lifesteal > 0 && lifeStolen > 0) {
    const heal = Math.round(lifeStolen * st.lifesteal);
    if (heal > 0) {
      const cap = Number(shooter.hpMax) || st.hpMax;
      const before = shooter.hp;
      shooter.hp = Math.min(cap, before + heal);
      const gained = shooter.hp - before;
      if (gained > 0) {
        damaged.push({ userId: shooter.userId, dmg: -gained, hp: shooter.hp, heal: gained });
        if (!room.message?.includes('被击毁')) {
          room.message = `${shooter.nickname} 吸血回复 ${gained} 点`;
        }
      }
    }
  }
  const carveR = blastR * 0.7 * (st.terrainRadiusMult ?? 1);
  const soft = TERRAIN_SOFT * (st.terrainSoftMult ?? 1);
  carveTerrain(room.terrain, cx, cy, carveR, soft);
  room.terrainRev = (room.terrainRev || 0) + 1;
  room._forceTerrain = true;
  // 地形变化后重新沉降存活坦克
  for (const p of room.players) {
    if (!p.dead && !p.fled) settleTank(room.terrain, p);
  }
  return damaged;
}

function prune() {
  const t = now();
  for (const [id, r] of rooms) {
    for (const p of r.players) {
      if (p.discAt && t - p.discAt > RECONNECT_MS) {
        p.ws = null;
        if (r.status === 'playing' && !p.dead && !p.fled) {
          p.fled = true;
          p.dead = true;
          r.message = `${p.nickname} 断线超时，视为逃跑`;
          if (r.phase === 'aim' && r.players[r.turnIdx] === p) {
            if (!checkWin(r, { fleeOnly: true })) advanceTurn(r);
          } else {
            checkWin(r, { fleeOnly: true });
          }
          broadcast(r);
        }
      }
    }
    if (t - r.lastActive > ROOM_TTL_MS || (r.status === 'ended' && t - r.lastActive > 60_000)) {
      clearTurnTimer(r);
      for (const p of r.players) {
        try {
          p.ws?.close?.();
        } catch {
          /* ignore */
        }
      }
      rooms.delete(id);
    }
  }
}

export function listWaitingRooms() {
  prune();
  const out = [];
  for (const r of rooms.values()) {
    if (r.status === 'lobby' && !r.testMode && !r.vsBot) {
      out.push({
        id: r.id,
        hostName: r.players[0]?.nickname || '房主',
        count: r.players.length,
        max: roomCap(r),
        mode: r.mode || MODE_FFA,
        modeLabel: r.mode === MODE_TEAMS ? '2v2' : '混战',
        createdAt: r.createdAt,
      });
    }
  }
  return out.slice(0, 20);
}

export function stats() {
  prune();
  return { rooms: rooms.size, max: MAX_ROOMS };
}

function makePlayer(user, ws, seat, tankType = 'default', team = null) {
  const tt = TANK_TYPES[tankType] || TANK_TYPES.default;
  return {
    userId: user.id,
    nickname: user.nickname || user.student_id,
    student_id: user.student_id,
    controlledBy: null,
    ws,
    color: COLORS[seat % COLORS.length],
    team,
    x: 0,
    y: 0,
    angle: 45,
    facing: seat % 2 === 0 ? 1 : -1,
    tankType: tt.id,
    hp: tt.hpMax,
    dead: false,
    fled: false,
    layer: 'ground',
    moveLeft: tt.moveBudget,
    discAt: 0,
  };
}

function makePuppet(owner, ws, seat, tankType = 'default') {
  // 测试房随机车体不含全解放（需手动点选）
  const types = Object.keys(TANK_TYPES).filter((id) => !ADMIN_ONLY_TANK.has(id));
  const tt = TANK_TYPES[tankType] || TANK_TYPES[types[seat % types.length]] || TANK_TYPES.default;
  return {
    userId: -(4100 + seat),
    nickname: `测试${seat + 1}`,
    student_id: `test${seat + 1}`,
    controlledBy: owner.id,
    ws,
    color: COLORS[seat % COLORS.length],
    team: null,
    x: 0,
    y: 0,
    angle: 45,
    facing: seat % 2 === 0 ? 1 : -1,
    tankType: tt.id,
    hp: tt.hpMax,
    dead: false,
    fled: false,
    layer: 'ground',
    moveLeft: tt.moveBudget,
    discAt: 0,
  };
}

function bindWsToControlled(room, userId, ws) {
  for (const p of room.players) {
    if (controlsPlayer(room, userId, p)) {
      try {
        if (p.ws && p.ws !== ws) p.ws.close?.();
      } catch {
        /* ignore */
      }
      p.ws = ws;
      p.discAt = 0;
    }
  }
}

function makeBotPlayer(diff, seat = 1) {
  // 普通 yjz → 默认车；全解放 yjz → 全解放车（难度与车体分开）
  const want = diff.tankType && TANK_TYPES[diff.tankType] ? diff.tankType : 'default';
  const tt = TANK_TYPES[want] || TANK_TYPES.default;
  return {
    userId: -(5200 + seat),
    nickname: diff.label,
    student_id: `bot_${diff.id}`,
    controlledBy: null,
    isBot: true,
    ws: null,
    color: COLORS[seat % COLORS.length],
    team: null,
    x: 0,
    y: 0,
    angle: 45,
    facing: -1,
    tankType: tt.id,
    hp: tt.hpMax,
    dead: false,
    fled: false,
    layer: 'ground',
    moveLeft: tt.moveBudget,
    discAt: 0,
  };
}

export function createRoom(ws, user, mode = MODE_FFA) {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    send(ws, { type: 'error', error: '房间已满，请稍后再试' });
    return null;
  }
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();
  const m = normalizeMode(mode);
  const room = {
    id,
    status: 'lobby',
    phase: 'lobby',
    createdAt: now(),
    lastActive: now(),
    turnIdx: 0,
    wind: 0,
    turnEndsAt: 0,
    turnTimer: null,
    botTimer: null,
    terrain: null,
    shot: null,
    mode: m,
    message: '',
    winnerId: null,
    winnerTeam: null,
    statsRecorded: false,
    testMode: false,
    vsBot: false,
    botDiff: null,
    ownerId: user.id,
    players: [makePlayer(user, ws, 0, 'default', m === MODE_TEAMS ? 0 : null)],
  };
  rebalanceTeams(room);
  room.message = lobbyHint(room);
  rooms.set(id, room);
  ws._tankRoomId = id;
  ws._tankIntentionalLeave = false;
  send(ws, { type: 'state', state: publicState(room, user.id) });
  return room;
}

/** 人机对战：房间大厅形式（选坦克后点开始），不记排行榜、不出现在玩家房列表 */
export function createBotRoom(ws, user, difficulty = 'normal') {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    send(ws, { type: 'error', error: '房间已满，请稍后再试' });
    return null;
  }
  const diff = normalizeBotDiff(difficulty);
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();
  const human = makePlayer(user, ws, 0);
  const bot = makeBotPlayer(diff, 1);
  const room = {
    id,
    status: 'lobby',
    phase: 'lobby',
    createdAt: now(),
    lastActive: now(),
    turnIdx: 0,
    wind: 0,
    turnEndsAt: 0,
    turnTimer: null,
    botTimer: null,
    terrain: null,
    shot: null,
    mode: MODE_FFA,
    message: `人机房间 · ${diff.name} · 选好坦克后点开始`,
    winnerId: null,
    winnerTeam: null,
    statsRecorded: false,
    testMode: false,
    vsBot: true,
    botDiff: diff.id,
    ownerId: user.id,
    players: [human, bot],
  };
  rooms.set(id, room);
  ws._tankRoomId = id;
  ws._tankIntentionalLeave = false;
  send(ws, { type: 'state', state: publicState(room, user.id) });
  return room;
}

/** 管理员测试房：一人操控多个测试坦克，不记战绩、不出现在大厅列表 */
export function createTestRoom(ws, user, count = 2) {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    send(ws, { type: 'error', error: '房间已满，请稍后再试' });
    return null;
  }
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS_TEST, Number(count) || 2));
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();
  const players = [];
  for (let i = 0; i < n; i++) players.push(makePuppet(user, ws, i));
  const room = {
    id,
    status: 'lobby',
    phase: 'lobby',
    createdAt: now(),
    lastActive: now(),
    turnIdx: 0,
    wind: 0,
    turnEndsAt: 0,
    turnTimer: null,
    botTimer: null,
    terrain: null,
    shot: null,
    mode: MODE_FFA,
    message: `管理员测试模式 · ${n} 辆坦克，点开始即可独自轮流操控`,
    winnerId: null,
    winnerTeam: null,
    statsRecorded: false,
    testMode: true,
    vsBot: false,
    botDiff: null,
    ownerId: user.id,
    players,
  };
  rooms.set(id, room);
  ws._tankRoomId = id;
  ws._tankIntentionalLeave = false;
  send(ws, { type: 'state', state: publicState(room, user.id) });
  return room;
}

export function joinRoom(ws, user, roomId) {
  prune();
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room || room.status === 'ended') {
    send(ws, { type: 'error', error: '房间不存在或已结束' });
    return null;
  }
  if (room.testMode) {
    send(ws, { type: 'error', error: '测试房不可加入' });
    return null;
  }
  if (room.vsBot) {
    send(ws, { type: 'error', error: '人机房不能加入' });
    return null;
  }
  if (room.status !== 'lobby') {
    send(ws, { type: 'error', error: '对局已开始，请用重连' });
    return null;
  }
  if (room.players.some((p) => p.userId === user.id)) {
    send(ws, { type: 'error', error: '你已在房间中' });
    return null;
  }
  if (room.players.length >= roomCap(room)) {
    send(ws, {
      type: 'error',
      error: room.mode === MODE_TEAMS ? '2v2 房间已满（4 人）' : '房间已满（最多 5 人）',
    });
    return null;
  }
  const seat = room.players.length;
  room.players.push(
    makePlayer(user, ws, seat, 'default', room.mode === MODE_TEAMS ? assignTeamSeat(room, seat) : null)
  );
  rebalanceTeams(room);
  ws._tankRoomId = id;
  ws._tankIntentionalLeave = false;
  room.lastActive = now();
  room.message = `${user.nickname || user.student_id} 加入了房间 · ${lobbyHint(room)}`;
  if (room.status === 'playing') room._forceTerrain = true;
  broadcast(room);
  return room;
}

export function rejoinRoom(ws, user, roomId) {
  prune();
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room || room.status === 'ended') {
    send(ws, { type: 'error', error: '对局已结束' });
    return null;
  }
  const inRoom =
    room.players.some((x) => x.userId === user.id) ||
    (room.testMode && room.ownerId === user.id) ||
    room.players.some((x) => x.controlledBy === user.id);
  if (!inRoom) {
    send(ws, { type: 'error', error: '你不在此房间' });
    return null;
  }
  bindWsToControlled(room, user.id, ws);
  ws._tankRoomId = id;
  ws._tankIntentionalLeave = false;
  room.lastActive = now();
  room.message = `${user.nickname || user.student_id} 已重连`;
  if (room.status === 'playing') room._forceTerrain = true;
  broadcast(room);
  return room;
}

export function disconnectRoom(ws) {
  if (ws._tankIntentionalLeave) {
    leaveRoom(ws);
    return;
  }
  const id = ws._tankRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) {
    ws._tankRoomId = null;
    return;
  }
  const linked = room.players.filter((x) => x.ws === ws);
  if (!linked.length) return;
  const t = now();
  for (const p of linked) {
    p.ws = null;
    p.discAt = t;
  }
  ws._tankRoomId = null;
  room.lastActive = t;
  room.message = `${linked[0].nickname} 断线，等待重连…`;
  broadcast(room);
  if (room.status === 'lobby' && room.players.every((x) => !x.ws)) {
    clearTurnTimer(room);
    rooms.delete(id);
  }
}

export function leaveRoom(ws) {
  const id = ws._tankRoomId;
  if (!id) return;
  const room = rooms.get(id);
  ws._tankRoomId = null;
  if (!room) return;
  room.lastActive = now();

  // 测试房 / 人机房：主人离开即整房解散
  if (room.testMode || room.vsBot) {
    clearTurnTimer(room);
    for (const p of room.players) {
      p.ws = null;
    }
    rooms.delete(id);
    return;
  }

  const pIdx = room.players.findIndex((p) => p.ws === ws);
  if (pIdx < 0) return;
  const p = room.players[pIdx];

  if (room.status === 'lobby') {
    room.players.splice(pIdx, 1);
    if (!room.players.length) {
      clearTurnTimer(room);
      rooms.delete(id);
      return;
    }
    rebalanceTeams(room);
    room.message = `${p.nickname} 离开了 · ${lobbyHint(room)}`;
    broadcast(room);
    return;
  }

  if (room.status === 'playing' && !p.dead && !p.fled) {
    p.fled = true;
    p.dead = true;
    p.ws = null;
    room.message = `${p.nickname} 逃跑了`;
    if (room.turnIdx === pIdx) {
      if (!checkWin(room, { fleeOnly: true })) advanceTurn(room);
    } else {
      checkWin(room, { fleeOnly: true });
    }
    broadcast(room);
    return;
  }
  p.ws = null;
  broadcast(room);
}

function placeTank(room, p, xHint, wantUpper) {
  p.x = xHint;
  p.y = WORLD_H;
  p.layer = 'ground';
  for (let k = 0; k < 20; k++) {
    const tops = terrainTopAt(room.terrain, p.x);
    if (wantUpper && tops.hasUpper) {
      p.y = tops.upperTop - TANK_R;
      p.layer = 'upper';
      break;
    }
    if (!wantUpper || !tops.hasUpper) {
      p.y = tops.groundTop - TANK_R;
      p.layer = 'ground';
      if (tops.groundTop < WORLD_H - 45) break;
    }
    p.x += wantUpper ? -14 : 14;
    p.x = Math.max(TANK_R + 4, Math.min(WORLD_W - TANK_R - 4, p.x));
  }
  settleTank(room.terrain, p);
}

function startGame(room) {
  room.terrain = generateTerrain();
  room.terrainRev = 1;
  room._forceTerrain = true;
  room.status = 'playing';
  room.statsRecorded = false;
  room.winnerId = null;
  room.winnerTeam = null;
  if (room.mode === MODE_TEAMS) rebalanceTeams(room);
  const n = room.players.length;
  const margin = 80;

  if (room.mode === MODE_TEAMS) {
    const byTeam = [[], []];
    for (const p of room.players) byTeam[Number(p.team) === 1 ? 1 : 0].push(p);
    for (let t = 0; t < 2; t++) {
      const side = byTeam[t];
      for (let i = 0; i < side.length; i++) {
        const p = side[i];
        const tt = getTankType(p);
        p.tankType = tt.id;
        p.hp = tt.hpMax;
        p.dead = false;
        p.fled = false;
        p.angle = 45;
        p.facing = t === 0 ? 1 : -1;
        // 红队左侧、蓝队右侧；同队上下错开
        const base = t === 0 ? margin + 40 : WORLD_W - margin - 40;
        const spread = (i - (side.length - 1) / 2) * 70;
        placeTank(room, p, base + (t === 0 ? spread : -spread), i % 2 === 1);
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const p = room.players[i];
      const tt = getTankType(p);
      p.tankType = tt.id;
      p.hp = tt.hpMax;
      p.dead = false;
      p.fled = false;
      p.angle = 45;
      p.facing = i < n / 2 ? 1 : -1;
      const x = margin + ((WORLD_W - margin * 2) * i) / Math.max(1, n - 1);
      placeTank(room, p, x, i % 2 === 1);
    }
  }
  room.turnIdx = 0;
  beginTurn(room);
}

export function handleMsg(ws, user, msg) {
  const id = ws._tankRoomId;
  if (!id) {
    send(ws, { type: 'error', error: '不在房间中' });
    return;
  }
  const room = rooms.get(id);
  if (!room) {
    send(ws, { type: 'error', error: '房间不存在' });
    return;
  }
  const inRoom =
    room.players.some((p) => controlsPlayer(room, user.id, p)) ||
    (room.testMode && room.ownerId === user.id);
  if (!inRoom) {
    send(ws, { type: 'error', error: '你不在此房间' });
    return;
  }
  room.lastActive = now();

  try {
    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 80);
      if (!text) return;
      const fromName = user.nickname || user.student_id || '玩家';
      const label = room.testMode ? `${fromName}(测试)` : fromName;
      const payload = {
        type: 'chat',
        from: label,
        nickname: label,
        student_id: user.student_id || '',
        userId: user.id,
        text,
        at: now(),
      };
      const sent = new Set();
      for (const p of room.players) {
        if (!p.ws || sent.has(p.ws)) continue;
        sent.add(p.ws);
        send(p.ws, payload);
      }
      return;
    }

    if (msg.type === 'start') {
      if (!isRoomOwner(room, user.id)) throw new Error('只有房主可以开始');
      if (room.status !== 'lobby') throw new Error('已经开始了');
      if (room.mode === MODE_TEAMS) {
        if (room.players.length !== MAX_PLAYERS_TEAMS) {
          throw new Error('2v2 需要正好 4 人才能开始');
        }
        rebalanceTeams(room);
        const red = room.players.filter((p) => Number(p.team) === 0).length;
        const blue = room.players.filter((p) => Number(p.team) === 1).length;
        if (red !== 2 || blue !== 2) throw new Error('2v2 需要红蓝各 2 人');
      } else if (room.players.length < MIN_PLAYERS) {
        throw new Error(`至少 ${MIN_PLAYERS} 人才能开始`);
      }
      startGame(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'set_mode') {
      if (!isRoomOwner(room, user.id)) throw new Error('只有房主可以改模式');
      if (room.status !== 'lobby') throw new Error('对局已开始');
      if (room.testMode || room.vsBot) throw new Error('当前房间不能改模式');
      const next = normalizeMode(msg.mode);
      if (next === MODE_TEAMS && room.players.length > MAX_PLAYERS_TEAMS) {
        throw new Error('人数已超过 4，无法切到 2v2');
      }
      room.mode = next;
      rebalanceTeams(room);
      room.message = lobbyHint(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'set_team') {
      if (room.status !== 'lobby') throw new Error('对局已开始');
      if (room.mode !== MODE_TEAMS) throw new Error('仅 2v2 可选队伍');
      const team = Number(msg.team) === 1 ? 1 : 0;
      const me = room.players.find((p) => p.userId === user.id);
      if (!me) throw new Error('找不到你');
      const others = room.players.filter((p) => p !== me && Number(p.team) === team).length;
      if (others >= 2) throw new Error('该队已满（最多 2 人）');
      me.team = team;
      paintTeamColors(room);
      room.message = `${me.nickname} 加入${TEAM_NAMES[team]} · ${lobbyHint(room)}`;
      broadcast(room);
      return;
    }

    if (msg.type === 'set_test_count' && room.testMode) {
      if (!isRoomOwner(room, user.id)) throw new Error('只有房主可调整');
      if (room.status !== 'lobby') throw new Error('对局已开始');
      const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS_TEST, Number(msg.count) || 2));
      const prevTypes = room.players.map((p) => p.tankType);
      room.players = [];
      for (let i = 0; i < n; i++) room.players.push(makePuppet(user, ws, i, prevTypes[i] || undefined));
      room.message = `管理员测试模式 · ${n} 辆坦克`;
      broadcast(room);
      return;
    }

    if (msg.type === 'set_tank_type') {
      if (room.status !== 'lobby') throw new Error('对局开始后不能换车');
      const typeId = String(msg.tankType || 'default');
      if (!TANK_TYPES[typeId]) throw new Error('未知坦克品种');
      if (!canPickTankType(room, user, typeId)) {
        throw new Error('yjz（全解放）仅管理员可在玩家对战中使用');
      }
      let target = null;
      if (room.testMode && Number.isFinite(Number(msg.seat))) {
        target = room.players[Number(msg.seat)];
        if (!target || !controlsPlayer(room, user.id, target)) throw new Error('不能设置该坦克');
      } else {
        target = room.players.find((p) => p.userId === user.id);
        if (!target) throw new Error('找不到你的坦克');
      }
      const tt = TANK_TYPES[typeId];
      target.tankType = tt.id;
      target.hp = tt.hpMax;
      target.moveLeft = tt.moveBudget;
      room.message = `${target.nickname} 选择了 ${tt.name}`;
      broadcast(room);
      return;
    }

    const actIdx = room.turnIdx;
    const actor = room.players[actIdx];
    if (!actor) throw new Error('无效回合');

    if (!controlsPlayer(room, user.id, actor)) {
      throw new Error('还没轮到你操控的坦克');
    }
    if (actor.dead || actor.fled) {
      if (msg.type !== 'chat') throw new Error('当前坦克已被淘汰');
      return;
    }

    if (room.status !== 'playing' || room.phase !== 'aim') {
      throw new Error('当前不能操作');
    }

    if (msg.type === 'aim') {
      const angle = Number(msg.angle);
      if (Number.isFinite(angle)) actor.angle = Math.max(0, Math.min(90, angle));
      if (msg.facing === -1 || msg.facing === 1) actor.facing = msg.facing;
      broadcast(room);
      return;
    }

    if (msg.type === 'move') {
      const dir = msg.dir === -1 || msg.dir === 'left' ? -1 : 1;
      const step = Math.min(14, actor.moveLeft || 0);
      if (step <= 0) throw new Error('本回合移动力已用完');
      actor.x += dir * step;
      actor.facing = dir;
      actor.moveLeft = Math.max(0, (actor.moveLeft || 0) - step);
      settleTank(room.terrain, actor);
      broadcast(room);
      return;
    }

    if (msg.type === 'fire') {
      if (actor.isBot) throw new Error('不能替人机开火');
      executeFire(room, actor, msg.power);
      return;
    }

    if (msg.type === 'skip') {
      clearTurnTimer(room);
      room.message = `${actor.nickname} 跳过回合`;
      advanceTurn(room);
      broadcast(room);
    }
  } catch (e) {
    send(ws, { type: 'error', error: e.message || '操作失败' });
  }
}

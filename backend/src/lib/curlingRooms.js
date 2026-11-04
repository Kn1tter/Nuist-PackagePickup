/**
 * 冰壶联机：1v1 / 混战(3–4) / 2v2 团队。
 * 服务端权威投掷与计分。
 */

import { recordArcadeResult } from './arcadeStats.js';
import { BOT_DIFFICULTIES, botDiffPublic, normalizeBotDiff } from './botDiff.js';
import {
  BUTTON,
  HOUSE_RINGS,
  WORLD_H,
  WORLD_W,
  scoreEnd,
  simulateThrow,
  distToButton,
  HOG_LINE,
  STONE_R,
} from './curlingPhysics.js';

const MAX_ROOMS = 8;
const ROOM_TTL_MS = 30 * 60 * 1000;
const RECONNECT_MS = 60 * 1000;
const TURN_MS = 55 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const MODE_DUEL = 'duel';
export const MODE_FFA = 'ffa';
export const MODE_TEAMS = 'teams';

const ENDS = {
  [MODE_DUEL]: 4,
  [MODE_FFA]: 3,
  [MODE_TEAMS]: 4,
};
const STONES_PER_PLAYER = {
  [MODE_DUEL]: 4,
  [MODE_FFA]: 2,
  [MODE_TEAMS]: 2,
};

const COLORS = ['#e85d4c', '#3b82c4', '#3fa86a', '#c9a227', '#9b59b6'];
const TEAM_NAMES = ['红队', '蓝队'];

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

function normalizeMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === MODE_TEAMS) return MODE_TEAMS;
  if (m === MODE_FFA) return MODE_FFA;
  return MODE_DUEL;
}

function roomCap(room) {
  if (room?.mode === MODE_TEAMS) return 4;
  if (room?.mode === MODE_FFA) return 4;
  return 2;
}

function roomMin(room) {
  if (room?.mode === MODE_TEAMS) return 4;
  if (room?.mode === MODE_FFA) return 3;
  return 2;
}

function lobbyHint(room) {
  if (room.vsBot) return room.message || '人机对战 · 1v1';
  const n = room.players.length;
  const max = roomCap(room);
  if (room.mode === MODE_TEAMS) {
    return n >= 4 ? '2v2 已满员，房主可以开始' : `2v2 · ${n}/4 · 红蓝各 2 人`;
  }
  if (room.mode === MODE_FFA) {
    return n >= max
      ? '混战已满员，房主可以开始'
      : `混战 · ${n}/${max} · 至少 3 人开局`;
  }
  return n >= 2 ? '1v1 已满员，房主可以开始' : `1v1 · ${n}/2`;
}

function paintColors(room) {
  if (room.mode === MODE_TEAMS) {
    for (const t of [0, 1]) {
      const mates = room.players.filter((p) => Number(p.team) === t);
      mates.forEach((p, idx) => {
        p.color = t === 0 ? (idx === 0 ? '#e85d4c' : '#f0a08f') : idx === 0 ? '#3b82c4' : '#8eb8e8';
      });
    }
    return;
  }
  room.players.forEach((p, i) => {
    p.color = COLORS[i % COLORS.length];
    p.team = null;
  });
}

function rebalanceTeams(room) {
  if (room.mode !== MODE_TEAMS) {
    for (const p of room.players) p.team = null;
    paintColors(room);
    return;
  }
  room.players.forEach((p, i) => {
    if (p.team !== 0 && p.team !== 1) p.team = i < 2 ? 0 : 1;
  });
  for (const t of [0, 1]) {
    const mates = room.players.filter((p) => Number(p.team) === t);
    while (mates.length > 2) {
      const extra = mates.pop();
      extra.team = t === 0 ? 1 : 0;
    }
  }
  paintColors(room);
}

function displayName(p) {
  return p?.nickname || p?.student_id || '玩家';
}

function publicPlayer(p, forUserId) {
  return {
    seat: p.seat,
    userId: p.userId,
    nickname: displayName(p),
    color: p.color,
    team: p.team,
    teamName: p.team === 0 || p.team === 1 ? TEAM_NAMES[p.team] : null,
    score: p.score || 0,
    fled: !!p.fled,
    online: !!p.ws || !!p.isBot,
    isMe: Number(p.userId) === Number(forUserId),
    isBot: !!p.isBot,
    isHost: p.seat === 0,
  };
}

function publicState(room, forUserId) {
  return {
    id: room.id,
    game: 'curling',
    mode: room.mode,
    modeLabel:
      room.mode === MODE_TEAMS ? '2v2' : room.mode === MODE_FFA ? '混战' : '1v1',
    status: room.status,
    phase: room.phase,
    message: room.message,
    vsBot: !!room.vsBot,
    botDiff: room.botDiff || null,
    botDiffLabel: room.botDiff ? botDiffPublic(room.botDiff)?.label || room.botDiff : null,
    maxPlayers: roomCap(room),
    minPlayers: roomMin(room),
    end: room.end || 0,
    maxEnds: room.maxEnds || ENDS[room.mode] || 4,
    stonesLeft: room.stonesLeft || {},
    throwOrder: room.throwOrder || [],
    throwIdx: room.throwIdx || 0,
    turnSeat: room.turnSeat,
    turnDeadline: room.turnDeadline || null,
    stones: room.stones || [],
    scores:
      room.mode === MODE_TEAMS
        ? { team0: room.teamScores?.[0] || 0, team1: room.teamScores?.[1] || 0 }
        : null,
    endLog: room.endLog || [],
    lastEnd: room.lastEnd || null,
    liveScore: room.liveScore || null,
    winnerId: room.winnerId || null,
    winnerTeam: room.winnerTeam ?? null,
    winnerIds: room.winnerIds || null,
    world: {
      w: WORLD_W,
      h: WORLD_H,
      button: BUTTON,
      houseRings: HOUSE_RINGS,
      hogLine: HOG_LINE,
      stoneR: STONE_R,
    },
    players: room.players.map((p) => publicPlayer(p, forUserId)),
    hostId: room.players[0]?.userId || null,
  };
}

function broadcast(room, extra = null) {
  for (const p of room.players) {
    if (!p.ws) continue;
    const payload = { type: 'state', state: publicState(room, p.userId) };
    if (extra) Object.assign(payload, extra);
    send(p.ws, payload);
  }
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function armTurnTimer(room) {
  clearTurnTimer(room);
  if (room.status !== 'playing' || room.phase !== 'aim') return;
  room.turnDeadline = now() + TURN_MS;
  room.turnTimer = setTimeout(() => {
    if (room.status !== 'playing' || room.phase !== 'aim') return;
    const p = room.players.find((x) => x.seat === room.turnSeat);
    room.message = `${displayName(p)} 超时，自动轻推`;
    doThrow(room, room.turnSeat, {
      power: 6.5,
      angleDeg: (Math.random() - 0.5) * 4,
      curl: (Math.random() - 0.5) * 0.4,
      aimY: BUTTON.y + (Math.random() - 0.5) * 40,
    });
  }, TURN_MS);
}

function prune() {
  const t = now();
  for (const [id, r] of rooms) {
    for (const p of r.players) {
      if (p.discAt && t - p.discAt > RECONNECT_MS && !p.isBot) {
        const wasPlaying = r.status === 'playing';
        p.fled = true;
        p.ws = null;
        p.discAt = 0;
        if (wasPlaying && !r.statsRecorded) {
          endByFlee(r, p);
        }
      }
    }
    const humans = r.players.filter((p) => !p.isBot && (p.ws || (p.discAt && t - p.discAt < RECONNECT_MS)));
    const empty = humans.length === 0;
    const stale = t - r.lastActive > ROOM_TTL_MS;
    const endedOld = r.status === 'ended' && t - r.lastActive > 90 * 1000;
    if (empty || stale || endedOld) {
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
    if (r.status !== 'waiting' && r.status !== 'lobby') continue;
    if (r.vsBot) continue;
    if (r.players.length >= roomCap(r)) continue;
    out.push({
      id: r.id,
      hostName: displayName(r.players[0]),
      mode: r.mode,
      modeLabel: r.mode === MODE_TEAMS ? '2v2' : r.mode === MODE_FFA ? '混战' : '1v1',
      count: r.players.length,
      max: roomCap(r),
      createdAt: r.createdAt,
    });
  }
  return out.slice(0, 20);
}

export function stats() {
  prune();
  let waiting = 0;
  let playing = 0;
  for (const r of rooms.values()) {
    if (r.status === 'playing') playing += 1;
    else if (r.status === 'waiting' || r.status === 'lobby') waiting += 1;
  }
  return { waiting, playing, rooms: rooms.size };
}

function findPlayer(room, userId) {
  return room.players.find((p) => Number(p.userId) === Number(userId));
}

function applyCurlingStats(room, { fleeOnly = false } = {}) {
  if (!room || room.statsRecorded) return;
  room.statsRecorded = true;
  if (room.vsBot) return;
  const fleerIds = room.players
    .filter((p) => p.fled && !p.isBot)
    .map((p) => Number(p.userId))
    .filter(Boolean);
  if (fleeOnly) {
    recordArcadeResult({
      game: 'curling',
      winnerIds: [],
      loserIds: [],
      fleerIds,
    }).catch((e) => console.error('[curling stats]', e.message));
    return;
  }
  let winnerIds = [];
  let loserIds = [];
  if (room.mode === MODE_TEAMS && room.winnerTeam != null) {
    const winT = Number(room.winnerTeam);
    winnerIds = room.players
      .filter((p) => Number(p.team) === winT && !p.fled && !p.isBot)
      .map((p) => Number(p.userId))
      .filter(Boolean);
    loserIds = room.players
      .filter((p) => Number(p.team) !== winT && !p.isBot)
      .map((p) => Number(p.userId))
      .filter(Boolean);
  } else if (room.winnerIds?.length) {
    winnerIds = room.winnerIds.map(Number).filter(Boolean);
    loserIds = room.players
      .map((p) => Number(p.userId))
      .filter((id) => id && !winnerIds.includes(id) && id > 0);
  } else if (room.winnerId) {
    winnerIds = [Number(room.winnerId)];
    loserIds = room.players
      .map((p) => Number(p.userId))
      .filter((id) => id && id !== winnerIds[0] && id > 0);
  }
  recordArcadeResult({
    game: 'curling',
    winnerIds,
    loserIds,
    fleerIds,
  }).catch((e) => console.error('[curling stats]', e.message));
}

function endByFlee(room, fleer) {
  clearTurnTimer(room);
  room.status = 'ended';
  room.phase = 'ended';
  room.message = `${displayName(fleer)} 断线超时，视为逃跑`;
  applyCurlingStats(room, { fleeOnly: true });
  broadcast(room);
}

function buildThrowOrder(room) {
  const order = [];
  const per = STONES_PER_PLAYER[room.mode] || 2;
  if (room.mode === MODE_TEAMS) {
    const red = room.players.filter((p) => p.team === 0);
    const blue = room.players.filter((p) => p.team === 1);
    for (let i = 0; i < per; i++) {
      for (let k = 0; k < Math.max(red.length, blue.length); k++) {
        if (red[k]) order.push(red[k].seat);
        if (blue[k]) order.push(blue[k].seat);
      }
    }
  } else {
    for (let i = 0; i < per; i++) {
      for (const p of room.players) order.push(p.seat);
    }
  }
  return order;
}

function refreshLiveScore(room) {
  const sideKey = room.mode === MODE_TEAMS ? 'team' : 'ownerId';
  const result = scoreEnd(room.stones || [], { sideKey });
  if (!result.points || result.scoringSide == null || result.scoringSide === undefined) {
    room.liveScore = {
      points: 0,
      who: null,
      label: '本局临时：暂无人领先（0）',
      scoringSide: null,
      closestId: result.closestId || null,
    };
    return room.liveScore;
  }
  let who = '';
  if (room.mode === MODE_TEAMS) {
    who = TEAM_NAMES[result.scoringSide] || '一方';
  } else {
    const scorer = room.players.find((p) => Number(p.userId) === Number(result.scoringSide));
    who = displayName(scorer) || '玩家';
  }
  room.liveScore = {
    points: result.points,
    who,
    label: `本局临时：${who} 领先 ${result.points} 分`,
    scoringSide: result.scoringSide,
    closestId: result.closestId || null,
  };
  return room.liveScore;
}

function beginEnd(room) {
  room.end = (room.end || 0) + 1;
  room.stones = [];
  room.stoneSeq = 0;
  room.throwOrder = buildThrowOrder(room);
  room.throwIdx = 0;
  room.stonesLeft = {};
  for (const p of room.players) {
    room.stonesLeft[p.seat] = STONES_PER_PLAYER[room.mode] || 2;
  }
  room.liveScore = {
    points: 0,
    who: null,
    label: '本局临时：暂无人领先（0）',
    scoringSide: null,
    closestId: null,
  };
  room.phase = 'aim';
  room.turnSeat = room.throwOrder[0];
  room.message = `第 ${room.end}/${room.maxEnds} 局 · ${displayName(
    room.players.find((p) => p.seat === room.turnSeat)
  )} 投壶`;
  armTurnTimer(room);
  maybeBotThrow(room);
}

function finishMatch(room) {
  clearTurnTimer(room);
  room.status = 'ended';
  room.phase = 'ended';
  if (room.mode === MODE_TEAMS) {
    const a = room.teamScores[0] || 0;
    const b = room.teamScores[1] || 0;
    if (a === b) {
      room.winnerTeam = null;
      room.message = `平局 ${a}:${b}`;
    } else {
      room.winnerTeam = a > b ? 0 : 1;
      room.message = `${TEAM_NAMES[room.winnerTeam]} 获胜 ${Math.max(a, b)}:${Math.min(a, b)}`;
    }
  } else {
    const sorted = [...room.players].sort((x, y) => (y.score || 0) - (x.score || 0));
    const top = sorted[0]?.score || 0;
    const winners = sorted.filter((p) => (p.score || 0) === top && top > 0);
    if (!winners.length || (sorted[1] && sorted[1].score === top)) {
      if (winners.length > 1) {
        room.winnerIds = winners.map((p) => p.userId);
        room.message = `平局 · ${winners.map(displayName).join(' / ')} 各 ${top} 分`;
      } else {
        room.message = '平局';
      }
    } else {
      room.winnerId = winners[0].userId;
      room.winnerIds = [winners[0].userId];
      room.message = `${displayName(winners[0])} 获胜 · ${top} 分`;
    }
  }
  applyCurlingStats(room);
  broadcast(room);
}

function settleEnd(room) {
  clearTurnTimer(room);
  const sideKey = room.mode === MODE_TEAMS ? 'team' : 'ownerId';
  const result = scoreEnd(room.stones, { sideKey });
  let who = '无人';
  let points = 0;
  if (result.points > 0 && result.scoringSide != null && result.scoringSide !== undefined) {
    points = result.points;
    if (room.mode === MODE_TEAMS) {
      room.teamScores[result.scoringSide] =
        (room.teamScores[result.scoringSide] || 0) + result.points;
      who = TEAM_NAMES[result.scoringSide];
      room.message = `第 ${room.end} 局：${who} +${points} 分（总分 ${room.teamScores[0]}:${room.teamScores[1]}）`;
    } else {
      const scorer = room.players.find((p) => Number(p.userId) === Number(result.scoringSide));
      if (scorer) {
        scorer.score = (scorer.score || 0) + result.points;
        who = displayName(scorer);
        room.message = `第 ${room.end} 局：${who} +${points} 分（其总分 ${scorer.score}）`;
      }
    }
  } else {
    room.message = `第 ${room.end} 局：空局（0 分）`;
  }

  const entry = {
    end: room.end,
    who,
    points,
    scoringSide: result.scoringSide ?? null,
    closestId: result.closestId || null,
    totals:
      room.mode === MODE_TEAMS
        ? { team0: room.teamScores[0] || 0, team1: room.teamScores[1] || 0 }
        : Object.fromEntries(room.players.map((p) => [String(p.userId), p.score || 0])),
  };
  room.endLog = [...(room.endLog || []), entry];
  room.lastEnd = entry;

  room.phase = 'settle';
  broadcast(room, { type: 'end_settle', result: entry });

  setTimeout(() => {
    if (room.status !== 'playing') return;
    if (room.end >= room.maxEnds) {
      finishMatch(room);
    } else {
      beginEnd(room);
      broadcast(room);
    }
  }, 2800);
}

function advanceTurn(room) {
  room.throwIdx += 1;
  if (room.throwIdx >= room.throwOrder.length) {
    settleEnd(room);
    return;
  }
  room.phase = 'aim';
  room.turnSeat = room.throwOrder[room.throwIdx];
  const p = room.players.find((x) => x.seat === room.turnSeat);
  refreshLiveScore(room);
  room.message = `${displayName(p)} 投壶（剩 ${room.stonesLeft[room.turnSeat] || 0}）· ${room.liveScore.label}`;
  armTurnTimer(room);
  maybeBotThrow(room);
}

function doThrow(room, seat, shot) {
  if (room.status !== 'playing' || room.phase !== 'aim') return;
  if (room.turnSeat !== seat) return;
  const p = room.players.find((x) => x.seat === seat);
  if (!p || p.fled) return;
  if ((room.stonesLeft[seat] || 0) <= 0) return;

  clearTurnTimer(room);
  room.phase = 'sliding';
  room.stoneSeq = (room.stoneSeq || 0) + 1;
  const id = `e${room.end}-s${room.stoneSeq}`;
  const sim = simulateThrow(room.stones, {
    id,
    ownerId: p.userId,
    team: p.team,
    color: p.color,
    seat: p.seat,
    power: shot.power,
    angleDeg: shot.angleDeg,
    curl: shot.curl,
    aimY: shot.aimY,
  });
  room.stones = sim.stones;
  room.stonesLeft[seat] = Math.max(0, (room.stonesLeft[seat] || 0) - 1);
  room.lastActive = now();
  const live = refreshLiveScore(room);
  room.message = `${displayName(p)} 滑行中… · ${live.label}`;

  broadcast(room, {
    type: 'throw',
    frames: sim.frames,
    thrownId: sim.thrownId,
    stones: sim.stones,
    liveScore: live,
  });

  const playMs = Math.min(4200, 350 + sim.frames.length * 22);
  setTimeout(() => {
    if (room.status !== 'playing') return;
    room.phase = 'aim';
    advanceTurn(room);
    if (room.status === 'playing' && room.phase === 'aim') {
      // 回合推进后仍带上当前临时分
      refreshLiveScore(room);
      const cur = room.players.find((x) => x.seat === room.turnSeat);
      if (cur && room.phase === 'aim') {
        room.message = `${displayName(cur)} 投壶（剩 ${room.stonesLeft[room.turnSeat] || 0}）· ${room.liveScore.label}`;
      }
      broadcast(room);
    }
  }, playMs);
}

function botAim(room, bot) {
  const diff = BOT_DIFFICULTIES[normalizeBotDiff(room.botDiff)] || BOT_DIFFICULTIES.normal;
  const noise = (diff.poolAngleNoise || 0.15) * 18;
  const powerNoise = (diff.poolPowerNoise || 0.15) * 3;
  const miss = Math.random() < (diff.poolMissChance || 0.25);

  // 目标：钮，或撞开对手最近壶
  let targetY = BUTTON.y;
  let targetX = BUTTON.x;
  const opp = room.stones
    .filter((s) => !s.out && Number(s.ownerId) !== Number(bot.userId))
    .sort((a, b) => distToButton(a) - distToButton(b))[0];
  const mine = room.stones
    .filter((s) => !s.out && Number(s.ownerId) === Number(bot.userId))
    .sort((a, b) => distToButton(a) - distToButton(b))[0];

  if (opp && distToButton(opp) < 90 && (!mine || distToButton(opp) < distToButton(mine))) {
    targetX = opp.x;
    targetY = opp.y;
  }
  if (miss) {
    targetY += (Math.random() - 0.5) * 120;
    targetX += (Math.random() - 0.5) * 80;
  }

  const dx = targetX - 72;
  const dy = targetY - (BUTTON.y + (Math.random() - 0.5) * noise * 4);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + (Math.random() - 0.5) * noise;
  const dist = Math.hypot(dx, dy);
  const power = Math.max(4, Math.min(15.5, dist * 0.016 + 5.5 + (Math.random() - 0.5) * powerNoise * 2));
  const curl = Math.max(-1, Math.min(1, ((targetY - BUTTON.y) / 80) * -0.5 + (Math.random() - 0.5) * 0.35));
  return {
    power,
    angleDeg: Math.max(-18, Math.min(18, angleDeg)),
    curl,
    aimY: BUTTON.y + (Math.random() - 0.5) * noise * 3,
  };
}

function maybeBotThrow(room) {
  if (room.status !== 'playing' || room.phase !== 'aim') return;
  const p = room.players.find((x) => x.seat === room.turnSeat);
  if (!p?.isBot) return;
  const delay = 700 + Math.random() * 900;
  setTimeout(() => {
    if (room.status !== 'playing' || room.phase !== 'aim' || room.turnSeat !== p.seat) return;
    doThrow(room, p.seat, botAim(room, p));
  }, delay);
}

function makeRoom(hostWs, hostUser, { mode, vsBot = false, botDiff = 'normal' } = {}) {
  prune();
  if (rooms.size >= MAX_ROOMS) throw new Error('房间已满，稍后再开');
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();

  const m = normalizeMode(mode);
  const host = {
    seat: 0,
    userId: hostUser.id,
    student_id: hostUser.student_id,
    nickname: hostUser.nickname,
    is_admin: !!hostUser.is_admin,
    color: COLORS[0],
    team: m === MODE_TEAMS ? 0 : null,
    score: 0,
    fled: false,
    ws: hostWs,
    discAt: 0,
    isBot: false,
  };
  hostWs._curlingRoomId = id;

  const room = {
    id,
    mode: m,
    status: 'lobby',
    phase: 'lobby',
    message: lobbyHint({ mode: m, players: [host], vsBot }),
    players: [host],
    stones: [],
    end: 0,
    maxEnds: ENDS[m],
    teamScores: [0, 0],
    endLog: [],
    lastEnd: null,
    throwOrder: [],
    throwIdx: 0,
    turnSeat: 0,
    stonesLeft: {},
    vsBot,
    botDiff: vsBot ? normalizeBotDiff(botDiff) : null,
    createdAt: now(),
    lastActive: now(),
    statsRecorded: false,
    winnerId: null,
    winnerTeam: null,
    winnerIds: null,
    turnTimer: null,
    turnDeadline: null,
    stoneSeq: 0,
  };

  if (vsBot) {
    room.players.push({
      seat: 1,
      userId: -1001,
      student_id: 'bot',
      nickname: `冰壶人机·${botDiffPublic(room.botDiff)?.label || '普通'}`,
      color: COLORS[1],
      team: null,
      score: 0,
      fled: false,
      ws: null,
      discAt: 0,
      isBot: true,
    });
    room.mode = MODE_DUEL;
    room.maxEnds = ENDS[MODE_DUEL];
    room.message = '人机 1v1 · 选好后开始';
  }

  rooms.set(id, room);
  paintColors(room);
  room.message = lobbyHint(room);
  broadcast(room);
  return room;
}

export function createRoom(ws, user, mode = MODE_DUEL) {
  const room = makeRoom(ws, user, { mode: normalizeMode(mode) });
  send(ws, { type: 'created', roomId: room.id, state: publicState(room, user.id) });
}

export function createBotRoom(ws, user, difficulty = 'normal') {
  const room = makeRoom(ws, user, { mode: MODE_DUEL, vsBot: true, botDiff: difficulty });
  send(ws, { type: 'created', roomId: room.id, state: publicState(room, user.id) });
}

export function joinRoom(ws, user, roomId) {
  prune();
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room) throw new Error('房间不存在');
  if (room.vsBot) throw new Error('人机房不可加入');
  if (room.status !== 'lobby' && room.status !== 'waiting') throw new Error('对局已开始');
  if (findPlayer(room, user.id)) {
    rejoinRoom(ws, user, id);
    return;
  }
  if (room.players.length >= roomCap(room)) throw new Error('房间已满');

  const seat = room.players.length;
  const p = {
    seat,
    userId: user.id,
    student_id: user.student_id,
    nickname: user.nickname,
    is_admin: !!user.is_admin,
    color: COLORS[seat % COLORS.length],
    team: room.mode === MODE_TEAMS ? (seat < 2 ? 0 : 1) : null,
    score: 0,
    fled: false,
    ws,
    discAt: 0,
    isBot: false,
  };
  ws._curlingRoomId = id;
  room.players.push(p);
  rebalanceTeams(room);
  room.lastActive = now();
  room.message = lobbyHint(room);
  broadcast(room);
  send(ws, { type: 'joined', roomId: id, state: publicState(room, user.id) });
}

export function rejoinRoom(ws, user, roomId) {
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room) throw new Error('房间不存在或已解散');
  const p = findPlayer(room, user.id);
  if (!p) throw new Error('你不在这个房间');
  if (p.fled && room.status === 'ended') throw new Error('对局已结束');
  p.ws = ws;
  p.discAt = 0;
  p.fled = false;
  ws._curlingRoomId = id;
  room.lastActive = now();
  send(ws, { type: 'state', state: publicState(room, user.id) });
  broadcast(room);
}

export function disconnectRoom(ws) {
  const id = ws._curlingRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) return;
  const p = room.players.find((x) => x.ws === ws);
  if (!p) return;
  room.lastActive = now();
  if (room.status === 'lobby' || room.status === 'waiting') {
    leaveRoom(ws);
    return;
  }
  p.ws = null;
  p.discAt = now();
  room.message = `${displayName(p)} 暂时断线，可重连`;
  broadcast(room);
}

export function leaveRoom(ws) {
  const id = ws._curlingRoomId;
  if (!id) return;
  const room = rooms.get(id);
  ws._curlingRoomId = null;
  if (!room) return;
  const player = room.players.find((x) => x.ws === ws);
  if (!player) return;

  if (room.status === 'playing') {
    player.fled = true;
    player.ws = null;
    clearTurnTimer(room);
    room.status = 'ended';
    room.phase = 'ended';
    room.message = `${displayName(player)} 离开，视为逃跑`;
    applyCurlingStats(room, { fleeOnly: true });
    broadcast(room);
    return;
  }

  room.players = room.players.filter((x) => x !== player);
  if (!room.players.filter((x) => !x.isBot).length) {
    clearTurnTimer(room);
    rooms.delete(id);
    return;
  }
  room.players.forEach((x, i) => {
    x.seat = i;
  });
  rebalanceTeams(room);
  room.message = lobbyHint(room);
  room.lastActive = now();
  broadcast(room);
}

function startGame(room) {
  if (room.vsBot) {
    if (room.players.length < 2) throw new Error('人机未就绪');
  } else if (room.players.length < roomMin(room)) {
    throw new Error(`至少 ${roomMin(room)} 人才能开始`);
  }
  if (room.mode === MODE_TEAMS) {
    const r = room.players.filter((p) => p.team === 0).length;
    const b = room.players.filter((p) => p.team === 1).length;
    if (r !== 2 || b !== 2) throw new Error('2v2 需要红蓝各 2 人');
  }
  for (const p of room.players) {
    p.score = 0;
    p.fled = false;
  }
  room.teamScores = [0, 0];
  room.endLog = [];
  room.lastEnd = null;
  room.end = 0;
  room.maxEnds = ENDS[room.mode] || 4;
  room.status = 'playing';
  room.statsRecorded = false;
  room.winnerId = null;
  room.winnerTeam = null;
  room.winnerIds = null;
  beginEnd(room);
  broadcast(room);
}

export function handleMsg(ws, user, msg) {
  const room = rooms.get(ws._curlingRoomId);
  if (!room) {
    send(ws, { type: 'error', error: '不在房间内' });
    return;
  }
  room.lastActive = now();
  const me = findPlayer(room, user.id);
  if (!me) {
    send(ws, { type: 'error', error: '不在房间内' });
    return;
  }

  if (msg.type === 'chat') {
    const text = String(msg.text || '').trim().slice(0, 80);
    if (!text) return;
    for (const p of room.players) {
      send(p.ws, {
        type: 'chat',
        from: displayName(me),
        userId: me.userId,
        text,
        at: now(),
      });
    }
    return;
  }

  if (msg.type === 'set_mode') {
    if (me.seat !== 0) throw new Error('仅房主可改模式');
    if (room.status !== 'lobby') throw new Error('已开始');
    if (room.vsBot) throw new Error('人机房固定 1v1');
    room.mode = normalizeMode(msg.mode);
    room.maxEnds = ENDS[room.mode];
    if (room.players.length > roomCap(room)) {
      throw new Error('人数超过该模式上限，请先让人离开');
    }
    rebalanceTeams(room);
    room.message = lobbyHint(room);
    broadcast(room);
    return;
  }

  if (msg.type === 'set_team') {
    if (room.mode !== MODE_TEAMS || room.status !== 'lobby') return;
    const t = Number(msg.team) === 1 ? 1 : 0;
    const mates = room.players.filter((p) => p.team === t && p !== me);
    if (mates.length >= 2) throw new Error('该队已满');
    me.team = t;
    paintColors(room);
    room.message = lobbyHint(room);
    broadcast(room);
    return;
  }

  if (msg.type === 'start') {
    if (me.seat !== 0) throw new Error('仅房主可开始');
    startGame(room);
    return;
  }

  if (msg.type === 'throw') {
    if (room.status !== 'playing' || room.phase !== 'aim') return;
    if (me.seat !== room.turnSeat) throw new Error('还没轮到你');
    doThrow(room, me.seat, {
      power: Number(msg.power),
      angleDeg: Number(msg.angleDeg),
      curl: Number(msg.curl),
      aimY: Number(msg.aimY),
    });
    return;
  }

  if (msg.type === 'skip') {
    if (room.status !== 'playing' || room.phase !== 'aim') return;
    if (me.seat !== room.turnSeat) return;
    doThrow(room, me.seat, {
      power: 5.5,
      angleDeg: 0,
      curl: 0,
      aimY: BUTTON.y,
    });
  }
}

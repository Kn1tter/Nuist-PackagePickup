/**
 * In-memory 2-player pool rooms. No DB, tiny footprint.
 * Server relays + keeps snapshot for reconnect.
 */

import { recordArcadeResult } from './arcadeStats.js';
import { normalizeBotDiff, botDiffPublic } from './botDiff.js';

const MAX_ROOMS = 8;
const ROOM_TTL_MS = 12 * 60 * 1000;
const RECONNECT_MS = 60 * 1000;
const ACTION_MS = 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** @type {Map<string, any>} */
const rooms = new Map();

function now() {
  return Date.now();
}

function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return code;
}

function emptyState() {
  return {
    balls: null,
    group: { host: null, guest: null },
    tableOpen: true,
    ballInHand: false,
    winner: null,
    message: '',
  };
}

function userIdOf(room, seat) {
  const u = seat === 'host' ? room.hostUser : room.guestUser;
  return u?.id ? Number(u.id) : null;
}

function applyPoolStats(room, { winnerSeat = null, fleerSeat = null } = {}) {
  if (!room || room.statsRecorded) return;
  room.statsRecorded = true;
  if (room.vsBot) return;
  const hostId = userIdOf(room, 'host');
  const guestId = userIdOf(room, 'guest');
  const winnerId = winnerSeat ? userIdOf(room, winnerSeat) : null;
  const fleerId = fleerSeat ? userIdOf(room, fleerSeat) : null;
  // 超时/逃跑：只记逃跑方，对手不记胜
  if (fleerId && !winnerId) {
    recordArcadeResult({
      game: 'pool',
      winnerIds: [],
      loserIds: [],
      fleerIds: [fleerId],
    }).catch((e) => console.error('[pool stats]', e.message));
    return;
  }
  const loserIds = [];
  for (const id of [hostId, guestId]) {
    if (!id) continue;
    if (winnerId && id === winnerId) continue;
    if (fleerId && id === fleerId) continue;
    loserIds.push(id);
  }
  recordArcadeResult({
    game: 'pool',
    winnerIds: winnerId ? [winnerId] : [],
    loserIds,
    fleerIds: fleerId ? [fleerId] : [],
  }).catch((e) => console.error('[pool stats]', e.message));
}

function prune() {
  const t = now();
  for (const [id, r] of rooms) {
    // drop expired disconnects → 对局中视为逃跑
    for (const seat of ['host', 'guest']) {
      if (r.discAt?.[seat] && t - r.discAt[seat] > RECONNECT_MS) {
        const wasPlaying = r.status === 'playing';
        const fleerUser = seat === 'host' ? r.hostUser : r.guestUser;
        const otherWs = seat === 'host' ? r.guest : r.host;
        r.discAt[seat] = 0;
        if (seat === 'host') {
          r.host = null;
          r.hostUser = null;
        } else {
          r.guest = null;
          r.guestUser = null;
        }
        if (wasPlaying && fleerUser && !r.statsRecorded) {
          // 临时挂回 fleer 以便记分，再清掉
          if (seat === 'host') r.hostUser = fleerUser;
          else r.guestUser = fleerUser;
          applyPoolStats(r, { fleerSeat: seat });
          if (seat === 'host') r.hostUser = null;
          else r.guestUser = null;
          r.status = 'ended';
          r.state.message = '对方断线超时，视为逃跑';
          send(otherWs, {
            type: 'peer_left',
            message: '对方断线超时，视为逃跑（仅对方记逃跑）',
            reason: 'flee_timeout',
          });
        }
      }
    }
    const empty = !r.hostUser && !r.guestUser;
    const stale = t - r.lastActive > ROOM_TTL_MS;
    const endedOld = r.status === 'ended' && t - r.lastActive > 60 * 1000;
    if (empty || stale || endedOld) {
      try {
        r.host?.close?.();
        r.guest?.close?.();
      } catch {
        /* ignore */
      }
      rooms.delete(id);
    }
  }
}

export function listWaitingRooms() {
  prune();
  const out = [];
  for (const r of rooms.values()) {
    if (r.status === 'waiting' && r.hostUser && !r.guestUser && !r.vsBot) {
      out.push({
        id: r.id,
        hostName: r.hostUser?.nickname || r.hostUser?.student_id || '玩家',
        createdAt: r.createdAt,
      });
    }
  }
  return out.slice(0, 20);
}

function clearActionTimer(room) {
  if (room.actionTimer) {
    clearTimeout(room.actionTimer);
    room.actionTimer = null;
  }
}

function armActionTimer(room) {
  clearActionTimer(room);
  if (room.status !== 'playing') return;
  // 人机回合：不挂逃跑计时，由客户端执行 AI 击球
  if (room.vsBot && room.turn === 'guest') {
    room.actionEndsAt = 0;
    send(room.host, { type: 'bot_turn', botDiff: room.botDiff, actionEndsAt: 0 });
    return;
  }
  const expectedTurn = room.turn;
  room.actionEndsAt = now() + ACTION_MS;
  room.actionTimer = setTimeout(() => {
    if (room.status !== 'playing') return;
    if (room.turn !== expectedTurn) return;
    if (room.vsBot && expectedTurn === 'guest') return;
    const fleerSeat = expectedTurn;
    const otherWs = fleerSeat === 'host' ? room.guest : room.host;
    applyPoolStats(room, { fleerSeat });
    room.status = 'ended';
    room.state.message = '对方操作超时（60秒），视为逃跑';
    clearActionTimer(room);
    send(otherWs, {
      type: 'peer_left',
      message: '对方超过 60 秒未操作，视为逃跑（仅对方记逃跑）',
      reason: 'flee_timeout',
    });
    const fleerWs = fleerSeat === 'host' ? room.host : room.guest;
    send(fleerWs, {
      type: 'peer_left',
      message: '你超过 60 秒未操作，视为逃跑',
      reason: 'flee_timeout',
    });
  }, ACTION_MS);
}

export function roomPublic(r, seat) {
  return {
    id: r.id,
    status: r.status,
    turn: r.turn,
    seat,
    vsBot: !!r.vsBot,
    botDiff: r.botDiff || null,
    botDiffs: botDiffPublic(),
    host: r.hostUser
      ? { id: r.hostUser.id, nickname: r.hostUser.nickname, student_id: r.hostUser.student_id }
      : null,
    guest: r.guestUser
      ? {
          id: r.guestUser.id,
          nickname: r.guestUser.nickname,
          student_id: r.guestUser.student_id,
          isBot: !!r.guestUser.is_bot,
        }
      : null,
    hostConnected: !!r.host && !r.discAt?.host,
    guestConnected: r.vsBot ? true : !!r.guest && !r.discAt?.guest,
    actionEndsAt: r.actionEndsAt || 0,
    actionSec: Math.ceil(ACTION_MS / 1000),
  };
}

function snapshot(r) {
  return {
    type: 'sync',
    room: null, // filled by caller
    turn: r.turn,
    status: r.status,
    balls: r.state.balls,
    group: r.state.group,
    tableOpen: r.state.tableOpen,
    ballInHand: r.state.ballInHand,
    winner: r.state.winner,
    message: r.state.message,
    actionEndsAt: r.actionEndsAt || 0,
  };
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

function peerOf(room, ws) {
  if (room.host === ws) return room.guest;
  if (room.guest === ws) return room.host;
  return null;
}

function seatOf(room, ws) {
  if (room.host === ws) return 'host';
  if (room.guest === ws) return 'guest';
  return null;
}

export function createRoom(ws, user) {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    send(ws, { type: 'error', error: '房间已满，请稍后再试' });
    return null;
  }
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();
  const room = {
    id,
    host: ws,
    guest: null,
    hostUser: user,
    guestUser: null,
    turn: 'host',
    status: 'waiting',
    createdAt: now(),
    lastActive: now(),
    discAt: { host: 0, guest: 0 },
    state: emptyState(),
    statsRecorded: false,
    actionTimer: null,
    actionEndsAt: 0,
    vsBot: false,
    botDiff: null,
  };
  rooms.set(id, room);
  ws._poolRoomId = id;
  ws._poolIntentionalLeave = false;
  send(ws, { type: 'room', room: roomPublic(room, 'host') });
  return room;
}

/** 人机对战：房间大厅形式，房主点开始后开局；不记排行榜、不出现在玩家房列表 */
export function createBotRoom(ws, user, difficulty = 'normal') {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    send(ws, { type: 'error', error: '房间已满，请稍后再试' });
    return null;
  }
  const diff = normalizeBotDiff(difficulty);
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();
  const botUser = {
    id: -6100,
    nickname: diff.label,
    student_id: `bot_${diff.id}`,
    is_bot: true,
  };
  const room = {
    id,
    host: ws,
    guest: null,
    hostUser: user,
    guestUser: botUser,
    turn: 'host',
    status: 'waiting',
    createdAt: now(),
    lastActive: now(),
    discAt: { host: 0, guest: 0 },
    state: emptyState(),
    statsRecorded: false,
    actionTimer: null,
    actionEndsAt: 0,
    vsBot: true,
    botDiff: diff.id,
  };
  rooms.set(id, room);
  ws._poolRoomId = id;
  ws._poolIntentionalLeave = false;
  send(ws, { type: 'room', room: roomPublic(room, 'host') });
  return room;
}

/** 人机房房主开始对局 */
export function startBotRoom(ws, user) {
  const id = ws._poolRoomId;
  const room = id ? rooms.get(id) : null;
  if (!room || !room.vsBot) {
    send(ws, { type: 'error', error: '不在人机房间中' });
    return null;
  }
  if (room.hostUser?.id !== user.id) {
    send(ws, { type: 'error', error: '只有房主可以开始' });
    return null;
  }
  if (room.status !== 'waiting') {
    send(ws, { type: 'error', error: '已经开始了' });
    return null;
  }
  room.status = 'playing';
  room.turn = 'host';
  room.lastActive = now();
  armActionTimer(room);
  send(ws, { type: 'room', room: roomPublic(room, 'host') });
  send(ws, {
    type: 'start',
    turn: room.turn,
    actionEndsAt: room.actionEndsAt,
    vsBot: true,
    botDiff: room.botDiff,
  });
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
  if (room.vsBot) {
    send(ws, { type: 'error', error: '人机房不能加入' });
    return null;
  }
  if (room.guestUser) {
    send(ws, { type: 'error', error: '房间已满' });
    return null;
  }
  if (room.hostUser?.id === user.id) {
    send(ws, { type: 'error', error: '不能加入自己的房间' });
    return null;
  }
  room.guest = ws;
  room.guestUser = user;
  room.status = 'playing';
  room.turn = 'host';
  room.lastActive = now();
  room.discAt.guest = 0;
  room.state = emptyState();
  room.statsRecorded = false;
  ws._poolRoomId = id;
  ws._poolIntentionalLeave = false;
  armActionTimer(room);
  send(room.host, { type: 'room', room: roomPublic(room, 'host') });
  send(ws, { type: 'room', room: roomPublic(room, 'guest') });
  send(room.host, { type: 'start', turn: room.turn, actionEndsAt: room.actionEndsAt });
  send(ws, { type: 'start', turn: room.turn, actionEndsAt: room.actionEndsAt });
  return room;
}

/** Rejoin after disconnect using same user + room code */
export function rejoinRoom(ws, user, roomId) {
  prune();
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room || room.status === 'ended') {
    send(ws, { type: 'error', error: '对局已结束，无法重连' });
    return null;
  }
  let seat = null;
  if (room.hostUser?.id === user.id) seat = 'host';
  else if (room.guestUser?.id === user.id) seat = 'guest';
  if (!seat) {
    send(ws, { type: 'error', error: '你不在此房间' });
    return null;
  }
  if (seat === 'host') {
    try {
      room.host?.close?.();
    } catch {
      /* ignore */
    }
    room.host = ws;
    room.discAt.host = 0;
  } else {
    try {
      room.guest?.close?.();
    } catch {
      /* ignore */
    }
    room.guest = ws;
    room.discAt.guest = 0;
  }
  ws._poolRoomId = id;
  ws._poolIntentionalLeave = false;
  room.lastActive = now();

  const pub = roomPublic(room, seat);
  send(ws, { type: 'room', room: pub });
  const sync = snapshot(room);
  sync.room = pub;
  send(ws, sync);

  const other = seat === 'host' ? room.guest : room.host;
  send(other, { type: 'peer_rejoined', seat, room: roomPublic(room, seat === 'host' ? 'guest' : 'host') });
  return room;
}

/** Soft disconnect: keep seat for RECONNECT_MS */
export function disconnectRoom(ws) {
  if (ws._poolIntentionalLeave) {
    leaveRoom(ws, true);
    return;
  }
  const id = ws._poolRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) {
    ws._poolRoomId = null;
    return;
  }
  const seat = seatOf(room, ws);
  if (!seat) return;
  if (seat === 'host') room.host = null;
  else room.guest = null;
  room.discAt[seat] = now();
  room.lastActive = now();
  ws._poolRoomId = null;

  const other = seat === 'host' ? room.guest : room.host;
  send(other, {
    type: 'peer_disconnected',
    seat,
    graceSec: Math.floor(RECONNECT_MS / 1000),
    message: '对方断线，等待重连…',
  });

  // waiting 空房 / 人机房无真人连接 → 删除
  if (room.status === 'waiting' && !room.host && !room.guest) {
    rooms.delete(id);
  } else if (room.vsBot && !room.host) {
    clearActionTimer(room);
    rooms.delete(id);
  }
}

/** Intentional leave / forfeit */
export function leaveRoom(ws, fromDisconnectPath = false) {
  const id = ws._poolRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) {
    ws._poolRoomId = null;
    return;
  }
  const seat = seatOf(room, ws);
  const other = peerOf(room, ws);
  const wasPlaying = room.status === 'playing';
  const fleerUser = seat === 'host' ? room.hostUser : room.guestUser;

  clearActionTimer(room);
  if (wasPlaying && seat && fleerUser && !room.statsRecorded) {
    applyPoolStats(room, { fleerSeat: seat });
  }

  // 人机房：真人离开即解散
  if (room.vsBot) {
    room.host = null;
    room.guest = null;
    room.hostUser = null;
    room.guestUser = null;
    ws._poolRoomId = null;
    rooms.delete(id);
    return;
  }

  if (seat === 'host') {
    room.host = null;
    room.hostUser = null;
    room.discAt.host = 0;
  } else if (seat === 'guest') {
    room.guest = null;
    room.guestUser = null;
    room.discAt.guest = 0;
  }
  ws._poolRoomId = null;
  room.lastActive = now();
  if (other) {
    send(other, {
      type: 'peer_left',
      message: wasPlaying ? '对方逃跑，你获胜' : '对方已离开',
      reason: wasPlaying ? 'flee' : 'leave',
    });
    room.status = 'ended';
  }
  if (!room.hostUser && !room.guestUser) rooms.delete(id);
  if (!fromDisconnectPath) {
    /* noop */
  }
}

export function handleGameMsg(ws, msg) {
  const id = ws._poolRoomId;
  const room = id ? rooms.get(id) : null;
  if (!room || (room.status !== 'playing' && msg.type !== 'settle')) {
    send(ws, { type: 'error', error: '对局未开始' });
    return;
  }
  const seat = seatOf(room, ws);
  if (!seat) return;
  room.lastActive = now();
  const other = peerOf(room, ws);

  if (msg.type === 'aim') {
    if (room.status !== 'playing') return;
    if (room.turn !== seat) return;
    const angle = Number(msg.angle);
    const power = Number(msg.power);
    if (!Number.isFinite(angle)) return;
    send(other, {
      type: 'aim',
      angle,
      phase: msg.phase === 'power' ? 'power' : 'aim',
      power: Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : 0,
      from: seat,
    });
    return;
  }

  // Real-time ball positions from shooter → peer (relay only)
  if (msg.type === 'frame') {
    if (room.status !== 'playing') return;
    if (room.turn !== seat) return;
    if (!Array.isArray(msg.b) || msg.b.length > 16) return;
    send(other, { type: 'frame', seq: msg.seq || 0, b: msg.b });
    return;
  }

  if (msg.type === 'shot') {
    if (room.status !== 'playing') return;
    // 人机：房主可代发挑战者（AI）击球
    const actingAsBot = room.vsBot && seat === 'host' && room.turn === 'guest' && msg.asBot;
    if (room.turn !== seat && !actingAsBot) {
      send(ws, { type: 'error', error: '还没轮到你' });
      return;
    }
    const angle = Number(msg.angle);
    const power = Number(msg.power);
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return;
    const clamped = Math.max(0.05, Math.min(1, power));
    const balls = Array.isArray(msg.balls) ? msg.balls : room.state.balls;
    // freeze start snapshot for both sides
    if (balls) room.state.balls = balls;
    // 击球后暂停操作计时，等 settle 再重新计
    clearActionTimer(room);
    room.actionEndsAt = 0;
    const fromSeat = actingAsBot ? 'guest' : seat;
    const payload = { type: 'shot', angle, power: clamped, balls, from: fromSeat, asBot: !!actingAsBot };
    send(other, payload);
    send(ws, { ...payload, type: 'shot_ack' });
    return;
  }

  if (msg.type === 'settle') {
    if (msg.turn === 'host' || msg.turn === 'guest') room.turn = msg.turn;
    if (msg.status === 'ended') room.status = 'ended';
    room.state = {
      balls: msg.balls || null,
      group: msg.group || room.state.group,
      tableOpen: typeof msg.tableOpen === 'boolean' ? msg.tableOpen : room.state.tableOpen,
      ballInHand: !!msg.ballInHand,
      winner: msg.winner || null,
      message: msg.message || '',
    };
    if (room.status === 'ended' && (msg.winner === 'host' || msg.winner === 'guest')) {
      applyPoolStats(room, { winnerSeat: msg.winner });
      clearActionTimer(room);
    } else if (room.status === 'playing') {
      armActionTimer(room);
    }
    send(other, {
      type: 'settle',
      balls: msg.balls,
      turn: room.turn,
      group: room.state.group,
      tableOpen: room.state.tableOpen,
      ballInHand: room.state.ballInHand,
      status: room.status,
      winner: room.state.winner,
      message: room.state.message,
      scratch: !!msg.scratch,
      actionEndsAt: room.actionEndsAt || 0,
    });
    return;
  }

  if (msg.type === 'cue_place') {
    send(other, { type: 'cue_place', x: msg.x, y: msg.y, from: seat });
    if (room.state.balls && Array.isArray(room.state.balls)) {
      const cue = room.state.balls.find((b) => b.id === 0);
      if (cue) {
        cue.x = msg.x;
        cue.y = msg.y;
        cue.pocketed = false;
      }
    }
    room.state.ballInHand = false;
    return;
  }

  if (msg.type === 'chat') {
    const text = String(msg.text || '').trim().slice(0, 80);
    if (!text) return;
    const user = seat === 'host' ? room.hostUser : room.guestUser;
    const payload = {
      type: 'chat',
      text,
      from: seat,
      nickname: user?.nickname || user?.student_id || seat,
      at: now(),
    };
    send(other, payload);
    send(ws, { ...payload, self: true });
  }
}

export function stats() {
  prune();
  return { rooms: rooms.size, max: MAX_ROOMS };
}

setInterval(prune, 30 * 1000).unref?.();

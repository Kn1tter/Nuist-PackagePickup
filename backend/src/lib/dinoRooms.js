/**
 * 小恐龙一起跑：服务端权威，2–5 人联机。
 * 还有人活着 → 出局的 5 秒后复活；全部出局才结束。
 */
import { recordDinoScore } from './arcadeStats.js';

const MAX_ROOMS = 8;
const MAX_PLAYERS = 5;
const ROOM_TTL_MS = 30 * 60 * 1000;
const RECONNECT_MS = 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REVIVE_MS = 5000;
/** 60 物理 / 30 同步（每 2 步广播），跳跃会立刻补发 */
const FPS = 60;
const STEP = 1000 / FPS;
const BROADCAST_EVERY = 2;

const CFG = {
  SPEED: 4,
  ACCELERATION: 0.0007,
  GRAVITY: 0.6,
  JUMP_V: 10,
  SPEED_DROP: 3,
  CLEAR_MS: 3200,
  GAP: 1.05,
  BOTTOM: 10,
  W: 600,
  H: 200,
};

function slotX(seat) {
  return 8 + seat * 48;
}

function lobbyText(n) {
  if (n >= MAX_PLAYERS) return '5 人已满，房主可以开始';
  if (n >= 2) return `${n}/5 人已到，房主可以开始，还能再加入`;
  return '等待队友（2 到 5 人，还有人活着就能救队友）';
}

function placeLine(players) {
  players.forEach((p, i) => {
    p.seat = i;
    p.x = slotX(i);
  });
}

const TREX_W = 44;
const TREX_H = 47;
const CACTUS_S = { w: 17, h: 35 };
const CACTUS_L = { w: 25, h: 50 };
const BIRD_W = 46;
const BIRD_H = 40;

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

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function makeDino(user, seat) {
  const groundYPos = CFG.H - TREX_H - CFG.BOTTOM;
  return {
    seat,
    userId: user.id,
    isGuest: !!user.is_guest,
    nickname: user.nickname || user.student_id,
    x: slotX(seat),
    y: groundYPos,
    groundYPos,
    vy: 0,
    jumping: false,
    ducking: false,
    wantDuck: false,
    speedDrop: false,
    dead: false,
    fled: false,
    reviveAt: 0,
    blink: 0,
    frame: 0,
    timer: 0,
  };
}

function dinoBox(d) {
  if (d.ducking) return { x: d.x + 1, y: d.y + 18, w: 55, h: 25 };
  return { x: d.x + 1, y: d.y + 18, w: 30, h: 25 };
}

function obsBoxes(o) {
  if (o.kind === 'bird') {
    return [{ x: o.x + 8, y: o.y + 10, w: o.w - 14, h: o.h - 16 }];
  }
  if (o.kind === 'cactusL') {
    const out = [];
    for (let i = 0; i < o.size; i++) {
      const ox = o.x + i * CACTUS_L.w;
      out.push(
        { x: ox + 7, y: o.y + 14, w: 5, h: 34 },
        { x: ox + 11, y: o.y + 4, w: 5, h: 42 },
        { x: ox + 15, y: o.y + 12, w: 6, h: 32 }
      );
    }
    return out;
  }
  const out = [];
  for (let i = 0; i < o.size; i++) {
    const ox = o.x + i * CACTUS_S.w;
    out.push(
      { x: ox + 2, y: o.y + 9, w: 4, h: 24 },
      { x: ox + 5, y: o.y + 2, w: 5, h: 30 },
      { x: ox + 10, y: o.y + 6, w: 5, h: 12 }
    );
  }
  return out;
}

function spawnObs(room) {
  const bird = room.speed > 9.5 && Math.random() < 0.18;
  const last = room.obstacles[room.obstacles.length - 1];
  const gap = Math.max(160, room.speed * 18 * CFG.GAP) + Math.random() * (80 + room.speed * 6);
  const x = last ? last.x + last.w + gap : CFG.W + 40;
  const scale = CFG.H / 150;
  room.nextOid = (room.nextOid || 0) + 1;
  const oid = room.nextOid;
  if (bird) {
    const ys = [100, 75, 50].map((v) => Math.round(v * scale));
    room.obstacles.push({
      id: oid,
      kind: 'bird',
      x,
      y: ys[(Math.random() * 3) | 0],
      w: BIRD_W,
      h: BIRD_H,
      size: 1,
      frame: 0,
      wing: 0,
    });
    return;
  }
  const big = Math.random() > 0.65;
  let size = 1;
  if (room.speed >= 9 && Math.random() < 0.22) size = 2;
  if (room.speed >= 12 && Math.random() < 0.08) size = 3;
  if (big && room.speed < 8) size = 1;
  if (!big && room.speed < 6) size = 1;
  if (big) {
    room.obstacles.push({
      id: oid,
      kind: 'cactusL',
      x,
      y: Math.round(90 * scale),
      w: CACTUS_L.w * size,
      h: CACTUS_L.h,
      size,
      frame: 0,
      wing: 0,
    });
  } else {
    room.obstacles.push({
      id: oid,
      kind: 'cactusS',
      x,
      y: Math.round(105 * scale),
      w: CACTUS_S.w * size,
      h: CACTUS_S.h,
      size,
      frame: 0,
      wing: 0,
    });
  }
}

function jumpDino(d, speed) {
  if (d.dead || d.fled || d.jumping) return;
  d.ducking = false;
  d.jumping = true;
  d.speedDrop = false;
  d.vy = -CFG.JUMP_V - speed / 10;
}

function duckOn(d) {
  if (d.dead || d.fled) return;
  d.wantDuck = true;
  if (d.jumping) {
    d.speedDrop = true;
    d.vy = Math.max(d.vy, 1);
    return;
  }
  d.ducking = true;
}

function duckOff(d) {
  d.wantDuck = false;
  d.speedDrop = false;
  d.ducking = false;
}

function updateDino(d, f) {
  if (d.dead || d.fled) return;
  if (d.blink > 0) d.blink--;
  if (d.jumping) {
    const g = d.speedDrop ? CFG.GRAVITY * CFG.SPEED_DROP : CFG.GRAVITY;
    d.vy += g * f;
    d.y += d.vy * f;
    if (d.y >= d.groundYPos) {
      d.y = d.groundYPos;
      d.vy = 0;
      d.jumping = false;
      d.speedDrop = false;
      d.ducking = !!d.wantDuck;
    }
  } else if (d.wantDuck) {
    d.ducking = true;
  } else {
    d.ducking = false;
  }
  d.timer += f * STEP;
  const rate = d.ducking ? 1000 / 8 : 1000 / 12;
  if (d.timer >= rate) {
    d.timer = 0;
    d.frame ^= 1;
  }
}

function r1(n) {
  return Math.round(Number(n) * 10) / 10;
}

/** 共享快照（不含 you），广播时每人只补 seat 下标 */
function snapshotState(room) {
  const t = now();
  return {
    id: room.id,
    status: room.status,
    speed: r1(room.speed),
    distance: (room.distance * 10) | 0, // 客户端 /10
    score: (room.distance / 100) | 0,
    message: room.message,
    floorY: CFG.H - CFG.BOTTOM,
    groundYPos: CFG.H - TREX_H - CFG.BOTTOM,
    W: CFG.W,
    H: CFG.H,
    t,
    players: room.players.map((p, idx) => ({
      seat: idx,
      userId: p.userId,
      nickname: p.nickname,
      x: r1(p.x),
      y: r1(p.y),
      jumping: p.jumping ? 1 : 0,
      ducking: p.ducking ? 1 : 0,
      dead: p.dead ? 1 : 0,
      fled: p.fled ? 1 : 0,
      vy: r1(p.vy || 0),
      frame: p.frame | 0,
      blink: p.blink | 0,
      reviveIn: p.dead && p.reviveAt ? Math.max(0, Math.ceil((p.reviveAt - t) / 1000)) : 0,
      connected: p.ws && !p.discAt ? 1 : 0,
    })),
    obstacles: room.obstacles.map((o) => ({
      id: o.id || 0,
      kind: o.kind === 'bird' ? 'b' : o.kind === 'cactusL' ? 'L' : 's',
      x: r1(o.x),
      y: r1(o.y),
      size: o.size || 1,
      frame: o.frame | 0,
      w: o.w | 0,
      h: o.h | 0,
    })),
  };
}

function hydrateSnapshot(raw) {
  const kindMap = { b: 'bird', L: 'cactusL', s: 'cactusS' };
  for (const o of raw.obstacles) o.kind = kindMap[o.kind] || o.kind;
  for (const p of raw.players) {
    p.jumping = !!p.jumping;
    p.ducking = !!p.ducking;
    p.dead = !!p.dead;
    p.fled = !!p.fled;
    p.connected = !!p.connected;
  }
  return raw;
}

function publicState(room, forUserId) {
  const state = hydrateSnapshot(snapshotState(room));
  state.distance = room.distance;
  state.you = room.players.findIndex((p) => p.userId === forUserId);
  for (const p of state.players) p.isMe = p.userId === forUserId;
  return state;
}

function broadcast(room) {
  const base = hydrateSnapshot(snapshotState(room));
  base.distance = room.distance;
  // 一份 JSON 发给所有人；客户端用自己的 userId 认人，避免 N 次重建+序列化
  const payload = JSON.stringify({ type: 'state', state: base });
  for (const p of room.players) {
    if (p.ws && p.ws.readyState === 1) {
      try {
        p.ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}

function stopLoop(room) {
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
}

function gameOver(room, msg) {
  room.status = 'ended';
  room.lastActive = now();
  room.message = (msg || '大家都挂了 · Game Over') + ' · 房主可再开一局';
  stopLoop(room);
  const score = (room.distance / 100) | 0;
  for (const p of room.players) {
    if (!p.userId || p.fled || p.isGuest) continue;
    recordDinoScore(p.userId, score).catch((err) => console.error(err));
  }
  broadcast(room);
}

function startGame(room) {
  room.status = 'playing';
  room.speed = CFG.SPEED;
  room.distance = 0;
  room.clearT = CFG.CLEAR_MS;
  room.obstacles = [];
  room.tickN = 0;
  room.message = '开跑！还有人活着就能救队友';
  placeLine(room.players);
  const gyp = CFG.H - TREX_H - CFG.BOTTOM;
  for (const p of room.players) {
    p.y = gyp;
    p.groundYPos = gyp;
    p.vy = 0;
    p.jumping = false;
    p.ducking = false;
    p.wantDuck = false;
    p.speedDrop = false;
    p.dead = false;
    p.fled = false;
    p.reviveAt = 0;
    p.blink = 0;
    p.frame = 0;
    p.timer = 0;
  }
  stopLoop(room);
  let last = now();
  room.timer = setInterval(() => {
    const t = now();
    let dt = t - last;
    last = t;
    if (dt > 48) dt = 48;
    room.accum = (room.accum || 0) + dt;
    let steps = 0;
    while (room.accum >= STEP && steps < 2) {
      tick(room, STEP, t);
      room.accum -= STEP;
      steps++;
      if (room.status !== 'playing') break;
    }
    room.tickN = (room.tickN || 0) + 1;
    if (room.status === 'playing' && room.tickN % BROADCAST_EVERY === 0) {
      broadcast(room);
    }
  }, STEP);
  broadcast(room);
}

function tick(room, dt, t) {
  if (room.status !== 'playing') return;
  const f = dt / STEP;
  if (room.clearT > 0) room.clearT -= dt;
  room.speed += CFG.ACCELERATION * f;
  room.distance += room.speed * f;

  if (room.clearT <= 0) {
    const upcoming = room.obstacles.some((o) => o.x > CFG.W - 160);
    if (!upcoming) spawnObs(room);
  }

  for (let i = room.obstacles.length - 1; i >= 0; i--) {
    const o = room.obstacles[i];
    o.x -= room.speed * f;
    if (o.kind === 'bird') {
      o.wing = (o.wing || 0) + f * STEP;
      if (o.wing >= 1000 / 6) {
        o.wing = 0;
        o.frame ^= 1;
      }
    }
    if (o.x + o.w < -10) room.obstacles.splice(i, 1);
  }

  for (const d of room.players) {
    if (d.dead && !d.fled && d.reviveAt) {
      if (t >= d.reviveAt) {
        const ghost = { x: d.x + 4, y: d.groundYPos + 4, w: 36, h: 40 };
        if (room.obstacles.some((o) => obsBoxes(o).some((b) => aabb(ghost, b)))) {
          d.reviveAt = t + 350;
        } else {
          d.dead = false;
          d.reviveAt = 0;
          d.blink = 60;
          d.y = d.groundYPos;
          d.jumping = false;
          d.ducking = false;
          d.wantDuck = false;
          d.vy = 0;
        }
      }
      continue;
    }
    if (d.dead || d.fled) continue;
    updateDino(d, f);
    if (d.blink > 0) continue;
    const db = dinoBox(d);
    for (const o of room.obstacles) {
      if (obsBoxes(o).some((b) => aabb(db, b))) {
        d.dead = true;
        d.jumping = false;
        d.ducking = false;
        d.wantDuck = false;
        d.vy = 0;
        d.y = d.groundYPos;
        const alive = room.players.filter((p) => !p.dead && !p.fled);
        if (!alive.length) {
          gameOver(room, '大家都挂了 · Game Over');
          return;
        }
        d.reviveAt = t + REVIVE_MS;
        room.message = `${d.nickname} 出局，${Math.ceil(REVIVE_MS / 1000)} 秒后复活`;
        break;
      }
    }
  }
}

function prune() {
  const t = now();
  for (const [id, r] of rooms) {
    for (const p of r.players) {
      if (p.discAt && t - p.discAt > RECONNECT_MS) {
        p.ws = null;
        if (r.status === 'playing' && !p.dead && !p.fled) {
          p.dead = true;
          p.fled = true;
          p.reviveAt = 0;
          r.message = `${p.nickname} 断线超时，视为逃跑`;
          const alive = r.players.filter((x) => !x.dead && !x.fled);
          if (!alive.length) gameOver(r, '没人还在跑，对局结束');
          else broadcast(r);
        }
      }
    }
    if (t - r.lastActive > ROOM_TTL_MS || (r.status === 'ended' && t - r.lastActive > 60_000)) {
      stopLoop(r);
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
  return [...rooms.values()]
    .filter((r) => r.status === 'lobby' && r.players.length < MAX_PLAYERS)
    .map((r) => ({
      id: r.id,
      hostName: r.players[0]?.nickname || '房主',
      count: r.players.length,
      max: MAX_PLAYERS,
    }))
    .slice(0, 20);
}

export function stats() {
  prune();
  return { rooms: rooms.size, max: MAX_ROOMS };
}

export function createRoom(ws, user) {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    send(ws, { type: 'error', error: '房间已满，请稍后再试' });
    return null;
  }
  let id = makeCode();
  while (rooms.has(id)) id = makeCode();
  const host = makeDino(user, 0);
  host.ws = ws;
  host.discAt = 0;
  const room = {
    id,
    status: 'lobby',
    createdAt: now(),
    lastActive: now(),
    speed: CFG.SPEED,
    distance: 0,
    clearT: 0,
    obstacles: [],
    message: lobbyText(1),
    players: [host],
    timer: null,
    accum: 0,
    tickN: 0,
  };
  rooms.set(id, room);
  ws._dinoRoomId = id;
  ws._dinoIntentionalLeave = false;
  send(ws, { type: 'state', state: publicState(room, user.id) });
  return room;
}

export function joinRoom(ws, user, roomId) {
  prune();
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room) {
    send(ws, { type: 'error', error: '房间不存在' });
    return null;
  }
  if (room.status !== 'lobby') {
    send(ws, { type: 'error', error: '对局已开始' });
    return null;
  }
  if (room.players.some((p) => p.userId === user.id)) {
    send(ws, { type: 'error', error: '你已在房间中' });
    return null;
  }
  if (room.players.length >= MAX_PLAYERS) {
    send(ws, { type: 'error', error: '房间已满（最多 5 人）' });
    return null;
  }
  const guest = makeDino(user, room.players.length);
  guest.ws = ws;
  guest.discAt = 0;
  room.players.push(guest);
  placeLine(room.players);
  room.lastActive = now();
  room.message = lobbyText(room.players.length);
  ws._dinoRoomId = id;
  ws._dinoIntentionalLeave = false;
  broadcast(room);
  return room;
}

export function rejoinRoom(ws, user, roomId) {
  prune();
  const id = String(roomId || '')
    .trim()
    .toUpperCase();
  const room = rooms.get(id);
  if (!room) {
    send(ws, { type: 'error', error: '房间不存在或已结束' });
    return null;
  }
  const p = room.players.find((x) => x.userId === user.id);
  if (!p) {
    send(ws, { type: 'error', error: '你不在此房间' });
    return null;
  }
  try {
    if (p.ws && p.ws !== ws) p.ws.close?.();
  } catch {
    /* ignore */
  }
  p.ws = ws;
  p.discAt = 0;
  ws._dinoRoomId = id;
  ws._dinoIntentionalLeave = false;
  room.lastActive = now();
  send(ws, { type: 'state', state: publicState(room, user.id) });
  broadcast(room);
  return room;
}

export function leaveRoom(ws) {
  const id = ws._dinoRoomId;
  if (!id) return;
  const room = rooms.get(id);
  ws._dinoRoomId = null;
  if (!room) return;
  room.lastActive = now();
  const p = room.players.find((x) => x.ws === ws);
  if (!p) return;

  // 大厅 / 已结束：直接移出房间，方便同房再开或清房
  if (room.status === 'lobby' || room.status === 'ended') {
    room.players = room.players.filter((x) => x !== p);
    p.ws = null;
    if (!room.players.length) {
      stopLoop(room);
      rooms.delete(id);
      return;
    }
    placeLine(room.players);
    if (room.status === 'ended') {
      room.message = `${p.nickname} 离开了。房主可再开一局`;
    } else {
      room.message = `${p.nickname} 离开了。${lobbyText(room.players.length)}`;
    }
    broadcast(room);
    return;
  }

  if (room.status === 'playing' && !p.dead && !p.fled) {
    p.dead = true;
    p.fled = true;
    p.ws = null;
    p.reviveAt = 0;
    room.message = `${p.nickname} 逃跑了`;
    const alive = room.players.filter((x) => !x.dead && !x.fled);
    if (!alive.length) gameOver(room, '没人还在跑，对局结束');
    else broadcast(room);
    return;
  }
  p.ws = null;
  broadcast(room);
}

export function disconnectRoom(ws) {
  if (ws._dinoIntentionalLeave) {
    leaveRoom(ws);
    return;
  }
  const id = ws._dinoRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) return;
  const p = room.players.find((x) => x.ws === ws);
  if (!p) return;
  p.ws = null;
  p.discAt = now();
  room.lastActive = now();
  room.message = `${p.nickname} 断线，等待重连…`;
  broadcast(room);
}

export function handleMsg(ws, user, msg) {
  const id = ws._dinoRoomId;
  const room = id ? rooms.get(id) : null;
  if (!room) {
    send(ws, { type: 'error', error: '不在房间中' });
    return;
  }
  room.lastActive = now();
  const me = room.players.find((p) => p.userId === user.id);
  if (!me) {
    send(ws, { type: 'error', error: '你不在此房间' });
    return;
  }

  if (msg.type === 'chat') {
    const text = String(msg.text || '').trim().slice(0, 80);
    if (!text) return;
    const payload = {
      type: 'chat',
      from: me.nickname,
      userId: user.id,
      text,
      at: now(),
    };
    for (const p of room.players) send(p.ws, payload);
    return;
  }

  if (msg.type === 'start' || msg.type === 'again') {
    if (me.seat !== 0) {
      send(ws, { type: 'error', error: '只有房主可以开始' });
      return;
    }
    // lobby 首局 / ended 同房再来一局；playing 中不能重开
    if (room.status !== 'lobby' && room.status !== 'ended') {
      send(ws, { type: 'error', error: '对局进行中，不能重开' });
      return;
    }
    const connected = room.players.filter((p) => p.ws);
    if (connected.length < 2) {
      send(ws, { type: 'error', error: '至少还要 2 人在线才能再开' });
      return;
    }
    if (room.players.length > MAX_PLAYERS) {
      send(ws, { type: 'error', error: '最多 5 人' });
      return;
    }
    // 踢掉已彻底离线的座位，避免空位占坑
    if (room.status === 'ended') {
      room.players = room.players.filter((p) => p.ws);
      placeLine(room.players);
      if (room.players.length < 2) {
        send(ws, { type: 'error', error: '至少还要 2 人在线才能再开' });
        broadcast(room);
        return;
      }
    }
    startGame(room);
    return;
  }

  if (room.status !== 'playing') return;
  if (me.dead || me.fled) return;

  if (msg.type === 'jump') {
    jumpDino(me, room.speed);
    broadcast(room); // 操作立刻同步，不等下一帧定时广播
    return;
  }
  if (msg.type === 'duck_on') {
    duckOn(me);
    broadcast(room);
    return;
  }
  if (msg.type === 'duck_off') {
    duckOff(me);
    broadcast(room);
  }
}

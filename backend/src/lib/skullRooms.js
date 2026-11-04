/**
 * Skull (骷髅牌) — in-memory rooms, server-authoritative hidden cards.
 * 3–6 players, light footprint.
 */

import { recordArcadeResult } from './arcadeStats.js';

const MAX_ROOMS = 6;
const ROOM_TTL_MS = 30 * 60 * 1000;
const RECONNECT_MS = 60 * 1000;
const ACTION_MS = 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

function freshHand() {
  return ['rose', 'rose', 'rose', 'skull'];
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

function alivePlayers(room) {
  return room.players.filter((p) => !p.eliminated);
}

function playerIndex(room, userId) {
  return room.players.findIndex((p) => p.userId === userId);
}

function nextAliveIdx(room, from) {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!room.players[idx].eliminated) return idx;
  }
  return from;
}

function totalStackCards(room) {
  return alivePlayers(room).reduce((s, p) => s + p.stack.length, 0);
}

function applySkullStats(room, { fleeOnly = false } = {}) {
  if (!room || room.statsRecorded || room.status !== 'ended') return;
  room.statsRecorded = true;
  const fleerIds = room.players
    .filter((p) => p.fled)
    .map((p) => Number(p.userId))
    .filter(Boolean);
  // 超时/逃跑导致终局：只记逃跑方，不给其余人胜/负
  if (fleeOnly) {
    recordArcadeResult({
      game: 'skull',
      winnerIds: [],
      loserIds: [],
      fleerIds,
    }).catch((e) => console.error('[skull stats]', e.message));
    return;
  }
  const winnerId = room.winnerId ? Number(room.winnerId) : null;
  const loserIds = room.players
    .map((p) => Number(p.userId))
    .filter((id) => id && id !== winnerId);
  recordArcadeResult({
    game: 'skull',
    winnerIds: winnerId ? [winnerId] : [],
    loserIds,
    fleerIds,
  }).catch((e) => console.error('[skull stats]', e.message));
}

function prune() {
  const t = now();
  for (const [id, r] of rooms) {
    for (const p of r.players) {
      if (p.discAt && t - p.discAt > RECONNECT_MS) {
        p.ws = null;
        // 对局中断线超时 → 视为逃跑淘汰
        if (r.status === 'playing' && !p.eliminated && !p.fled) {
          p.eliminated = true;
          p.fled = true;
          p.hand = [];
          p.stack = [];
          r.message = `${p.nickname} 断线超时，视为逃跑`;
          if (checkWin(r, { fleeOnly: true })) {
            broadcast(r);
          } else if (r.phase === 'reveal' || r.phase === 'discard' || r.phase === 'bid') {
            beginRound(r, `${p.nickname} 断线逃跑，重新放置`);
            broadcast(r);
          } else {
            r.turnIdx = nextAliveIdx(r, r.players.indexOf(p));
            armActionTimer(r);
            broadcast(r);
          }
        }
      }
    }
    if (t - r.lastActive > ROOM_TTL_MS || (r.status === 'ended' && t - r.lastActive > 60_000)) {
      clearActionTimer(r);
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
    if (r.status === 'lobby') {
      out.push({
        id: r.id,
        hostName: r.players[0]?.nickname || '房主',
        count: r.players.length,
        max: 6,
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

/** Public view for one spectator seat */
function publicState(room, forUserId) {
  const meIdx = playerIndex(room, forUserId);
  return {
    id: room.id,
    status: room.status,
    phase: room.phase,
    turnIdx: room.turnIdx,
    dealerIdx: room.dealerIdx,
    message: room.message,
    winnerId: room.winnerId,
    bid: room.bid
      ? {
          amount: room.bid.amount,
          bidderIdx: room.bid.bidderIdx,
          passed: [...room.bid.passed],
        }
      : null,
    challenge: room.challenge
      ? {
          challengerIdx: room.challenge.challengerIdx,
          target: room.challenge.target,
          flipped: room.challenge.flipped,
          needOwn: room.challenge.needOwn,
        }
      : null,
    discardFor: room.discardFor,
    players: room.players.map((p, idx) => {
      const isMe = p.userId === forUserId;
      const stackView = p.stack.map((card, i) => {
        const revealed = room.challenge?.flipped?.some(
          (f) => f.playerIdx === idx && f.stackPos === i
        );
        if (revealed || (isMe && room.phase !== 'place' && room.phase !== 'bid')) {
          // during place/bid hide even own values from others; self sees own stack values always
        }
        if (isMe) return { face: card, revealed: true };
        if (revealed) return { face: card, revealed: true };
        return { face: 'back', revealed: false };
      });
      // Own stack: always show faces to owner (they placed them)
      const myStack = isMe
        ? p.stack.map((card) => ({ face: card, revealed: true }))
        : stackView;
      return {
        userId: p.userId,
        nickname: p.nickname,
        student_id: p.student_id,
        score: p.score,
        eliminated: p.eliminated,
        connected: !!p.ws && !p.discAt,
        handCount: p.hand.length,
        hand: isMe ? [...p.hand] : null,
        stack: myStack,
        stackCount: p.stack.length,
        isMe,
        seat: idx,
      };
    }),
    you: meIdx,
    totalCards: totalStackCards(room),
    actionEndsAt: room.actionEndsAt || 0,
    actionSec: Math.ceil(ACTION_MS / 1000),
  };
}

function broadcast(room, extraByUser = null) {
  for (const p of room.players) {
    if (!p.ws) continue;
    const state = publicState(room, p.userId);
    if (extraByUser && extraByUser[p.userId]) Object.assign(state, extraByUser[p.userId]);
    send(p.ws, { type: 'state', state });
  }
}

function returnAllToHands(room) {
  if (room.challenge?.flipped?.length) {
    for (const f of room.challenge.flipped) {
      const p = room.players[f.playerIdx];
      if (p && !p.eliminated) p.hand.push(f.face);
    }
  }
  for (const p of room.players) {
    if (p.eliminated) continue;
    p.hand.push(...p.stack);
    p.stack = [];
  }
}

function clearActionTimer(room) {
  if (room.actionTimer) {
    clearTimeout(room.actionTimer);
    room.actionTimer = null;
  }
}

function actorIdx(room) {
  if (room.phase === 'discard' && room.discardFor != null) return room.discardFor;
  if (room.phase === 'reveal' && room.challenge) return room.challenge.challengerIdx;
  return room.turnIdx;
}

function armActionTimer(room) {
  clearActionTimer(room);
  if (room.status !== 'playing') return;
  const expectedIdx = actorIdx(room);
  const expectedPhase = room.phase;
  room.actionEndsAt = now() + ACTION_MS;
  room.actionTimer = setTimeout(() => {
    if (room.status !== 'playing') return;
    if (room.phase !== expectedPhase) return;
    if (actorIdx(room) !== expectedIdx) return;
    const p = room.players[expectedIdx];
    if (!p || p.eliminated || p.fled) return;
    p.eliminated = true;
    p.fled = true;
    p.hand = [];
    p.stack = [];
    p.ws = null;
    room.message = `${p.nickname} 超过 60 秒未操作，视为逃跑`;
    clearActionTimer(room);
    if (checkWin(room, { fleeOnly: true })) {
      broadcast(room);
      return;
    }
    // 中途逃跑：重置到放置，避免竞标/翻牌状态卡死
    if (room.phase === 'reveal' || room.phase === 'discard' || room.phase === 'bid') {
      beginRound(room, `${p.nickname} 逃跑，重新开始放置`);
    } else {
      room.turnIdx = nextAliveIdx(room, expectedIdx);
      armActionTimer(room);
    }
    broadcast(room);
  }, ACTION_MS);
}

function beginRound(room, msg) {
  returnAllToHands(room);
  room.phase = 'place';
  room.bid = null;
  room.challenge = null;
  room.discardFor = null;
  room.turnIdx = nextAliveIdx(room, room.dealerIdx - 1);
  room.message = msg || '放置阶段：出一张牌，或在已有牌后宣布竞标';
  armActionTimer(room);
}

function checkWin(room, { fleeOnly = false } = {}) {
  const alive = alivePlayers(room);
  if (alive.length === 1) {
    room.status = 'ended';
    room.phase = 'ended';
    room.winnerId = alive[0].userId;
    room.message = fleeOnly
      ? `${alive[0].nickname} 为最后留下的玩家`
      : `${alive[0].nickname} 为最后幸存者，获胜！`;
    clearActionTimer(room);
    applySkullStats(room, { fleeOnly });
    return true;
  }
  for (const p of alive) {
    if (p.score >= 2) {
      room.status = 'ended';
      room.phase = 'ended';
      room.winnerId = p.userId;
      room.message = `${p.nickname} 成功挑战 2 次，获胜！`;
      clearActionTimer(room);
      applySkullStats(room);
      return true;
    }
  }
  return false;
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
    status: 'lobby',
    phase: 'lobby',
    createdAt: now(),
    lastActive: now(),
    dealerIdx: 0,
    turnIdx: 0,
    bid: null,
    challenge: null,
    discardFor: null,
    message: '等待玩家加入（3–6 人）',
    winnerId: null,
    statsRecorded: false,
    players: [
      {
        userId: user.id,
        nickname: user.nickname || user.student_id,
        student_id: user.student_id,
        ws,
        hand: freshHand(),
        stack: [],
        score: 0,
        eliminated: false,
        fled: false,
        discAt: 0,
      },
    ],
  };
  rooms.set(id, room);
  ws._skullRoomId = id;
  ws._skullIntentionalLeave = false;
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
  if (room.status !== 'lobby') {
    send(ws, { type: 'error', error: '对局已开始，请用重连' });
    return null;
  }
  if (room.players.some((p) => p.userId === user.id)) {
    send(ws, { type: 'error', error: '你已在房间中' });
    return null;
  }
  if (room.players.length >= 6) {
    send(ws, { type: 'error', error: '房间已满（最多 6 人）' });
    return null;
  }
  room.players.push({
    userId: user.id,
    nickname: user.nickname || user.student_id,
    student_id: user.student_id,
    ws,
    hand: freshHand(),
    stack: [],
    score: 0,
    eliminated: false,
    fled: false,
    discAt: 0,
  });
  ws._skullRoomId = id;
  ws._skullIntentionalLeave = false;
  room.lastActive = now();
  room.message = `${user.nickname || user.student_id} 加入了房间`;
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
  const p = room.players.find((x) => x.userId === user.id);
  if (!p) {
    send(ws, { type: 'error', error: '你不在此房间' });
    return null;
  }
  try {
    p.ws?.close?.();
  } catch {
    /* ignore */
  }
  p.ws = ws;
  p.discAt = 0;
  ws._skullRoomId = id;
  ws._skullIntentionalLeave = false;
  room.lastActive = now();
  room.message = `${p.nickname} 已重连`;
  broadcast(room);
  return room;
}

export function disconnectRoom(ws) {
  if (ws._skullIntentionalLeave) {
    leaveRoom(ws);
    return;
  }
  const id = ws._skullRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) {
    ws._skullRoomId = null;
    return;
  }
  const p = room.players.find((x) => x.ws === ws);
  if (!p) return;
  p.ws = null;
  p.discAt = now();
  ws._skullRoomId = null;
  room.lastActive = now();
  room.message = `${p.nickname} 断线，等待重连…`;
  broadcast(room);
  if (room.status === 'lobby' && room.players.every((x) => !x.ws)) {
    rooms.delete(id);
  }
}

export function leaveRoom(ws) {
  const id = ws._skullRoomId;
  if (!id) return;
  const room = rooms.get(id);
  if (!room) {
    ws._skullRoomId = null;
    return;
  }
  let pIdx = room.players.findIndex((x) => x.ws === ws);
  if (pIdx < 0 && ws._skullUser) pIdx = playerIndex(room, ws._skullUser.id);
  if (pIdx < 0) {
    ws._skullRoomId = null;
    return;
  }
  const leaving = room.players[pIdx];
  ws._skullRoomId = null;
  room.lastActive = now();

  if (room.status === 'lobby') {
    room.players.splice(pIdx, 1);
    if (!room.players.length) {
      rooms.delete(id);
      return;
    }
    room.message = `${leaving.nickname} 离开了`;
    if (room.dealerIdx >= room.players.length) room.dealerIdx = 0;
    if (room.turnIdx >= room.players.length) room.turnIdx = 0;
    broadcast(room);
    return;
  }

  // 已被淘汰：离开即可，不记逃跑、不影响对局
  if (leaving.eliminated || leaving.fled) {
    leaving.ws = null;
    leaving.discAt = 0;
    room.message = `${leaving.nickname} 已离开`;
    broadcast(room);
    return;
  }

  leaving.eliminated = true;
  leaving.fled = true;
  leaving.ws = null;
  leaving.hand = [];
  leaving.stack = [];
  room.message = `${leaving.nickname} 逃跑，视为淘汰`;
  if (checkWin(room, { fleeOnly: true })) {
    clearActionTimer(room);
    broadcast(room);
    return;
  }
  if (room.turnIdx === pIdx || room.players[room.turnIdx]?.eliminated) {
    room.turnIdx = nextAliveIdx(room, pIdx);
  }
  if (room.phase === 'reveal' || room.phase === 'discard' || room.phase === 'bid') {
    beginRound(room, `${leaving.nickname} 逃跑，重新开始放置`);
  } else {
    armActionTimer(room);
  }
  broadcast(room);
}

export function handleMsg(ws, user, msg) {
  const id = ws._skullRoomId;
  const room = id ? rooms.get(id) : null;
  if (!room) {
    send(ws, { type: 'error', error: '不在房间中' });
    return;
  }
  room.lastActive = now();
  const idx = playerIndex(room, user.id);
  if (idx < 0) {
    send(ws, { type: 'error', error: '不在房间中' });
    return;
  }
  const me = room.players[idx];
  if (me.eliminated && msg.type !== 'chat') {
    send(ws, { type: 'error', error: '你已被淘汰' });
    return;
  }

  try {
    if (msg.type === 'start') {
      if (room.players[0].userId !== user.id) throw new Error('只有房主可以开始');
      if (room.status !== 'lobby') throw new Error('已经开始了');
      if (room.players.length < 3) throw new Error('至少 3 人才能开始');
      room.status = 'playing';
      room.dealerIdx = 0;
      room.winnerId = null;
      room.statsRecorded = false;
      for (const p of room.players) {
        p.hand = freshHand();
        p.stack = [];
        p.score = 0;
        p.eliminated = false;
        p.fled = false;
      }
      beginRound(room, '游戏开始！放置阶段');
      broadcast(room);
      return;
    }

    if (msg.type === 'place') {
      if (room.phase !== 'place') throw new Error('当前不是放置阶段');
      if (room.turnIdx !== idx) throw new Error('还没轮到你');
      const card = msg.card === 'skull' ? 'skull' : msg.card === 'rose' ? 'rose' : null;
      if (!card) throw new Error('请选择玫瑰或骷髅');
      const hi = me.hand.indexOf(card);
      if (hi < 0) throw new Error('你没有这张牌');
      me.hand.splice(hi, 1);
      me.stack.push(card);
      room.message = `${me.nickname} 放置了 1 张牌`;
      room.turnIdx = nextAliveIdx(room, idx);
      armActionTimer(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'start_bid') {
      if (room.phase !== 'place') throw new Error('当前不是放置阶段');
      if (room.turnIdx !== idx) throw new Error('还没轮到你');
      if (me.stack.length < 1) throw new Error('至少先放 1 张牌才能竞标');
      // everyone alive should have at least 1? Classic: optional. Require all alive have ≥1 for fairness
      const missing = alivePlayers(room).filter((p) => p.stack.length < 1);
      if (missing.length) throw new Error('需所有存活玩家都至少放 1 张后才能竞标');
      const amount = Math.max(1, Math.min(totalStackCards(room), Number(msg.amount) || 1));
      room.phase = 'bid';
      room.bid = { amount, bidderIdx: idx, passed: new Set() };
      room.turnIdx = nextAliveIdx(room, idx);
      room.message = `${me.nickname} 竞标 ${amount}！其他人可加价或过`;
      armActionTimer(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'bid_raise') {
      if (room.phase !== 'bid' || !room.bid) throw new Error('当前不是竞标阶段');
      if (room.turnIdx !== idx) throw new Error('还没轮到你');
      if (room.bid.passed.has(user.id)) throw new Error('你已过牌');
      const amount = Number(msg.amount);
      const max = totalStackCards(room);
      if (!Number.isFinite(amount) || amount <= room.bid.amount) {
        throw new Error(`必须大于当前 ${room.bid.amount}`);
      }
      if (amount > max) throw new Error(`最多竞标 ${max}`);
      room.bid.amount = amount;
      room.bid.bidderIdx = idx;
      room.turnIdx = nextAliveIdx(room, idx);
      // skip already passed
      let guard = 0;
      while (room.bid.passed.has(room.players[room.turnIdx].userId) && guard++ < 12) {
        room.turnIdx = nextAliveIdx(room, room.turnIdx);
      }
      room.message = `${me.nickname} 加到 ${amount}`;
      maybeResolveBid(room);
      armActionTimer(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'bid_pass') {
      if (room.phase !== 'bid' || !room.bid) throw new Error('当前不是竞标阶段');
      if (room.turnIdx !== idx) throw new Error('还没轮到你');
      room.bid.passed.add(user.id);
      room.message = `${me.nickname} 过`;
      room.turnIdx = nextAliveIdx(room, idx);
      let guard = 0;
      while (
        room.players[room.turnIdx] &&
        room.bid.passed.has(room.players[room.turnIdx].userId) &&
        guard++ < 12
      ) {
        // if only bidder left, resolve
        const active = alivePlayers(room).filter((p) => !room.bid.passed.has(p.userId));
        if (active.length <= 1) break;
        room.turnIdx = nextAliveIdx(room, room.turnIdx);
      }
      maybeResolveBid(room);
      armActionTimer(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'reveal') {
      if (room.phase !== 'reveal' || !room.challenge) throw new Error('当前不是翻牌阶段');
      const ch = room.challenge;
      if (ch.challengerIdx !== idx) throw new Error('只有挑战者可以翻牌');
      const targetIdx = Number(msg.playerIdx);
      if (!Number.isInteger(targetIdx) || targetIdx < 0 || targetIdx >= room.players.length) {
        throw new Error('目标无效');
      }
      const target = room.players[targetIdx];
      if (target.eliminated || !target.stack.length) throw new Error('该玩家没有可翻的牌');

      // Must finish own stack first
      const self = room.players[ch.challengerIdx];
      const ownLeft = self.stack.length - ch.flipped.filter((f) => f.playerIdx === ch.challengerIdx).length;
      // Actually we remove from stack as we flip — track via stack mutation
      if (targetIdx !== ch.challengerIdx) {
        const ownStill = self.stack.length > 0;
        if (ownStill) throw new Error('请先翻完自己的牌');
      } else {
        // flipping own: must flip from top (end of array)
      }

      const card = target.stack.pop(); // top of pile
      const stackPos = target.stack.length; // position after pop (for view; use flipped list)
      ch.flipped.push({ playerIdx: targetIdx, face: card, by: idx });
      room.message = `${me.nickname} 翻开了 ${target.nickname} 的「${card === 'rose' ? '玫瑰' : '骷髅'}」`;

      if (card === 'skull') {
        // return everything to hands, then challenger discards one
        returnAllToHands(room);
        room.challenge = null;
        room.phase = 'discard';
        room.discardFor = idx;
        room.message = `翻到骷髅！${self.nickname} 挑战失败，请选择丢弃一张牌`;
        armActionTimer(room);
        broadcast(room);
        return;
      }

      const roses = ch.flipped.filter((f) => f.face === 'rose').length;
      if (roses >= ch.target) {
        self.score += 1;
        room.message = `${self.nickname} 挑战成功！得分 ${self.score}/2`;
        if (checkWin(room)) {
          clearActionTimer(room);
          broadcast(room);
          return;
        }
        room.dealerIdx = nextAliveIdx(room, room.dealerIdx);
        beginRound(room, `${self.nickname} 成功！新一轮放置`);
        broadcast(room);
        return;
      }

      armActionTimer(room);
      broadcast(room);
      return;
    }

    if (msg.type === 'discard') {
      if (room.phase !== 'discard' || room.discardFor !== idx) throw new Error('现在不能弃牌');
      const card = msg.card === 'skull' ? 'skull' : msg.card === 'rose' ? 'rose' : null;
      if (!card) throw new Error('选择要丢弃的牌');
      const ci = me.hand.indexOf(card);
      if (ci < 0) throw new Error('你没有这张牌可弃');
      me.hand.splice(ci, 1);
      room.message = `${me.nickname} 丢弃了 1 张${card === 'rose' ? '玫瑰' : '骷髅'}`;
      if (me.hand.length === 0) {
        me.eliminated = true;
        room.message = `${me.nickname} 没有圆片了，淘汰！`;
        if (checkWin(room)) {
          clearActionTimer(room);
          broadcast(room);
          return;
        }
      }
      room.discardFor = null;
      room.dealerIdx = nextAliveIdx(room, room.dealerIdx);
      beginRound(room, '新一轮放置');
      broadcast(room);
      return;
    }

    if (msg.type === 'chat') {
      const text = String(msg.text || '').trim().slice(0, 80);
      if (!text) return;
      const label = me.nickname || me.student_id || '玩家';
      const payload = {
        type: 'chat',
        from: label,
        nickname: label,
        student_id: me.student_id || '',
        userId: me.userId,
        text,
        at: now(),
      };
      for (const p of room.players) {
        send(p.ws, payload);
      }
    }
  } catch (e) {
    send(ws, { type: 'error', error: e.message || '操作失败' });
  }
}

function maybeResolveBid(room) {
  const bid = room.bid;
  if (!bid) return;
  const contenders = alivePlayers(room).filter((p) => !bid.passed.has(p.userId));
  if (contenders.length === 1) {
    const ch = contenders[0];
    const challengerIdx = room.players.indexOf(ch);
    room.phase = 'reveal';
    room.challenge = {
      challengerIdx,
      target: bid.amount,
      flipped: [],
      needOwn: true,
    };
    room.turnIdx = challengerIdx;
    room.message = `${ch.nickname} 成为挑战者，需翻出 ${bid.amount} 朵玫瑰（先翻自己）`;
  } else if (contenders.length === 0) {
    // shouldn't happen — restore bidder
    room.phase = 'reveal';
    room.challenge = {
      challengerIdx: bid.bidderIdx,
      target: bid.amount,
      flipped: [],
      needOwn: true,
    };
    room.turnIdx = bid.bidderIdx;
  }
}

setInterval(prune, 30_000).unref?.();

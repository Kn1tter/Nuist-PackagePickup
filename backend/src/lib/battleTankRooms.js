/**
 * 经典坦克大战风格 · 迷宫联机（服务端权威）
 * 房间码开房，2–4 人，同步位置/炮塔/子弹
 */

const MAX_ROOMS = 24
const MAX_PLAYERS = 4
const MIN_START = 2
const TICK_MS = 50 // 20 Hz
const BROADCAST_EVERY = 1
const FIRE_CD = 0.38
const BULLET_SPEED = 260
const TANK_SPEED = 96
const TANK_R = 11
const LIVES = 3
const CELL = 32
const COLS = 19
const ROWS = 15
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const COLORS = ['#6ec8ff', '#ff7a6a', '#f0d27a', '#7ddea0']

const WALL = 1
const FLOOR = 0

/** @type {Map<string, any>} */
const rooms = new Map()

function now() {
  return Date.now()
}

function makeCode() {
  let c = ''
  for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]
  return c
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* ignore */
    }
  }
}

function createMaze(cols, rows, rng = Math.random) {
  const w = cols | 1
  const h = rows | 1
  const grid = Array.from({ length: h }, () => Array(w).fill(WALL))
  function carve(cx, cy) {
    grid[cy][cx] = FLOOR
    const dirs = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0
      ;[dirs[i], dirs[j]] = [dirs[j], dirs[i]]
    }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx
      const ny = cy + dy
      if (ny > 0 && ny < h - 1 && nx > 0 && nx < w - 1 && grid[ny][nx] === WALL) {
        grid[cy + (dy / 2)][cx + (dx / 2)] = FLOOR
        carve(nx, ny)
      }
    }
  }
  carve(1, 1)
  let loops = Math.floor((w * h) / 40)
  while (loops-- > 0) {
    const x = 1 + ((rng() * (w - 2)) | 0)
    const y = 1 + ((rng() * (h - 2)) | 0)
    if (grid[y][x] === WALL) {
      const n =
        (grid[y - 1]?.[x] === FLOOR ? 1 : 0) +
        (grid[y + 1]?.[x] === FLOOR ? 1 : 0) +
        (grid[y][x - 1] === FLOOR ? 1 : 0) +
        (grid[y][x + 1] === FLOOR ? 1 : 0)
      if (n >= 2) grid[y][x] = FLOOR
    }
  }
  return grid
}

function floorSpawns(grid) {
  const corners = [
    { c: 1, r: 1 },
    { c: COLS - 2, r: 1 },
    { c: 1, r: ROWS - 2 },
    { c: COLS - 2, r: ROWS - 2 },
  ]
  const out = []
  for (const p of corners) {
    if (grid[p.r]?.[p.c] === FLOOR) out.push(p)
  }
  if (out.length < 4) {
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (grid[r][c] === FLOOR) out.push({ c, r })
      }
    }
  }
  return out
}

function cellCenter(c, r) {
  return { x: (c + 0.5) * CELL, y: (r + 0.5) * CELL }
}

function blocked(grid, x, y, rad) {
  const samples = [
    [x, y],
    [x - rad, y],
    [x + rad, y],
    [x, y - rad],
    [x, y + rad],
  ]
  for (const [sx, sy] of samples) {
    const c = Math.floor(sx / CELL)
    const r = Math.floor(sy / CELL)
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true
    if (grid[r][c] === WALL) return true
  }
  return false
}

function moveEntity(grid, ent, vx, vy, dt) {
  const nx = ent.x + vx * dt
  if (!blocked(grid, nx, ent.y, TANK_R * 0.85)) ent.x = nx
  const ny = ent.y + vy * dt
  if (!blocked(grid, ent.x, ny, TANK_R * 0.85)) ent.y = ny
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    x: Math.round(p.x * 10) / 10,
    y: Math.round(p.y * 10) / 10,
    body: Math.round(p.body * 1000) / 1000,
    aim: Math.round(p.aim * 1000) / 1000,
    hp: p.hp,
    lives: p.lives,
    alive: p.alive,
    kills: p.kills,
    score: p.score,
  }
}

function snapshot(room) {
  return {
    type: 'state',
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    cell: CELL,
    cols: COLS,
    rows: ROWS,
    grid: room.status === 'lobby' ? undefined : room.grid,
    players: room.players.map(publicPlayer),
    bullets: room.bullets.map((b) => ({
      id: b.id,
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      ownerId: b.ownerId,
    })),
    winnerId: room.winnerId || null,
    t: now(),
  }
}

function broadcast(room, msg) {
  const payload = msg || snapshot(room)
  for (const p of room.players) send(p.ws, payload)
}

function lobbyInfo(room) {
  return {
    type: 'lobby',
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: !!p.ready,
    })),
    minStart: MIN_START,
    maxPlayers: MAX_PLAYERS,
  }
}

function stopTimer(room) {
  if (room.timer) {
    clearInterval(room.timer)
    room.timer = null
  }
}

function destroyRoom(code) {
  const room = rooms.get(code)
  if (!room) return
  stopTimer(room)
  rooms.delete(code)
}

function ensureRoomAlive(room) {
  room.touched = now()
}

function spawnPlayer(room, p, seat) {
  const spots = floorSpawns(room.grid)
  const spot = spots[seat % spots.length]
  const pos = cellCenter(spot.c, spot.r)
  p.x = pos.x
  p.y = pos.y
  p.body = 0
  p.aim = 0
  p.hp = 1
  p.alive = true
  p.fireCd = 0
  p.invuln = 1.2
  p.input = { up: false, down: false, left: false, right: false, fire: false, aim: 0 }
}

function startMatch(room) {
  room.grid = createMaze(COLS, ROWS)
  room.bullets = []
  room.bulletSeq = 1
  room.winnerId = null
  room.status = 'playing'
  room.players.forEach((p, i) => {
    p.lives = LIVES
    p.kills = 0
    p.score = 0
    spawnPlayer(room, p, i)
  })
  stopTimer(room)
  room.tickN = 0
  room.timer = setInterval(() => {
    tick(room, TICK_MS / 1000)
    room.tickN++
    if (room.tickN % BROADCAST_EVERY === 0) broadcast(room)
  }, TICK_MS)
  broadcast(room)
}

function endMatch(room, winnerId) {
  room.status = 'ended'
  room.winnerId = winnerId
  stopTimer(room)
  broadcast(room)
  broadcast(room, {
    type: 'ended',
    winnerId,
    players: room.players.map(publicPlayer),
  })
}

function tick(room, dt) {
  if (room.status !== 'playing') return
  ensureRoomAlive(room)

  for (const p of room.players) {
    if (!p.alive) continue
    p.fireCd = Math.max(0, p.fireCd - dt)
    p.invuln = Math.max(0, p.invuln - dt)
    const inp = p.input || {}
    let mx = 0
    let my = 0
    if (inp.up) my -= 1
    if (inp.down) my += 1
    if (inp.left) mx -= 1
    if (inp.right) mx += 1
    const mag = Math.hypot(mx, my)
    if (mag > 0) {
      mx /= mag
      my /= mag
      p.body = Math.atan2(my, mx)
      moveEntity(room.grid, p, mx * TANK_SPEED, my * TANK_SPEED, dt)
    }
    if (typeof inp.aim === 'number' && Number.isFinite(inp.aim)) p.aim = inp.aim
    if (inp.fire && p.fireCd <= 0) {
      p.fireCd = FIRE_CD
      const ang = p.aim
      room.bullets.push({
        id: room.bulletSeq++,
        x: p.x + Math.cos(ang) * 16,
        y: p.y + Math.sin(ang) * 16,
        vx: Math.cos(ang) * BULLET_SPEED,
        vy: Math.sin(ang) * BULLET_SPEED,
        ownerId: p.id,
        life: 1.4,
      })
    }
  }

  for (const b of room.bullets) {
    b.life -= dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (blocked(room.grid, b.x, b.y, 2)) {
      b.life = 0
      continue
    }
    for (const p of room.players) {
      if (!p.alive || p.id === b.ownerId || p.invuln > 0) continue
      const d = Math.hypot(p.x - b.x, p.y - b.y)
      if (d < TANK_R + 3) {
        b.life = 0
        p.hp -= 1
        if (p.hp <= 0) {
          p.alive = false
          p.lives -= 1
          const killer = room.players.find((x) => x.id === b.ownerId)
          if (killer) {
            killer.kills += 1
            killer.score += 100
          }
          if (p.lives > 0) {
            const seat = room.players.indexOf(p)
            setTimeout(() => {
              if (room.status !== 'playing') return
              if (!rooms.has(room.code)) return
              spawnPlayer(room, p, Math.max(0, seat))
              broadcast(room)
            }, 1800)
          }
        }
        break
      }
    }
  }
  room.bullets = room.bullets.filter((b) => b.life > 0)

  const living = room.players.filter((p) => p.lives > 0)
  if (living.length <= 1 && room.players.length >= MIN_START) {
    endMatch(room, living[0]?.id || null)
  }
}

export function stats() {
  let players = 0
  for (const r of rooms.values()) players += r.players.length
  return { rooms: rooms.size, players }
}

export function listWaitingRooms() {
  return [...rooms.values()]
    .filter((r) => r.status === 'lobby')
    .map((r) => ({
      code: r.code,
      players: r.players.length,
      maxPlayers: MAX_PLAYERS,
      host: r.players.find((p) => p.id === r.hostId)?.name || '房主',
    }))
    .slice(0, 20)
}

export function createRoom(ws, user) {
  if (rooms.size >= MAX_ROOMS) throw new Error('房间已满，稍后再开')
  leaveRoom(ws)
  let code = makeCode()
  while (rooms.has(code)) code = makeCode()
  const player = {
    id: user.id,
    name: user.name,
    color: COLORS[0],
    ws,
    ready: false,
    x: 0,
    y: 0,
    body: 0,
    aim: 0,
    hp: 1,
    lives: LIVES,
    alive: true,
    kills: 0,
    score: 0,
    fireCd: 0,
    invuln: 0,
    input: { up: false, down: false, left: false, right: false, fire: false, aim: 0 },
  }
  const room = {
    code,
    hostId: player.id,
    status: 'lobby',
    players: [player],
    grid: null,
    bullets: [],
    bulletSeq: 1,
    timer: null,
    tickN: 0,
    winnerId: null,
    touched: now(),
  }
  ws._btRoomId = code
  ws._btPlayerId = player.id
  rooms.set(code, room)
  send(ws, lobbyInfo(room))
  send(ws, { type: 'created', code })
  return room
}

export function joinRoom(ws, user, code) {
  const id = String(code || '')
    .trim()
    .toUpperCase()
  const room = rooms.get(id)
  if (!room) throw new Error('房间不存在')
  if (room.status !== 'lobby') throw new Error('对局已开始，无法加入')
  if (room.players.length >= MAX_PLAYERS) throw new Error('房间已满')
  if (room.players.some((p) => p.id === user.id)) throw new Error('你已在房间里')
  leaveRoom(ws)
  const player = {
    id: user.id,
    name: user.name,
    color: COLORS[room.players.length % COLORS.length],
    ws,
    ready: false,
    x: 0,
    y: 0,
    body: 0,
    aim: 0,
    hp: 1,
    lives: LIVES,
    alive: true,
    kills: 0,
    score: 0,
    fireCd: 0,
    invuln: 0,
    input: { up: false, down: false, left: false, right: false, fire: false, aim: 0 },
  }
  room.players.push(player)
  ws._btRoomId = room.code
  ws._btPlayerId = player.id
  ensureRoomAlive(room)
  for (const p of room.players) send(p.ws, lobbyInfo(room))
  return room
}

export function leaveRoom(ws) {
  const code = ws._btRoomId
  if (!code) return
  const room = rooms.get(code)
  ws._btRoomId = null
  ws._btPlayerId = null
  if (!room) return
  room.players = room.players.filter((p) => p.ws !== ws)
  if (!room.players.length) {
    destroyRoom(code)
    return
  }
  if (!room.players.some((p) => p.id === room.hostId)) {
    room.hostId = room.players[0].id
  }
  if (room.status === 'playing') {
    // keep match going; if alone ends soon via tick
    broadcast(room)
  } else {
    for (const p of room.players) send(p.ws, lobbyInfo(room))
  }
}

export function disconnectRoom(ws) {
  leaveRoom(ws)
}

export function handleMsg(ws, user, msg) {
  const room = rooms.get(ws._btRoomId)
  if (!room) {
    if (msg.type === 'list') {
      send(ws, { type: 'list', rooms: listWaitingRooms(), stats: stats() })
      return
    }
    throw new Error('不在房间内')
  }
  const me = room.players.find((p) => p.ws === ws)
  if (!me) throw new Error('玩家无效')

  if (msg.type === 'list') {
    send(ws, { type: 'list', rooms: listWaitingRooms(), stats: stats() })
    return
  }

  if (msg.type === 'start') {
    if (me.id !== room.hostId) throw new Error('只有房主可以开始')
    if (room.status !== 'lobby') throw new Error('已在对局中')
    if (room.players.length < MIN_START) throw new Error(`至少 ${MIN_START} 人才能开始`)
    startMatch(room)
    return
  }

  if (msg.type === 'restart') {
    if (me.id !== room.hostId) throw new Error('只有房主可以重开')
    if (room.players.length < MIN_START) throw new Error(`至少 ${MIN_START} 人`)
    startMatch(room)
    return
  }

  if (msg.type === 'input' && room.status === 'playing') {
    const aim = Number(msg.aim)
    me.input = {
      up: !!msg.up,
      down: !!msg.down,
      left: !!msg.left,
      right: !!msg.right,
      fire: !!msg.fire,
      aim: Number.isFinite(aim) ? aim : me.aim,
    }
    return
  }

  if (msg.type === 'ping') {
    send(ws, { type: 'pong', t: msg.t || now() })
  }
}

// GC stale lobby rooms
setInterval(() => {
  const t = now()
  for (const [code, room] of rooms) {
    if (room.status === 'lobby' && t - (room.touched || 0) > 45 * 60 * 1000) {
      destroyRoom(code)
    }
  }
}, 60_000)

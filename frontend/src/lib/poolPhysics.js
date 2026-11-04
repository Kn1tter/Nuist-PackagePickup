/** Tiny deterministic 8-ball physics (canvas units). */

export const TABLE_W = 720
export const TABLE_H = 360
export const BALL_R = 9
export const POCKET_R = 15.5
/** 越小摩擦越大、停得越快；原 0.991 满力大约滚十秒 */
const FRICTION = 0.978
const MIN_V = 0.05
const CUSHION = 18
const REST = 0.88
const SUBSTEPS = 4

const POCKETS = [
  [CUSHION, CUSHION],
  [TABLE_W / 2, CUSHION - 3],
  [TABLE_W - CUSHION, CUSHION],
  [CUSHION, TABLE_H - CUSHION],
  [TABLE_W / 2, TABLE_H - CUSHION + 3],
  [TABLE_W - CUSHION, TABLE_H - CUSHION],
]

const COLORS = {
  0: '#f5f0e6',
  1: '#f0c419',
  2: '#2b6cb0',
  3: '#e53e3e',
  4: '#553c9a',
  5: '#dd6b20',
  6: '#38a169',
  7: '#9b2c2c',
  8: '#1a202c',
  9: '#f0c419',
  10: '#2b6cb0',
  11: '#e53e3e',
  12: '#553c9a',
  13: '#dd6b20',
  14: '#38a169',
  15: '#9b2c2c',
}

export function ballColor(id) {
  return COLORS[id] || '#ccc'
}

export function isSolid(id) {
  return id >= 1 && id <= 7
}
export function isStripe(id) {
  return id >= 9 && id <= 15
}

function rackPositions() {
  const cx = TABLE_W * 0.72
  const cy = TABLE_H / 2
  const d = BALL_R * 2 + 0.4
  // 8 在三角中心；角球异色
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15]
  const spots = []
  let k = 0
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = cx + row * d * Math.cos(Math.PI / 6)
      const y = cy + (col - row / 2) * d
      spots.push({ id: order[k++], x, y })
    }
  }
  return spots
}

export function createInitialBalls() {
  const balls = [{ id: 0, x: TABLE_W * 0.28, y: TABLE_H / 2, vx: 0, vy: 0, pocketed: false }]
  for (const s of rackPositions()) {
    balls.push({ id: s.id, x: s.x, y: s.y, vx: 0, vy: 0, pocketed: false })
  }
  return balls
}

export function serializeBalls(balls) {
  return balls.map((b) => ({
    id: b.id,
    x: Math.round(b.x * 10) / 10,
    y: Math.round(b.y * 10) / 10,
    pocketed: !!b.pocketed,
  }))
}

export function applySerialized(balls, snap) {
  const map = new Map((snap || []).map((b) => [b.id, b]))
  for (const b of balls) {
    const s = map.get(b.id)
    if (!s) continue
    b.x = s.x
    b.y = s.y
    b.pocketed = !!s.pocketed
    b.vx = 0
    b.vy = 0
  }
}

function inPocket(x, y) {
  for (const [px, py] of POCKETS) {
    const dx = x - px
    const dy = y - py
    if (dx * dx + dy * dy < POCKET_R * POCKET_R) return true
  }
  return false
}

function bounceCushions(b) {
  const minX = CUSHION + BALL_R
  const maxX = TABLE_W - CUSHION - BALL_R
  const minY = CUSHION + BALL_R
  const maxY = TABLE_H - CUSHION - BALL_R
  // near pocket mouths: skip hard cushion push so balls can drop
  if (nearPocketMouth(b.x, b.y)) return
  if (b.x < minX) {
    b.x = minX
    b.vx = Math.abs(b.vx) * REST
  } else if (b.x > maxX) {
    b.x = maxX
    b.vx = -Math.abs(b.vx) * REST
  }
  if (b.y < minY) {
    b.y = minY
    b.vy = Math.abs(b.vy) * REST
  } else if (b.y > maxY) {
    b.y = maxY
    b.vy = -Math.abs(b.vy) * REST
  }
}

function nearPocketMouth(x, y) {
  for (const [px, py] of POCKETS) {
    if (Math.hypot(x - px, y - py) < POCKET_R + BALL_R + 2) return true
  }
  return false
}

function collide(a, b, onHit) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  let dist = Math.hypot(dx, dy)
  const min = BALL_R * 2
  if (dist >= min || dist === 0) return
  const nx = dx / dist
  const ny = dy / dist
  const overlap = (min - dist) / 2
  a.x -= nx * overlap
  a.y -= ny * overlap
  b.x += nx * overlap
  b.y += ny * overlap
  const dvx = a.vx - b.vx
  const dvy = a.vy - b.vy
  const vn = dvx * nx + dvy * ny
  if (vn <= 0) return
  // equal mass elastic along normal
  a.vx -= vn * nx
  a.vy -= vn * ny
  b.vx += vn * nx
  b.vy += vn * ny
  onHit?.(a, b)
}

export function allStopped(balls) {
  for (const b of balls) {
    if (b.pocketed) continue
    if (Math.abs(b.vx) > MIN_V || Math.abs(b.vy) > MIN_V) return false
  }
  return true
}

function stepOnce(balls, events, dt = 1) {
  const active = balls.filter((b) => !b.pocketed)
  for (const b of active) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    const fr = Math.pow(FRICTION, dt)
    b.vx *= fr
    b.vy *= fr
    if (Math.abs(b.vx) < MIN_V) b.vx = 0
    if (Math.abs(b.vy) < MIN_V) b.vy = 0
    if (inPocket(b.x, b.y)) {
      b.pocketed = true
      b.vx = 0
      b.vy = 0
      events?.pocketed?.push(b.id)
      continue
    }
    bounceCushions(b)
  }
  const live = balls.filter((b) => !b.pocketed)
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      collide(live[i], live[j], (a, b) => {
        if (events && events.firstHit == null) {
          if (a.id === 0) events.firstHit = b.id
          else if (b.id === 0) events.firstHit = a.id
        }
      })
    }
  }
}

/** One display frame = several substeps for smoother collisions */
export function step(balls, events) {
  const dt = 1 / SUBSTEPS
  for (let s = 0; s < SUBSTEPS; s++) stepOnce(balls, events, dt)
}

export function simulateShot(balls, angle, power) {
  const cue = balls.find((b) => b.id === 0)
  if (!cue || cue.pocketed) return { pocketed: [], firstHit: null }
  const spd = 1.8 + power * 12.5
  cue.vx = Math.cos(angle) * spd
  cue.vy = Math.sin(angle) * spd

  const pocketed = []
  let firstHit = null

  for (let i = 0; i < 3200; i++) {
    const ev = { pocketed: [], firstHit }
    step(balls, ev)
    for (const id of ev.pocketed) pocketed.push(id)
    if (firstHit == null && ev.firstHit != null) firstHit = ev.firstHit
    if (allStopped(balls)) break
  }
  for (const b of balls) {
    b.vx = 0
    b.vy = 0
  }
  return { pocketed, firstHit }
}

/** Predict aim guide: cue path until first hit + object ball leave direction */
export function predictGuide(balls, angle, maxDist = 280) {
  const cue = balls.find((b) => b.id === 0 && !b.pocketed)
  if (!cue) return null
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  let hit = null
  let hitT = maxDist
  for (const b of balls) {
    if (b.pocketed || b.id === 0) continue
    // ray-circle
    const ox = cue.x - b.x
    const oy = cue.y - b.y
    const bcoef = ox * ux + oy * uy
    const c = ox * ox + oy * oy - (BALL_R * 2) * (BALL_R * 2)
    const disc = bcoef * bcoef - c
    if (disc < 0) continue
    const t = -bcoef - Math.sqrt(disc)
    if (t > 0.5 && t < hitT) {
      hitT = t
      hit = b
    }
  }
  // cushion clip
  let wallT = maxDist
  const minX = CUSHION + BALL_R
  const maxX = TABLE_W - CUSHION - BALL_R
  const minY = CUSHION + BALL_R
  const maxY = TABLE_H - CUSHION - BALL_R
  if (ux > 0.001) wallT = Math.min(wallT, (maxX - cue.x) / ux)
  if (ux < -0.001) wallT = Math.min(wallT, (minX - cue.x) / ux)
  if (uy > 0.001) wallT = Math.min(wallT, (maxY - cue.y) / uy)
  if (uy < -0.001) wallT = Math.min(wallT, (minY - cue.y) / uy)

  const stopT = Math.min(hitT, wallT, maxDist)
  const end = { x: cue.x + ux * stopT, y: cue.y + uy * stopT }
  let leave = null
  if (hit && hitT <= wallT) {
    const nx = (end.x - hit.x) / (BALL_R * 2 || 1)
    const ny = (end.y - hit.y) / (BALL_R * 2 || 1)
    const nlen = Math.hypot(nx, ny) || 1
    leave = {
      from: { x: hit.x, y: hit.y },
      to: { x: hit.x + (nx / nlen) * 55, y: hit.y + (ny / nlen) * 55 },
      ballId: hit.id,
    }
  }
  return {
    from: { x: cue.x, y: cue.y },
    to: end,
    leave,
  }
}

export function resolveShot({ pocketed, firstHit, seat, group, balls, tableOpen }) {
  const cueScratch = pocketed.includes(0)
  const eightIn = pocketed.includes(8)
  const objectPocketed = pocketed.filter((id) => id !== 0 && id !== 8)

  let foul = false
  let message = ''
  let winner = null
  let nextTableOpen = tableOpen
  const nextGroup = { host: group.host ?? null, guest: group.guest ?? null }

  const opp = seat === 'host' ? 'guest' : 'host'

  if (firstHit == null && !cueScratch) {
    foul = true
    message = '未击中任何目标球'
  }

  if (cueScratch) {
    foul = true
    message = '母球落袋（自由球）'
    const cue = balls.find((b) => b.id === 0)
    if (cue) {
      cue.pocketed = false
      cue.x = TABLE_W * 0.28
      cue.y = TABLE_H / 2
    }
  }

  // Assign groups on first legally pocketed object ball while open
  if (tableOpen && objectPocketed.length && !foul) {
    const first = objectPocketed[0]
    if (isSolid(first) || isStripe(first)) {
      nextGroup[seat] = isSolid(first) ? 'solid' : 'stripe'
      nextGroup[opp] = isSolid(first) ? 'stripe' : 'solid'
      nextTableOpen = false
      const hostLabel = nextGroup.host === 'solid' ? '全色' : '花色'
      const guestLabel = nextGroup.guest === 'solid' ? '全色' : '花色'
      message = `已分色：房主${hostLabel} / 挑战者${guestLabel}`
    }
  }

  const myGroup = nextGroup[seat]

  // Wrong first contact after groups assigned
  if (!nextTableOpen && myGroup && firstHit != null) {
    const ok =
      firstHit === 8
        ? clearedGroup(balls, myGroup)
        : myGroup === 'solid'
          ? isSolid(firstHit)
          : isStripe(firstHit)
    if (!ok) {
      foul = true
      message = message.startsWith('已分色') ? message : '先碰到非目标球'
    }
  }

  if (eightIn) {
    const cleared = myGroup ? clearedGroup(balls, myGroup) : false
    if (!cleared || foul || cueScratch) {
      winner = opp
      message = opp === 'host' ? '8 号违例，房主获胜' : '8 号违例，挑战者获胜'
    } else {
      winner = seat
      message = seat === 'host' ? '房主清台获胜' : '挑战者清台获胜'
    }
    return {
      foul,
      message,
      winner,
      group: nextGroup,
      tableOpen: nextTableOpen,
      ballInHand: false,
      continueTurn: false,
      status: 'ended',
    }
  }

  let continueTurn = false
  if (!foul) {
    if (nextTableOpen) {
      continueTurn = objectPocketed.length > 0
    } else if (myGroup === 'solid') {
      continueTurn = objectPocketed.some(isSolid)
    } else if (myGroup === 'stripe') {
      continueTurn = objectPocketed.some(isStripe)
    }
  }

  return {
    foul,
    message: message || (continueTurn ? '继续击球' : '交换击球'),
    winner: null,
    group: nextGroup,
    tableOpen: nextTableOpen,
    ballInHand: !!foul,
    continueTurn,
    status: 'playing',
  }
}

function clearedGroup(balls, g) {
  if (g === 'solid') return balls.filter((b) => isSolid(b.id)).every((b) => b.pocketed)
  if (g === 'stripe') return balls.filter((b) => isStripe(b.id)).every((b) => b.pocketed)
  return false
}

export function drawTable(ctx, balls, opts = {}) {
  const {
    aimAngle = null,
    power = 0,
    aimPhase = null,
    ballInHand,
    guide = null,
  } = opts
  ctx.clearRect(0, 0, TABLE_W, TABLE_H)

  ctx.fillStyle = '#3d2914'
  ctx.fillRect(0, 0, TABLE_W, TABLE_H)
  const felt = ctx.createLinearGradient(0, CUSHION, 0, TABLE_H - CUSHION)
  felt.addColorStop(0, '#227a54')
  felt.addColorStop(1, '#1a5f42')
  ctx.fillStyle = felt
  ctx.fillRect(CUSHION, CUSHION, TABLE_W - CUSHION * 2, TABLE_H - CUSHION * 2)

  ctx.fillStyle = '#0d0d0d'
  for (const [px, py] of POCKETS) {
    ctx.beginPath()
    ctx.arc(px, py, POCKET_R - 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.moveTo(TABLE_W * 0.28, CUSHION)
  ctx.lineTo(TABLE_W * 0.28, TABLE_H - CUSHION)
  ctx.stroke()

  const cue = balls.find((b) => b.id === 0 && !b.pocketed)

  // aim guide / cue stick (Steam-like)
  if (cue && aimAngle != null && (aimPhase === 'aim' || aimPhase === 'power')) {
    const ux = Math.cos(aimAngle)
    const uy = Math.sin(aimAngle)
    // shot direction dashed
    if (guide) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1.4
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(guide.from.x, guide.from.y)
      ctx.lineTo(guide.to.x, guide.to.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath()
      ctx.arc(guide.to.x, guide.to.y, 3, 0, Math.PI * 2)
      ctx.fill()
      if (guide.leave) {
        ctx.strokeStyle = 'rgba(255,220,120,0.8)'
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(guide.leave.from.x, guide.leave.from.y)
        ctx.lineTo(guide.leave.to.x, guide.leave.to.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    // cue stick behind ball (opposite to aim), pull back with power
    const pull = aimPhase === 'power' ? 18 + power * 70 : 22
    const tipX = cue.x - ux * (BALL_R + 3 + pull * 0.15)
    const tipY = cue.y - uy * (BALL_R + 3 + pull * 0.15)
    const buttX = cue.x - ux * (BALL_R + pull + 70)
    const buttY = cue.y - uy * (BALL_R + pull + 70)
    const grad = ctx.createLinearGradient(tipX, tipY, buttX, buttY)
    grad.addColorStop(0, '#e8d5b5')
    grad.addColorStop(0.15, '#c4a574')
    grad.addColorStop(1, '#5c3d1e')
    ctx.strokeStyle = grad
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(buttX, buttY)
    ctx.stroke()
  }

  for (const b of balls) {
    if (b.pocketed) continue
    drawBall(ctx, b)
  }

  if (ballInHand) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '12px sans-serif'
    ctx.fillText('自由球：点击开球线后放置母球', CUSHION + 8, CUSHION + 16)
  }
}

function drawBall(ctx, b) {
  const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R)
  g.addColorStop(0, '#ffffffaa')
  g.addColorStop(0.35, ballColor(b.id))
  g.addColorStop(1, ballColor(b.id))
  ctx.beginPath()
  ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  ctx.stroke()
  if (isStripe(b.id)) {
    ctx.fillStyle = '#f7fafc'
    ctx.fillRect(b.x - BALL_R * 0.7, b.y - 3, BALL_R * 1.4, 6)
  }
  if (b.id !== 0) {
    ctx.fillStyle = b.id === 8 ? '#fff' : '#111'
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(b.id), b.x, b.y + 0.5)
  }
}

export function validCuePlace(x, y, balls) {
  const minX = CUSHION + BALL_R + 1
  const maxX = TABLE_W * 0.28
  const minY = CUSHION + BALL_R + 1
  const maxY = TABLE_H - CUSHION - BALL_R - 1
  if (x < minX || x > maxX || y < minY || y > maxY) return false
  for (const b of balls) {
    if (b.pocketed || b.id === 0) continue
    if (Math.hypot(b.x - x, b.y - y) < BALL_R * 2 + 1) return false
  }
  return true
}

export function groupLabelFor(seat, group, tableOpen) {
  const g = group?.[seat]
  if (!g) return tableOpen ? '开球台（未分色）' : '—'
  return g === 'solid' ? '你方：全色 1–7' : '你方：花色 9–15'
}

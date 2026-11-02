/**
 * Top-down flashlight maze CS — canvas engine.
 * Maze gen, wall-blocked cone vision, dots, shoot.
 */

const WALL = 1
const FLOOR = 0

export function createMaze(cols, rows, rng = Math.random) {
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
        grid[cy + dy / 2][cx + dx / 2] = FLOOR
        carve(nx, ny)
      }
    }
  }

  carve(1, 1)

  // sparse loops so combat isn't pure corridors
  let loops = Math.floor((w * h) / 45)
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

  return { grid, cols: w, rows: h }
}

function cellCenter(c, r, cell) {
  return { x: (c + 0.5) * cell, y: (r + 0.5) * cell }
}

function floorCells(grid) {
  const out = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === FLOOR) out.push({ c, r })
    }
  }
  return out
}

function dist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function angDiff(a, b) {
  return angNorm(a - b)
}

/** DDA ray vs maze walls; returns hit distance in world units */
function castRay(grid, cell, ox, oy, ang, maxDist) {
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  let x = ox / cell
  let y = oy / cell
  const rows = grid.length
  const cols = grid[0].length

  const stepX = dx >= 0 ? 1 : -1
  const stepY = dy >= 0 ? 1 : -1
  const tDeltaX = dx === 0 ? 1e30 : Math.abs(1 / dx)
  const tDeltaY = dy === 0 ? 1e30 : Math.abs(1 / dy)

  let mapX = Math.floor(x)
  let mapY = Math.floor(y)
  let tMaxX = dx === 0 ? 1e30 : ((dx > 0 ? mapX + 1 - x : x - mapX) * tDeltaX)
  let tMaxY = dy === 0 ? 1e30 : ((dy > 0 ? mapY + 1 - y : y - mapY) * tDeltaY)
  let t = 0

  for (let i = 0; i < 128; i++) {
    if (tMaxX < tMaxY) {
      t = tMaxX
      tMaxX += tDeltaX
      mapX += stepX
    } else {
      t = tMaxY
      tMaxY += tDeltaY
      mapY += stepY
    }
    if (t * cell >= maxDist) return maxDist
    if (mapY < 0 || mapY >= rows || mapX < 0 || mapX >= cols) return t * cell
    if (grid[mapY][mapX] === WALL) return t * cell
  }
  return maxDist
}

function pointVisible(grid, cell, ox, oy, aim, coneHalf, range, tx, ty) {
  const dx = tx - ox
  const dy = ty - oy
  const d = Math.hypot(dx, dy)
  if (d > range || d < 0.001) return d < 18
  const ang = Math.atan2(dy, dx)
  if (Math.abs(angDiff(ang, aim)) > coneHalf) return false
  const hit = castRay(grid, cell, ox, oy, ang, range)
  return hit >= d - 2
}

export function createGame(canvas, opts = {}) {
  const cell = opts.cell || 36
  const cols = opts.cols || 21
  const rows = opts.rows || 15
  const coneHalf = ((opts.coneDeg || 52) * Math.PI) / 180 / 2
  const lightRange = opts.lightRange || cell * 7.2

  const ctx = canvas.getContext('2d')
  const keys = new Set()
  const pointers = new Map()

  let maze = null
  let player = null
  let enemies = []
  let bullets = []
  let particles = []
  let exit = null
  let status = 'ready' // ready | playing | won | lost
  let kills = 0
  let muzzle = 0
  let shake = 0
  let lastT = 0
  let raf = 0
  let aimPointerId = null
  let moveStick = { active: false, dx: 0, dy: 0 }
  let fireHeld = false
  let fireCd = 0
  let cam = { x: 0, y: 0 }
  let hud = { message: '点击开始 · WASD 移动 · 鼠标瞄准射击' }

  const input = {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    aimWorld: true,
    shooting: false,
  }

  function spawn() {
    maze = createMaze(cols, rows)
    const floors = floorCells(maze.grid)
    const pick = () => floors[(Math.random() * floors.length) | 0]
    const start = floors.find((f) => f.c <= 3 && f.r <= 3) || pick()
    const far = floors
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(b.c - start.c, b.r - start.r) - Math.hypot(a.c - start.c, a.r - start.r)
      )
    exit = cellCenter(far[0].c, far[0].r, cell)
    const p = cellCenter(start.c, start.r, cell)
    player = {
      x: p.x,
      y: p.y,
      r: 6,
      speed: 118,
      hp: 3,
      aim: 0,
      aimSmooth: 0,
      invuln: 0,
    }
    enemies = []
    const n = Math.min(7, Math.max(4, (floors.length / 28) | 0))
    const used = new Set([`${start.c},${start.r}`, `${far[0].c},${far[0].r}`])
    for (let i = 0; i < n; i++) {
      let spot
      for (let t = 0; t < 40; t++) {
        spot = pick()
        const key = `${spot.c},${spot.r}`
        const dStart = Math.hypot(spot.c - start.c, spot.r - start.r)
        if (!used.has(key) && dStart > 4) {
          used.add(key)
          break
        }
      }
      const e = cellCenter(spot.c, spot.r, cell)
      enemies.push({
        x: e.x,
        y: e.y,
        r: 6,
        hp: 2,
        speed: 55 + Math.random() * 25,
        aim: Math.random() * Math.PI * 2,
        alert: 0,
        fireCd: 0.6 + Math.random(),
        alive: true,
        wanderT: 0,
        wx: e.x,
        wy: e.y,
      })
    }
    bullets = []
    particles = []
    kills = 0
    muzzle = 0
    shake = 0
    fireCd = 0
    status = 'playing'
    hud.message = '清掉光锥里的红点，或摸到出口'
  }

  function worldW() {
    return maze.cols * cell
  }
  function worldH() {
    return maze.rows * cell
  }

  function blocked(x, y, rad) {
    const samples = [
      [x, y],
      [x - rad, y],
      [x + rad, y],
      [x, y - rad],
      [x, y + rad],
    ]
    for (const [sx, sy] of samples) {
      const c = Math.floor(sx / cell)
      const r = Math.floor(sy / cell)
      if (r < 0 || c < 0 || r >= maze.rows || c >= maze.cols) return true
      if (maze.grid[r][c] === WALL) return true
    }
    return false
  }

  function moveEntity(ent, vx, vy, dt) {
    const nx = ent.x + vx * dt
    if (!blocked(nx, ent.y, ent.r * 0.85)) ent.x = nx
    const ny = ent.y + vy * dt
    if (!blocked(ent.x, ny, ent.r * 0.85)) ent.y = ny
  }

  function spawnMuzzle(x, y, ang) {
    muzzle = 1
    shake = 4
    for (let i = 0; i < 8; i++) {
      const a = ang + (Math.random() - 0.5) * 0.6
      const sp = 80 + Math.random() * 140
      particles.push({
        x: x + Math.cos(ang) * 10,
        y: y + Math.sin(ang) * 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.18 + Math.random() * 0.12,
        max: 0.3,
        color: i % 2 ? '#ffe08a' : '#ff9a3c',
        size: 2 + Math.random() * 2,
      })
    }
  }

  function spawnHit(x, y) {
    shake = Math.max(shake, 3)
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 40 + Math.random() * 120
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.25 + Math.random() * 0.2,
        max: 0.45,
        color: '#ff5a4a',
        size: 1.5 + Math.random() * 2.5,
      })
    }
  }

  function shoot(from, ang, friendly) {
    const speed = friendly ? 420 : 280
    bullets.push({
      x: from.x + Math.cos(ang) * 12,
      y: from.y + Math.sin(ang) * 12,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 0.7,
      friendly,
      r: 2.2,
    })
    if (friendly) spawnMuzzle(from.x, from.y, ang)
  }

  function update(dt) {
    if (status !== 'playing') return

    let mx = input.moveX
    let my = input.moveY
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1
    if (moveStick.active) {
      mx += moveStick.dx
      my += moveStick.dy
    }
    const mag = Math.hypot(mx, my)
    if (mag > 1) {
      mx /= mag
      my /= mag
    }
    moveEntity(player, mx * player.speed, my * player.speed, dt)

    let targetAim = player.aim
    if (input.aimWorld) {
      targetAim = Math.atan2(input.aimY - player.y, input.aimX - player.x)
    } else {
      targetAim = Math.atan2(input.aimY, input.aimX)
    }
    player.aim = targetAim
    // smooth cone sweep
    let diff = angDiff(player.aim, player.aimSmooth)
    player.aimSmooth += clamp(diff, -8 * dt, 8 * dt)

    fireCd = Math.max(0, fireCd - dt)
    const wantFire = input.shooting || fireHeld || keys.has('Space')
    if (wantFire && fireCd <= 0) {
      shoot(player, player.aimSmooth, true)
      fireCd = 0.22
    }

    muzzle = Math.max(0, muzzle - dt * 4)
    shake = Math.max(0, shake - dt * 18)
    player.invuln = Math.max(0, player.invuln - dt)

    // enemies
    for (const e of enemies) {
      if (!e.alive) continue
      const seePlayer = pointVisible(
        maze.grid,
        cell,
        e.x,
        e.y,
        e.aim,
        coneHalf * 1.15,
        lightRange * 0.85,
        player.x,
        player.y
      )
      // also "hear" if close
      const dPlayer = dist(e, player)
      if (seePlayer || dPlayer < cell * 1.6) e.alert = 2.5
      e.alert = Math.max(0, e.alert - dt)

      if (e.alert > 0) {
        e.aim = Math.atan2(player.y - e.y, player.x - e.x)
        const chase = dPlayer > cell * 0.9
        if (chase) {
          moveEntity(
            e,
            Math.cos(e.aim) * e.speed,
            Math.sin(e.aim) * e.speed,
            dt
          )
        }
        e.fireCd -= dt
        if (e.fireCd <= 0 && seePlayer) {
          shoot(e, e.aim + (Math.random() - 0.5) * 0.12, false)
          e.fireCd = 0.85 + Math.random() * 0.4
        }
      } else {
        e.wanderT -= dt
        if (e.wanderT <= 0) {
          e.wanderT = 1.2 + Math.random() * 1.8
          const a = Math.random() * Math.PI * 2
          e.wx = e.x + Math.cos(a) * cell * 2
          e.wy = e.y + Math.sin(a) * cell * 2
        }
        const wa = Math.atan2(e.wy - e.y, e.wx - e.x)
        e.aim += angDiff(wa, e.aim) * Math.min(1, 3 * dt)
        moveEntity(e, Math.cos(e.aim) * e.speed * 0.45, Math.sin(e.aim) * e.speed * 0.45, dt)
      }

      if (dPlayer < player.r + e.r + 2 && player.invuln <= 0) {
        player.hp -= 1
        player.invuln = 0.9
        shake = 8
        spawnHit(player.x, player.y)
        if (player.hp <= 0) {
          status = 'lost'
          hud.message = '被击倒了 · 点重开再来'
        }
      }
    }

    // bullets
    for (const b of bullets) {
      b.life -= dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (blocked(b.x, b.y, 1)) {
        b.life = 0
        continue
      }
      if (b.friendly) {
        for (const e of enemies) {
          if (!e.alive) continue
          if (dist(b, e) < e.r + b.r + 2) {
            e.hp -= 1
            b.life = 0
            spawnHit(e.x, e.y)
            if (e.hp <= 0) {
              e.alive = false
              kills += 1
            }
            break
          }
        }
      } else if (player.invuln <= 0 && dist(b, player) < player.r + b.r + 2) {
        player.hp -= 1
        player.invuln = 0.75
        b.life = 0
        shake = 7
        spawnHit(player.x, player.y)
        if (player.hp <= 0) {
          status = 'lost'
          hud.message = '被击倒了 · 点重开再来'
        }
      }
    }
    bullets = bullets.filter((b) => b.life > 0)

    for (const p of particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.9
      p.vy *= 0.9
    }
    particles = particles.filter((p) => p.life > 0)

    if (enemies.every((e) => !e.alive)) {
      status = 'won'
      hud.message = '清场完成 · 点重开再刷一张图'
    } else if (dist(player, exit) < 14) {
      status = 'won'
      hud.message = '摸到出口 · 点重开再刷一张图'
    }
  }

  function drawTankUnit(x, y, bodyAng, aimAng, color, flash) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(bodyAng || 0)
    ctx.fillStyle = '#12161c'
    ctx.fillRect(-11, -8, 22, 16)
    ctx.fillStyle = flash ? '#9ad0ff' : color
    ctx.fillRect(-9, -6, 18, 12)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(-9, -6, 18, 2.5)
    ctx.fillRect(-9, 3.5, 18, 2.5)
    ctx.restore()
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(aimAng || 0)
    ctx.fillStyle = '#d7e0ea'
    ctx.beginPath()
    ctx.arc(0, 0, 4.8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(2, -2, 13, 4)
    ctx.restore()
  }

  function drawLightMask() {
    const rays = 72
    const ox = player.x
    const oy = player.y
    const aim = player.aimSmooth
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    for (let i = 0; i <= rays; i++) {
      const t = i / rays
      const ang = aim - coneHalf + t * coneHalf * 2
      const d = castRay(maze.grid, cell, ox, oy, ang, lightRange)
      ctx.lineTo(ox + Math.cos(ang) * d, oy + Math.sin(ang) * d)
    }
    ctx.closePath()
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    // atmosphere base
    ctx.fillStyle = '#05070a'
    ctx.fillRect(0, 0, cssW, cssH)

    if (!maze || !player) {
      ctx.fillStyle = '#9aa7b5'
      ctx.font = '600 16px "IBM Plex Sans", "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(hud.message, cssW / 2, cssH / 2)
      return
    }

    cam.x = clamp(player.x - cssW / 2, 0, Math.max(0, worldW() - cssW))
    cam.y = clamp(player.y - cssH / 2, 0, Math.max(0, worldH() - cssH))
    const sx = (Math.random() - 0.5) * shake
    const sy = (Math.random() - 0.5) * shake

    ctx.save()
    ctx.translate(-cam.x + sx, -cam.y + sy)

    // floor + walls (dim ambient so maze edges readable near player)
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const x = c * cell
        const y = r * cell
        if (maze.grid[r][c] === WALL) {
          ctx.fillStyle = '#0a0c10'
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'
          ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
        } else {
          ctx.fillStyle = '#12161c'
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
        }
      }
    }

    // exit marker (only if in light later — draw now under fog)
    ctx.beginPath()
    ctx.arc(exit.x, exit.y, 10, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(70, 180, 140, 0.35)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(90, 220, 170, 0.7)'
    ctx.lineWidth = 2
    ctx.stroke()

    // lit pass inside cone
    ctx.save()
    drawLightMask()
    ctx.clip()

    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        const x = c * cell
        const y = r * cell
        if (maze.grid[r][c] === WALL) {
          ctx.fillStyle = '#1a222c'
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
          ctx.fillStyle = '#0b0e14'
          ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6)
        } else {
          const g = ctx.createRadialGradient(
            player.x,
            player.y,
            8,
            player.x,
            player.y,
            lightRange
          )
          g.addColorStop(0, '#2a3340')
          g.addColorStop(0.55, '#171c24')
          g.addColorStop(1, '#0e1218')
          ctx.fillStyle = g
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
        }
      }
    }

    // soft cone wash
    const wash = ctx.createRadialGradient(player.x, player.y, 4, player.x, player.y, lightRange)
    wash.addColorStop(0, 'rgba(255, 214, 140, 0.16)')
    wash.addColorStop(0.45, 'rgba(255, 180, 90, 0.06)')
    wash.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = wash
    ctx.fillRect(player.x - lightRange, player.y - lightRange, lightRange * 2, lightRange * 2)

    if (muzzle > 0) {
      const mx = player.x + Math.cos(player.aimSmooth) * 14
      const my = player.y + Math.sin(player.aimSmooth) * 14
      const flash = ctx.createRadialGradient(mx, my, 0, mx, my, 28)
      flash.addColorStop(0, `rgba(255,230,160,${0.55 * muzzle})`)
      flash.addColorStop(1, 'rgba(255,140,40,0)')
      ctx.fillStyle = flash
      ctx.beginPath()
      ctx.arc(mx, my, 28, 0, Math.PI * 2)
      ctx.fill()
    }

    // entities in light
    for (const e of enemies) {
      if (!e.alive) continue
      const vis = pointVisible(
        maze.grid,
        cell,
        player.x,
        player.y,
        player.aimSmooth,
        coneHalf,
        lightRange,
        e.x,
        e.y
      )
      if (!vis) continue
      drawTankUnit(e.x, e.y, e.aim, e.aim, '#e24b3b', false)
    }

    ctx.restore() // end light clip

    // fog of war outside cone (evenodd: screen rect minus flashlight polygon)
    ctx.beginPath()
    ctx.rect(cam.x - 40, cam.y - 40, cssW + 80, cssH + 80)
    drawLightMask()
    ctx.fillStyle = 'rgba(2, 3, 5, 0.92)'
    ctx.fill('evenodd')

    // cone rim
    drawLightMask()
    ctx.strokeStyle = 'rgba(255, 200, 120, 0.18)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // player tank always visible
    ctx.beginPath()
    ctx.arc(player.x, player.y, 16, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120, 190, 255, 0.08)'
    ctx.fill()
    const flash = player.invuln > 0 && ((player.invuln * 10) | 0) % 2
    drawTankUnit(player.x, player.y, player.aimSmooth, player.aimSmooth, '#6ec8ff', flash)

    // bullets / particles (respect light roughly)
    for (const b of bullets) {
      const vis =
        b.friendly ||
        pointVisible(
          maze.grid,
          cell,
          player.x,
          player.y,
          player.aimSmooth,
          coneHalf,
          lightRange,
          b.x,
          b.y
        )
      if (!vis && !b.friendly) continue
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fillStyle = b.friendly ? '#ffe6a0' : '#ff7a6a'
      ctx.fill()
    }
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.globalAlpha = 1
    }

    ctx.restore() // cam

    // HUD
    ctx.fillStyle = 'rgba(8, 12, 18, 0.55)'
    ctx.fillRect(12, 12, 220, 64)
    ctx.strokeStyle = 'rgba(140, 170, 200, 0.2)'
    ctx.strokeRect(12.5, 12.5, 219, 63)
    ctx.fillStyle = '#c5d2e0'
    ctx.font = '600 13px "IBM Plex Sans", "PingFang SC", sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`HP  ${'●'.repeat(Math.max(0, player.hp))}${'○'.repeat(Math.max(0, 3 - player.hp))}`, 24, 34)
    ctx.fillText(`击倒 ${kills}/${enemies.length}`, 24, 54)
    ctx.fillStyle = '#8fa0b2'
    ctx.font = '12px "IBM Plex Sans", "PingFang SC", sans-serif'
    ctx.fillText(status === 'playing' ? '光锥外是盲区' : hud.message, 24, 68)

    if (status !== 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, cssW, cssH)
      ctx.fillStyle = '#e8eef6'
      ctx.font = '700 22px "IBM Plex Sans", "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(status === 'won' ? '任务完成' : status === 'lost' ? '行动失败' : '迷宫夜战', cssW / 2, cssH / 2 - 12)
      ctx.fillStyle = '#9aabbc'
      ctx.font = '14px "IBM Plex Sans", "PingFang SC", sans-serif'
      ctx.fillText(hud.message, cssW / 2, cssH / 2 + 16)
      ctx.fillText('点击 / 轻触 开始', cssW / 2, cssH / 2 + 40)
    }
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016)
    lastT = t
    update(dt)
    draw()
    raf = requestAnimationFrame(frame)
  }

  function resize() {
    // css size driven by parent; draw() syncs buffer
  }

  function onKey(e, down) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault()
    }
    if (down) keys.add(e.code)
    else keys.delete(e.code)
  }

  function canvasToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: clientX - rect.left + cam.x,
      y: clientY - rect.top + cam.y,
    }
  }

  function onPointerDown(e) {
    canvas.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (status !== 'playing') {
      spawn()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const lx = e.clientX - rect.left
    const ly = e.clientY - rect.top
    // left half = move stick on touch; mouse always aims/shoots
    if (e.pointerType === 'touch' && lx < rect.width * 0.42) {
      moveStick.active = true
      moveStick.originX = e.clientX
      moveStick.originY = e.clientY
      moveStick.dx = 0
      moveStick.dy = 0
      moveStick.pid = e.pointerId
    } else {
      aimPointerId = e.pointerId
      const w = canvasToWorld(e.clientX, e.clientY)
      input.aimWorld = true
      input.aimX = w.x
      input.aimY = w.y
      input.shooting = e.pointerType !== 'touch'
      if (e.pointerType === 'touch') fireHeld = true
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (moveStick.active && e.pointerId === moveStick.pid) {
      const dx = e.clientX - moveStick.originX
      const dy = e.clientY - moveStick.originY
      const m = Math.hypot(dx, dy) || 1
      const dead = 12
      const reach = 56
      if (m < dead) {
        moveStick.dx = 0
        moveStick.dy = 0
      } else {
        const s = Math.min(1, (m - dead) / (reach - dead))
        moveStick.dx = (dx / m) * s
        moveStick.dy = (dy / m) * s
      }
      return
    }
    if (e.pointerId === aimPointerId || e.pointerType === 'mouse') {
      const w = canvasToWorld(e.clientX, e.clientY)
      input.aimWorld = true
      input.aimX = w.x
      input.aimY = w.y
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId)
    if (e.pointerId === moveStick.pid) {
      moveStick.active = false
      moveStick.dx = 0
      moveStick.dy = 0
      moveStick.pid = null
    }
    if (e.pointerId === aimPointerId) {
      aimPointerId = null
      input.shooting = false
      fireHeld = false
    }
    if (e.pointerType === 'mouse') input.shooting = false
  }

  function start() {
    lastT = performance.now()
    raf = requestAnimationFrame(frame)
    window.addEventListener('keydown', (e) => onKey(e, true))
    window.addEventListener('keyup', (e) => onKey(e, false))
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  function destroy() {
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', (e) => onKey(e, true))
    // note: anonymous listeners above won't detach — bind named below in vue wrapper preferentially
  }

  // expose named handlers so Vue can remove cleanly
  const api = {
    start() {
      lastT = performance.now()
      raf = requestAnimationFrame(frame)
    },
    stop() {
      cancelAnimationFrame(raf)
    },
    spawn,
    resize,
    setMove(x, y) {
      input.moveX = x
      input.moveY = y
    },
    setAimWorld(x, y) {
      input.aimWorld = true
      input.aimX = x
      input.aimY = y
    },
    setShooting(v) {
      input.shooting = !!v
      fireHeld = !!v
    },
    key(code, down) {
      if (down) keys.add(code)
      else keys.delete(code)
    },
    onPointerDown,
    onPointerMove,
    onPointerUp,
    getStatus: () => status,
    getHud: () => ({ ...hud, kills, hp: player?.hp ?? 0, status }),
  }

  // initial title screen draw
  status = 'ready'
  draw()

  return api
}

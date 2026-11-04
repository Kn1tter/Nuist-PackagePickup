/**
 * 谷歌小恐龙（原版精灵图）+ 无速度上限 + 单人 / 最多五人一起跑。
 * 绘制尽量精简：无地面纹路、无云、无夜间模式。
 */

export const MODE_SOLO = 'solo'
export const MODE_DUO = 'duo'

const FPS = 60
const STEP = 1000 / FPS
const REVIVE_MS = 5000

const CFG = {
  SPEED: 4, // 原版约 6，再降一点好上手
  ACCELERATION: 0.0007,
  MAX_SPEED: Infinity, // 突破原版 13
  GRAVITY: 0.6,
  JUMP_V: 10,
  DROP_V: 5,
  SPEED_DROP: 3,
  CLEAR_MS: 3200, // 开局多给点空档
  GAP: 1.05, // 加大间距，少刷仙人掌
  BOTTOM: 10,
}

/** LDPI 精灵坐标（chromium / wayou） */
const SP = {
  TREX: { x: 848, y: 2 },
  CACTUS_S: { x: 228, y: 2 },
  CACTUS_L: { x: 332, y: 2 },
  BIRD: { x: 134, y: 2 },
  HORIZON: { x: 2, y: 54 },
}

// 与 chromium Trex.config / animFrames 一致
const TREX_W = 44
const TREX_H = 47
const TREX_DW = 59
// 注意：下蹲在精灵图里仍是 59×47（脚下留白），不是 25 高
const RUN_FRAMES = [88, 132]
const DUCK_FRAMES = [264, 323]
const JUMP_FRAME = 0
const CRASH_FRAME = 220
const BIRD_W = 46
const BIRD_H = 40
const CACTUS_S = { w: 17, h: 35 }
const CACTUS_L = { w: 25, h: 50 }
const NET_H = 200
const NAME_COLORS = ['#535353', '#1f7a4d', '#c45c26', '#2b6cb0', '#7b2d8e']

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

class Dino {
  /**
   * @param {number} id
   * @param {number} groundYPos 精灵顶边贴地时的 y（与 chromium 一致）
   */
  constructor(id, groundYPos) {
    this.id = id
    this.groundYPos = groundYPos
    this.x = 50 + id * 36
    this.y = groundYPos // 精灵顶边
    this.vy = 0
    this.jumping = false
    this.ducking = false
    this.wantDuck = false
    this.speedDrop = false
    this.dead = false
    this.reviveAt = 0
    this.blink = 0
    this.frame = 0
    this.timer = 0
  }

  reset(groundYPos) {
    this.groundYPos = groundYPos
    this.x = 50 + this.id * 36
    this.y = groundYPos
    this.vy = 0
    this.jumping = false
    this.ducking = false
    this.wantDuck = false
    this.speedDrop = false
    this.dead = false
    this.reviveAt = 0
    this.blink = 0
  }

  jump(speed = 6) {
    if (this.dead || this.jumping) return
    this.ducking = false
    this.jumping = true
    this.speedDrop = false
    // chromium: INIITAL_JUMP_VELOCITY - speed/10，速度为负向上
    this.vy = -CFG.JUMP_V - speed / 10
  }

  duckOn() {
    if (this.dead) return
    this.wantDuck = true
    if (this.jumping) {
      this.speedDrop = true
      this.vy = Math.max(this.vy, 1) // chromium setSpeedDrop
      return
    }
    this.ducking = true
  }

  duckOff() {
    this.wantDuck = false
    this.speedDrop = false
    this.ducking = false
  }

  kill() {
    this.dead = true
    this.jumping = false
    this.ducking = false
    this.wantDuck = false
    this.speedDrop = false
    this.vy = 0
    this.y = this.groundYPos
  }

  scheduleRevive(now) {
    this.reviveAt = now + REVIVE_MS
  }

  tryRevive(now, obstacles) {
    if (!this.dead || now < this.reviveAt) return
    const box = { x: this.x + 4, y: this.groundYPos + 4, w: 36, h: 40 }
    if (obstacles.some((o) => aabb(box, o.box()))) {
      this.reviveAt = now + 350
      return
    }
    this.reset(this.groundYPos)
    this.blink = 60
  }

  update(f) {
    if (this.dead) return
    if (this.blink > 0) this.blink--

    if (this.jumping) {
      const g = this.speedDrop ? CFG.GRAVITY * CFG.SPEED_DROP : CFG.GRAVITY
      this.vy += g * f
      this.y += this.vy * f
      if (this.y >= this.groundYPos) {
        this.y = this.groundYPos
        this.vy = 0
        this.jumping = false
        this.speedDrop = false
        this.ducking = !!this.wantDuck
      }
    } else if (this.wantDuck) {
      this.ducking = true
    } else {
      this.ducking = false
    }

    this.timer += f * STEP
    // RUNNING 12fps，DUCKING 8fps
    const rate = this.ducking ? 1000 / 8 : 1000 / 12
    if (this.timer >= rate) {
      this.timer = 0
      this.frame ^= 1
    }
  }

  box() {
    // chromium Trex.collisionBoxes
    if (this.ducking) {
      return { x: this.x + 1, y: this.y + 18, w: 55, h: 25 }
    }
    return { x: this.x + 1, y: this.y + 18, w: 30, h: 25 }
  }

  /**
   * 精灵裁剪：与 Trex.draw 完全一致
   * 下蹲 source = 59×47（不是 25）
   * @returns {[number, number, number, number, number, number]} sx,sy,sw,sh,dw,dh
   */
  sprite() {
    const bx = SP.TREX.x
    const by = SP.TREX.y
    if (this.dead) return [bx + CRASH_FRAME, by, TREX_W, TREX_H, TREX_W, TREX_H]
    if (this.jumping) return [bx + JUMP_FRAME, by, TREX_W, TREX_H, TREX_W, TREX_H]
    if (this.ducking) {
      const fx = DUCK_FRAMES[this.frame & 1]
      return [bx + fx, by, TREX_DW, TREX_H, TREX_DW, TREX_H]
    }
    const fx = RUN_FRAMES[this.frame & 1]
    return [bx + fx, by, TREX_W, TREX_H, TREX_W, TREX_H]
  }
}

class Obs {
  constructor(kind, x, canvasH, size) {
    this.kind = kind
    this.x = x
    this.size = Math.min(3, Math.max(1, size | 0))
    this.gone = false
    this.wing = 0
    this.frame = 0
    // chromium：yPos 是精灵顶边；画布高 150 时小仙人掌 105、大 90、鸟 [100,75,50]
    const scale = canvasH / 150
    if (kind === 'bird') {
      this.w = BIRD_W
      this.h = BIRD_H
      const ys = [100, 75, 50].map((v) => Math.round(v * scale))
      this.y = ys[(Math.random() * 3) | 0]
    } else if (kind === 'cactusL') {
      this.w = CACTUS_L.w * this.size
      this.h = CACTUS_L.h
      this.y = Math.round(90 * scale)
    } else {
      this.w = CACTUS_S.w * this.size
      this.h = CACTUS_S.h
      this.y = Math.round(105 * scale)
    }
  }

  /** 多碰撞盒（对齐 chromium，大仙人掌不再用整图 AABB） */
  boxes() {
    if (this.kind === 'bird') {
      return [{ x: this.x + 8, y: this.y + 10, w: this.w - 14, h: this.h - 16 }]
    }
    if (this.kind === 'cactusL') {
      const unit = CACTUS_L.w
      const out = []
      for (let i = 0; i < this.size; i++) {
        const ox = this.x + i * unit
        // 比原版再收一点，避免「擦到像素边」也判定
        out.push(
          { x: ox + 7, y: this.y + 14, w: 5, h: 34 },
          { x: ox + 11, y: this.y + 4, w: 5, h: 42 },
          { x: ox + 15, y: this.y + 12, w: 6, h: 32 }
        )
      }
      return out
    }
    const unit = CACTUS_S.w
    const out = []
    for (let i = 0; i < this.size; i++) {
      const ox = this.x + i * unit
      out.push(
        { x: ox + 2, y: this.y + 9, w: 4, h: 24 },
        { x: ox + 5, y: this.y + 2, w: 5, h: 30 },
        { x: ox + 10, y: this.y + 6, w: 5, h: 12 }
      )
    }
    return out
  }

  box() {
    const bs = this.boxes()
    if (!bs.length) return { x: this.x, y: this.y, w: this.w, h: this.h }
    let x0 = bs[0].x
    let y0 = bs[0].y
    let x1 = bs[0].x + bs[0].w
    let y1 = bs[0].y + bs[0].h
    for (let i = 1; i < bs.length; i++) {
      const b = bs[i]
      x0 = Math.min(x0, b.x)
      y0 = Math.min(y0, b.y)
      x1 = Math.max(x1, b.x + b.w)
      y1 = Math.max(y1, b.y + b.h)
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  update(f, speed) {
    this.x -= speed * f
    if (this.kind === 'bird') {
      this.wing += f * STEP
      if (this.wing >= 1000 / 6) {
        this.wing = 0
        this.frame ^= 1
      }
    }
    if (this.x + this.w < -10) this.gone = true
  }

  /** 仙人掌在精灵图里是成组贴好的，按 chromium 公式取源 x */
  sourceX() {
    if (this.kind === 'bird') return SP.BIRD.x + BIRD_W * this.frame
    if (this.kind === 'cactusL') {
      const w = CACTUS_L.w
      return (w * this.size) * (0.5 * (this.size - 1)) + SP.CACTUS_L.x
    }
    const w = CACTUS_S.w
    return (w * this.size) * (0.5 * (this.size - 1)) + SP.CACTUS_S.x
  }
}

export class DinoRunner {
  constructor(canvas, opts = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: false })
    this.ctx.imageSmoothingEnabled = false
    this.mode = MODE_SOLO
    this.net = !!opts.net
    this.onInput = opts.onInput || null
    this.onStatus = opts.onStatus || (() => {})
    this.onOver = opts.onOver || (() => {})
    this.netLabels = []

    this.W = 600
    this.H = this.net ? NET_H : 150
    this._scale = 1
    canvas.width = this.W
    canvas.height = this.H

    // chromium: groundYPos = HEIGHT - Trex.HEIGHT - BOTTOM_PAD
    this.groundYPos = this.H - TREX_H - CFG.BOTTOM
    this.floorY = this.H - CFG.BOTTOM
    this.sprite = null
    this.hidpi = false
    this.ready = false
    this.playing = false
    this.crashed = false
    this.speed = CFG.SPEED
    this.distance = 0
    this.hi = Number(localStorage.getItem(this.hiKey()) || 0)
    this.obstacles = []
    this.clearT = 0
    this.raf = 0
    this.last = 0
    this.accum = 0
    this.statusT = 0
    this._sk = ''

    this.dinos = this.makeDinos()
    this._kd = (e) => this.onKey(e, true)
    this._ku = (e) => this.onKey(e, false)
    window.addEventListener('keydown', this._kd, { passive: false })
    window.addEventListener('keyup', this._ku, { passive: false })
    this._onResize = () => this.draw()
    window.addEventListener('resize', this._onResize)

    this.loadSprite().then(() => {
      this.ready = true
      this.draw()
      this.emitStatus(true)
    })
  }

  /** 联机：用服务端快照驱动画面 */
  setNet(enabled) {
    this.stop()
    this.net = !!enabled
    this.mode = MODE_SOLO
    this.H = this.net ? NET_H : 150
    this.groundYPos = this.H - TREX_H - CFG.BOTTOM
    this.floorY = this.H - CFG.BOTTOM
    this.dinos = this.makeDinos()
    this.obstacles = []
    this.playing = false
    this.crashed = false
    this.hi = Number(localStorage.getItem(this.hiKey()) || 0)
    this.draw()
    this.emitStatus(true)
  }

  setNetUser(userId) {
    this.myUserId = userId != null ? Number(userId) : null
  }

  myDino() {
    if (this.myUserId == null) return this.dinos[0]
    const idx = (this._netSeats || []).findIndex((id) => Number(id) === this.myUserId)
    return this.dinos[idx >= 0 ? idx : 0]
  }

  startNetPaint() {
    if (this._paint) return
    this._paint = true
    this._netLast = performance.now()
    this.netLoop()
  }

  /** 联机：本地按物理外推，不等下一包快照 */
  simulateNet(dtMs) {
    const f = Math.min(2.5, dtMs / STEP)
    if (f <= 0) return
    this.speed += CFG.ACCELERATION * f
    this.distance += this.speed * f
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]
      o.x -= this.speed * f
      if (o.kind === 'bird') {
        o._wing = (o._wing || 0) + f * STEP
        if (o._wing >= 1000 / 6) {
          o._wing = 0
          o.frame ^= 1
        }
      }
      if (o.x + o.w < -10) this.obstacles.splice(i, 1)
    }
    for (const d of this.dinos) {
      if (d.dead) continue
      d.update(f)
    }
  }

  netLoop = () => {
    if (!this._paint) return
    this.raf = requestAnimationFrame(this.netLoop)
    const t = performance.now()
    const dt = Math.min(34, t - (this._netLast || t))
    this._netLast = t
    if (this.playing) this.simulateNet(dt)
    this.draw()
  }

  applyNetState(state) {
    if (!this.net || !state) return
    const wasPlaying = this.playing
    this.playing = state.status === 'playing'
    this.crashed = state.status === 'ended'
    // 权威纠正速度/距离（外推会略有偏差）
    if (state.speed != null) this.speed = state.speed
    if (state.distance != null) this.distance = state.distance
    if (state.H && state.H !== this.H) this.H = state.H
    if (state.floorY) this.floorY = state.floorY
    if (state.groundYPos) this.groundYPos = state.groundYPos
    const nowMs = performance.now()
    const players = state.players || []
    while (this.dinos.length < players.length) {
      this.dinos.push(new Dino(this.dinos.length, this.groundYPos))
    }
    this.dinos.length = Math.max(1, players.length)
    this.netLabels = players.map((p) => p.nickname || `P${(p.seat || 0) + 1}`)
    this._netSeats = players.map((p) => p.userId)
    const predicting = nowMs < (this._predUntil || 0)

    players.forEach((p, i) => {
      const d = this.dinos[i]
      if (!d) return
      const isMe = this.myUserId != null && Number(p.userId) === this.myUserId
      d.x = p.x
      d.userId = p.userId
      d.groundYPos = this.groundYPos
      d.dead = !!p.dead
      d.frame = p.frame || 0
      d.blink = p.blink || 0
      d.reviveAt = p.reviveIn > 0 ? nowMs + p.reviveIn * 1000 : 0

      if (isMe && predicting && !p.dead) {
        // 本地预测中：小误差保留手感，大误差才硬纠正
        d.ducking = !!p.ducking || d.wantDuck
        if (p.jumping && d.jumping) {
          if (Math.abs(d.y - p.y) > 28) {
            d.y = p.y
            d.vy = p.vy || 0
          }
        } else if (!d.jumping) {
          d.y = p.y
          d.vy = p.vy || 0
          d.jumping = !!p.jumping
          d.ducking = !!p.ducking
        }
      } else {
        d.y = p.y
        d.vy = p.vy || 0
        d.jumping = !!p.jumping
        d.ducking = !!p.ducking
        if (!p.ducking) d.wantDuck = false
      }
    })

    // 按障碍 id 对齐，便于外推后纠正
    const next = state.obstacles || []
    const byId = new Map()
    for (const o of this.obstacles || []) {
      if (o.netId) byId.set(o.netId, o)
    }
    const out = []
    for (const o of next) {
      const id = o.id || 0
      let obs = id ? byId.get(id) : null
      if (!obs) {
        // 兼容无 id：按种类近距离匹配
        obs = (this.obstacles || []).find(
          (c) => !out.includes(c) && c.kind === o.kind && Math.abs(c.x - o.x) < 40
        )
      }
      if (!obs) obs = new Obs(o.kind, o.x, this.H, o.size || 1)
      obs.netId = id
      obs.x = o.x
      obs.y = o.y
      obs.w = o.w || obs.w
      obs.h = o.h || obs.h
      obs.frame = o.frame || 0
      obs.size = o.size || 1
      out.push(obs)
    }
    this.obstacles = out
    this._netLast = nowMs
    // 与服务器 30 同步对齐的外推窗口（约两帧物理）
    this._netHorizon = 40

    if (this.playing) this.startNetPaint()
    else if (this._paint) {
      this.stop()
      this.draw()
    }

    const score = state.score ?? ((this.distance / 100) | 0)
    const uiKey = `${this.playing}|${this.crashed}|${score}|${players.map((p) => `${p.dead}:${p.reviveIn || 0}`).join(',')}`
    if (uiKey !== this._netUiKey || this.playing !== wasPlaying) {
      this._netUiKey = uiKey
      this.onStatus({
        mode: MODE_DUO,
        playing: this.playing,
        crashed: this.crashed,
        speed: this.speed,
        score,
        hi: this.hi,
        ready: this.ready,
        dinos: players.map((p, i) => ({
          id: i,
          label: p.nickname || `P${i + 1}`,
          dead: !!p.dead,
          reviveIn: p.reviveIn || 0,
        })),
      })
    }
  }

  hiKey() {
    return `nuist_dino_hi_${this.mode}`
  }

  makeDinos() {
    const n = this.mode === MODE_DUO ? 2 : 1
    return Array.from({ length: n }, (_, i) => new Dino(i, this.groundYPos))
  }

  loadSprite() {
    const img = new Image()
    img.decoding = 'async'
    // 优先 1x，体积小、绘制快；高分屏也直接放大绘制
    // v=2：完整 Chromium 图集（含下蹲/撞车帧）；旧 1204 宽图没有这些帧
    img.src = `${import.meta.env.BASE_URL}dino-sprite.png?v=2`
    return new Promise((resolve, reject) => {
      img.onload = () => {
        this.sprite = img
        this.hidpi = false
        resolve()
      }
      img.onerror = () => {
        const img2 = new Image()
        img2.src = `${import.meta.env.BASE_URL}dino-sprite-2x.png?v=2`
        img2.onload = () => {
          this.sprite = img2
          this.hidpi = true
          resolve()
        }
        img2.onerror = reject
      }
    })
  }

  setMode(mode) {
    // 本地只跑单人；双人成行走联机 setNet(true)
    if (mode === MODE_DUO) return
    this.setNet(false)
  }

  resetSoft() {
    this.playing = false
    this.crashed = false
    this.speed = CFG.SPEED
    this.distance = 0
    this.obstacles = []
    this.clearT = 0
    this.accum = 0
    this.dinos.forEach((d) => d.reset(this.groundYPos))
  }

  destroy() {
    this.stop()
    window.removeEventListener('keydown', this._kd)
    window.removeEventListener('keyup', this._ku)
    window.removeEventListener('resize', this._onResize)
  }

  onKey(e, down) {
    const c = e.code
    if (!['Space', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(c)) return
    e.preventDefault()
    const jump = c === 'Space' || c === 'ArrowUp' || c === 'KeyW'
    if (down && e.repeat && jump) return
    if (jump) this.inputJump(down)
    else if (c === 'ArrowDown' || c === 'KeyS') this.inputDuck(down)
  }

  /** 键盘 / 触屏共用 */
  inputJump(down = true) {
    if (!down) return
    if (this.net) {
      if (!this.playing) return
      const me = this.myDino()
      if (me && !me.dead) {
        me.jump(this.speed)
        this._predUntil = performance.now() + 160
      }
      this.onInput?.({ type: 'jump' })
      return
    }
    if (!this.playing) {
      this.start()
      return
    }
    this.dinos[0]?.jump(this.speed)
  }

  inputDuck(down = true) {
    if (this.net) {
      if (!this.playing) return
      const me = this.myDino()
      if (me && !me.dead) {
        if (down) me.duckOn()
        else me.duckOff()
        this._predUntil = performance.now() + 120
      }
      this.onInput?.({ type: down ? 'duck_on' : 'duck_off' })
      return
    }
    if (!down) {
      this.dinos[0]?.duckOff()
      return
    }
    if (!this.playing) return
    this.dinos[0]?.duckOn()
  }

  start() {
    if (this.net) return
    this.resetSoft()
    this.playing = true
    this.clearT = CFG.CLEAR_MS
    this.last = performance.now()
    this.loop()
    this.emitStatus(true)
  }

  stop() {
    this._paint = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  gameOver() {
    this.playing = false
    this.crashed = true
    const score = (this.distance / 100) | 0
    if (score > this.hi) {
      this.hi = score
      localStorage.setItem(this.hiKey(), String(score))
    }
    this.onOver(score)
    this.emitStatus(true)
    this.draw()
    this.stop()
  }

  emitStatus(force = false) {
    const score = (this.distance / 100) | 0
    const dinos = this.dinos.map((d) => ({
      id: d.id,
      label: d.id === 0 ? 'P1' : 'P2',
      dead: d.dead,
      reviveIn: d.dead && d.reviveAt ? Math.max(0, Math.ceil((d.reviveAt - performance.now()) / 1000)) : 0,
    }))
    const key = `${this.playing}|${this.crashed}|${score}|${this.speed.toFixed(0)}|${dinos.map((d) => d.reviveIn).join(',')}`
    if (!force && key === this._sk) return
    this._sk = key
    this.onStatus({
      mode: this.mode,
      playing: this.playing,
      crashed: this.crashed,
      speed: this.speed,
      score,
      hi: this.hi,
      dinos,
      ready: this.ready,
    })
  }

  spawn() {
    const bird = this.speed > 9.5 && Math.random() < 0.18
    const last = this.obstacles[this.obstacles.length - 1]
    // 更大间距：少刷、别扎堆
    const gap =
      Math.max(160, this.speed * 18 * CFG.GAP) + Math.random() * (80 + this.speed * 6)
    const x = last ? last.x + last.w + gap : this.W + 40
    if (bird) {
      this.obstacles.push(new Obs('bird', x, this.H, 1))
    } else {
      const big = Math.random() > 0.65
      // 多数单株；高速才偶尔 2 株，基本不出 3 株
      let size = 1
      if (this.speed >= 9 && Math.random() < 0.22) size = 2
      if (this.speed >= 12 && Math.random() < 0.08) size = 3
      if (big && this.speed < 8) size = 1
      if (!big && this.speed < 6) size = 1
      this.obstacles.push(new Obs(big ? 'cactusL' : 'cactusS', x, this.H, size))
    }
  }

  loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = now - this.last
    this.last = now
    if (dt > 48) dt = 48
    this.accum += dt
    let n = 0
    while (this.accum >= STEP && n < 5) {
      this.tick(STEP, now)
      this.accum -= STEP
      n++
      if (!this.playing) break
    }
    this.draw()
    this.statusT += dt
    if (this.statusT >= 250) {
      this.statusT = 0
      this.emitStatus()
    }
  }

  tick(dt, now) {
    if (!this.playing) return
    const f = dt / STEP

    if (this.clearT > 0) this.clearT -= dt
    this.speed += CFG.ACCELERATION * f
    this.distance += this.speed * f

    if (this.clearT <= 0) {
      // 场上右侧还空着一大截才刷下一个
      const upcoming = this.obstacles.some((o) => o.x > this.W - 160)
      if (!upcoming) this.spawn()
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].update(f, this.speed)
      if (this.obstacles[i].gone) this.obstacles.splice(i, 1)
    }

    for (const d of this.dinos) {
      if (d.dead) {
        d.tryRevive(now, this.obstacles)
        continue
      }
      d.update(f)
      if (d.blink > 0) continue
      const db = d.box()
      for (const o of this.obstacles) {
        if (o.boxes().some((ob) => aabb(db, ob))) {
          d.kill()
          if (this.mode === MODE_SOLO || !this.dinos.some((x) => !x.dead)) {
            this.gameOver()
            return
          }
          d.scheduleRevive(now)
          this.emitStatus(true)
          break
        }
      }
    }
  }

  /**
   * 画布位图对齐屏幕像素，精灵再落到整数像素上，避免高速时边沿发虚。
   */
  syncCanvas() {
    const el = this.canvas
    const cssW = el.clientWidth || this.W
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
    const bw = Math.max(1, Math.round(cssW * dpr))
    const bh = Math.max(1, Math.round(bw * (this.H / this.W)))
    if (el.width !== bw || el.height !== bh) {
      el.width = bw
      el.height = bh
    }
    this._scale = bw / this.W
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.fillStyle = '#f7f7f7'
    ctx.fillRect(0, 0, el.width, el.height)
  }

  /** 把游戏坐标换成设备像素，保证是整数 */
  z(v) {
    return Math.round(v * (this._scale || 1))
  }

  /**
   * 两次物理结算之间把匀速障碍补上，画面跟着刷新走，而不是一跳一截。
   * 刚结算完时和碰撞盒重合，之后最多超前一小步。
   */
  viewX(o) {
    if (!this.playing) return o.x
    if (this.net) return o.x // 联机已在 simulateNet 里外推
    const steps = Math.min(Math.max(this.accum, 0), STEP) / STEP
    return o.x - this.speed * steps
  }

  viewY(d) {
    if (!this.playing || !d.jumping) return d.y
    if (this.net) return d.y
    const steps = Math.min(Math.max(this.accum, 0), STEP) / STEP
    const y = d.y + (d.vy || 0) * steps
    return y > d.groundYPos ? d.groundYPos : y
  }

  /** 从精灵图画一块（自动处理 1x/2x），落在整数设备像素上 */
  blit(sx, sy, sw, sh, dx, dy, dw = sw, dh = sh) {
    if (!this.sprite) return
    const m = this.hidpi ? 2 : 1
    this.ctx.drawImage(
      this.sprite,
      Math.round(sx * m),
      Math.round(sy * m),
      Math.round(sw * m),
      Math.round(sh * m),
      this.z(dx),
      this.z(dy),
      Math.max(1, this.z(dw)),
      Math.max(1, this.z(dh))
    )
  }

  draw() {
    this.syncCanvas()
    const ctx = this.ctx
    const s = this._scale || 1
    ctx.fillStyle = '#535353'
    ctx.fillRect(0, this.z(this.floorY), this.z(this.W), Math.max(1, Math.round(s)))

    for (const o of this.obstacles) {
      const x = this.viewX(o)
      if (o.kind === 'bird') {
        this.blit(o.sourceX(), SP.BIRD.y, BIRD_W, BIRD_H, x, o.y)
      } else if (o.kind === 'cactusL') {
        this.blit(o.sourceX(), SP.CACTUS_L.y, CACTUS_L.w * o.size, CACTUS_L.h, x, o.y)
      } else {
        this.blit(o.sourceX(), SP.CACTUS_S.y, CACTUS_S.w * o.size, CACTUS_S.h, x, o.y)
      }
    }

    for (const d of this.dinos) {
      if (d.dead && d.reviveAt && !this.crashed) {
        ctx.globalAlpha = 0.25
      } else if (d.blink > 0 && d.blink % 6 < 3) {
        ctx.globalAlpha = 0.3
      } else {
        ctx.globalAlpha = 1
      }
      const [sx, sy, sw, sh, dw, dh] = d.sprite()
      const y = this.viewY(d)
      this.blit(sx, sy, sw, sh, d.x, y, dw, dh)
      ctx.globalAlpha = 1
      if (this.net || this.dinos.length > 1) {
        ctx.fillStyle = NAME_COLORS[d.id % NAME_COLORS.length]
        ctx.font = `${Math.max(10, Math.round(10 * s))}px Courier New,monospace`
        const lab = this.netLabels[d.id] || `P${d.id + 1}`
        ctx.fillText(lab.slice(0, 4), this.z(d.x + 2), this.z(y - 4))
        if (d.dead && d.reviveAt) {
          const sec = Math.max(0, Math.ceil((d.reviveAt - performance.now()) / 1000))
          ctx.fillText(`${sec}s`, this.z(d.x + 8), this.z(y + TREX_H - 8))
        }
      }
    }

    ctx.fillStyle = '#535353'
    ctx.font = `bold ${Math.max(12, Math.round(13 * s))}px Courier New,monospace`
    ctx.textAlign = 'right'
    const score = String((this.distance / 100) | 0).padStart(5, '0')
    const hi = String(this.hi | 0).padStart(5, '0')
    ctx.fillText(`HI ${hi}  ${score}`, this.z(this.W - 12), this.z(18))
    ctx.textAlign = 'left'
    ctx.font = `${Math.max(10, Math.round(11 * s))}px Courier New,monospace`
    ctx.fillText(`${this.speed.toFixed(1)}`, this.z(8), this.z(18))

    if (!this.ready) {
      ctx.textAlign = 'center'
      ctx.fillText('加载中…', this.z(this.W / 2), this.z(this.H / 2))
    } else if (!this.net && !this.playing && !this.crashed) {
      ctx.textAlign = 'center'
      ctx.font = `bold ${Math.max(12, Math.round(14 * s))}px Courier New,monospace`
      ctx.fillText('按空格开始', this.z(this.W / 2), this.z(this.H / 2 - 4))
    } else if (this.crashed) {
      ctx.textAlign = 'center'
      ctx.font = `bold ${Math.max(14, Math.round(18 * s))}px Courier New,monospace`
      ctx.fillText('G A M E  O V E R', this.z(this.W / 2), this.z(this.H / 2 - 8))
      if (!this.net) {
        ctx.font = `${Math.max(11, Math.round(12 * s))}px Courier New,monospace`
        ctx.fillText('按空格再来', this.z(this.W / 2), this.z(this.H / 2 + 14))
      }
    }
  }
}

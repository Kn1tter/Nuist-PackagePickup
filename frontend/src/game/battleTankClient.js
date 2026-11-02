/**
 * Classic tank-battle maze client — tanks + dim headlights + WS sync.
 */

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/battletank/ws`
}

function drawTank(ctx, p, isMe) {
  const { x, y, body, aim, color, alive, invuln } = p
  if (!alive && invuln === undefined) {
    // dead ghost
  }
  ctx.save()
  ctx.translate(x, y)
  if (!alive) ctx.globalAlpha = 0.35

  // tracks / hull
  ctx.rotate(body || 0)
  ctx.fillStyle = '#1a1f28'
  ctx.fillRect(-12, -9, 24, 18)
  ctx.fillStyle = color || '#6ec8ff'
  ctx.fillRect(-10, -7, 20, 14)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(-10, -7, 20, 3)
  ctx.fillRect(-10, 4, 20, 3)
  ctx.restore()

  // turret
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(aim || 0)
  ctx.fillStyle = isMe ? '#d7e8ff' : '#c8d0da'
  ctx.beginPath()
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = color || '#6ec8ff'
  ctx.fillRect(2, -2.2, 14, 4.4)
  ctx.restore()

  if (isMe) {
    ctx.beginPath()
    ctx.arc(x, y, 16, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(180, 220, 255, 0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

function drawHeadlight(ctx, grid, cell, p, coneHalf, range) {
  if (!p?.alive) return
  const rays = 36
  const ox = p.x
  const oy = p.y
  const aim = p.aim || 0
  ctx.beginPath()
  ctx.moveTo(ox, oy)
  for (let i = 0; i <= rays; i++) {
    const t = i / rays
    const ang = aim - coneHalf + t * coneHalf * 2
    const d = castRay(grid, cell, ox, oy, ang, range)
    ctx.lineTo(ox + Math.cos(ang) * d, oy + Math.sin(ang) * d)
  }
  ctx.closePath()
  const g = ctx.createRadialGradient(ox, oy, 4, ox, oy, range)
  g.addColorStop(0, 'rgba(255, 220, 140, 0.22)')
  g.addColorStop(0.55, 'rgba(255, 180, 80, 0.08)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fill()
}

function castRay(grid, cell, ox, oy, ang, maxDist) {
  if (!grid?.length) return maxDist
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
  let tMaxX = dx === 0 ? 1e30 : (dx > 0 ? mapX + 1 - x : x - mapX) * tDeltaX
  let tMaxY = dy === 0 ? 1e30 : (dy > 0 ? mapY + 1 - y : y - mapY) * tDeltaY
  let t = 0
  for (let i = 0; i < 96; i++) {
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
    if (grid[mapY][mapX] === 1) return t * cell
  }
  return maxDist
}

export function createBattleTankClient(canvas, hooks = {}) {
  const ctx = canvas.getContext('2d')
  let ws = null
  let user = null
  let lobby = null
  let state = null
  let status = 'idle' // idle | lobby | playing | ended
  let error = ''
  let raf = 0
  let keys = new Set()
  let fireHeld = false
  let aim = 0
  let cam = { x: 0, y: 0 }
  let moveStick = { active: false, dx: 0, dy: 0, pid: null }
  let lastInputSent = 0
  const coneHalf = (38 * Math.PI) / 180 / 2

  function emit() {
    hooks.onUpdate?.({
      status,
      user,
      lobby,
      state,
      error,
      connected: !!(ws && ws.readyState === 1),
    })
  }

  function connect(name) {
    error = ''
    if (ws) {
      try {
        ws.close()
      } catch {
        /* */
      }
    }
    ws = new WebSocket(wsUrl())
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', name }))
    }
    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type === 'error') {
        error = msg.error || '出错了'
        emit()
        return
      }
      if (msg.type === 'authed') {
        user = msg.user
        status = 'idle'
        emit()
        return
      }
      if (msg.type === 'created' || msg.type === 'lobby') {
        lobby = msg.type === 'lobby' ? msg : { ...lobby, code: msg.code }
        if (msg.type === 'lobby') lobby = msg
        status = 'lobby'
        emit()
        return
      }
      if (msg.type === 'list') {
        hooks.onList?.(msg.rooms || [], msg.stats)
        emit()
        return
      }
      if (msg.type === 'state') {
        state = msg
        status = msg.status === 'ended' ? 'ended' : 'playing'
        if (msg.grid) state.grid = msg.grid
        emit()
        return
      }
      if (msg.type === 'ended') {
        status = 'ended'
        if (state) {
          state.status = 'ended'
          state.winnerId = msg.winnerId
          state.players = msg.players || state.players
        }
        emit()
        return
      }
      if (msg.type === 'left') {
        status = 'idle'
        lobby = null
        state = null
        emit()
      }
    }
    ws.onclose = () => {
      error = error || '连接已断开'
      emit()
    }
    ws.onerror = () => {
      error = 'WebSocket 连接失败'
      emit()
    }
  }

  function send(msg) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
  }

  function createRoom() {
    send({ type: 'create' })
  }
  function joinRoom(code) {
    send({ type: 'join', code })
  }
  function leaveRoom() {
    send({ type: 'leave' })
  }
  function startGame() {
    send({ type: 'start' })
  }
  function restartGame() {
    send({ type: 'restart' })
  }
  function listRooms() {
    send({ type: 'list' })
  }

  function myTank() {
    return state?.players?.find((p) => p.id === user?.id)
  }

  function sendInput(force = false) {
    if (status !== 'playing') return
    const t = performance.now()
    if (!force && t - lastInputSent < 40) return
    lastInputSent = t
    let up = keys.has('KeyW') || keys.has('ArrowUp')
    let down = keys.has('KeyS') || keys.has('ArrowDown')
    let left = keys.has('KeyA') || keys.has('ArrowLeft')
    let right = keys.has('KeyD') || keys.has('ArrowRight')
    if (moveStick.active) {
      if (moveStick.dy < -0.25) up = true
      if (moveStick.dy > 0.25) down = true
      if (moveStick.dx < -0.25) left = true
      if (moveStick.dx > 0.25) right = true
    }
    send({
      type: 'input',
      up,
      down,
      left,
      right,
      fire: fireHeld || keys.has('Space'),
      aim,
    })
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
    ctx.fillStyle = '#05070a'
    ctx.fillRect(0, 0, cssW, cssH)

    if (!state?.grid || !state.players) {
      ctx.fillStyle = '#9aa7b5'
      ctx.font = '600 15px "IBM Plex Sans", "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      const tip =
        status === 'lobby'
          ? `房间 ${lobby?.code || ''} · 等待房主开始`
          : status === 'ended'
            ? '本局结束 · 房主可点重开'
            : '连接后开房 / 加入，即可开战'
      ctx.fillText(tip, cssW / 2, cssH / 2)
      return
    }

    const me = myTank()
    const cell = state.cell || 32
    const worldW = (state.cols || 19) * cell
    const worldH = (state.rows || 15) * cell
    const focus = me || state.players[0]
    cam.x = Math.max(0, Math.min(worldW - cssW, (focus?.x || 0) - cssW / 2))
    cam.y = Math.max(0, Math.min(worldH - cssH, (focus?.y || 0) - cssH / 2))

    ctx.save()
    ctx.translate(-cam.x, -cam.y)

    // maze
    for (let r = 0; r < state.grid.length; r++) {
      for (let c = 0; c < state.grid[r].length; c++) {
        const x = c * cell
        const y = r * cell
        if (state.grid[r][c] === 1) {
          ctx.fillStyle = '#0a0c10'
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
          ctx.strokeStyle = 'rgba(0,0,0,0.9)'
          ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
        } else {
          ctx.fillStyle = '#12161c'
          ctx.fillRect(x, y, cell + 0.5, cell + 0.5)
        }
      }
    }

    // dim headlights for local tank
    if (me?.alive) {
      ctx.save()
      drawHeadlight(ctx, state.grid, cell, me, coneHalf, cell * 5.5)
      ctx.restore()
    }

    for (const p of state.players) {
      drawTank(ctx, p, p.id === user?.id)
      if (p.alive) {
        ctx.fillStyle = 'rgba(200,210,220,0.75)'
        ctx.font = '11px "IBM Plex Sans", "PingFang SC", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(p.name || '', p.x, p.y - 18)
      }
    }

    for (const b of state.bullets || []) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffe6a0'
      ctx.fill()
    }

    ctx.restore()

    // HUD
    ctx.fillStyle = 'rgba(8,12,18,0.55)'
    ctx.fillRect(12, 12, 250, 58)
    ctx.strokeStyle = 'rgba(140,170,200,0.2)'
    ctx.strokeRect(12.5, 12.5, 249, 57)
    ctx.fillStyle = '#c5d2e0'
    ctx.font = '600 13px "IBM Plex Sans", "PingFang SC", sans-serif'
    ctx.textAlign = 'left'
    const lives = me ? `命 ${me.lives}` : ''
    const kills = me ? `击毁 ${me.kills}` : ''
    ctx.fillText(`坦克大战 · ${lives}  ${kills}`, 22, 34)
    ctx.fillStyle = '#8fa0b2'
    ctx.font = '12px "IBM Plex Sans", "PingFang SC", sans-serif'
    ctx.fillText(status === 'ended' ? '对局结束' : `房间 ${state.code} · 车灯微光`, 22, 54)
  }

  function frame() {
    sendInput()
    draw()
    raf = requestAnimationFrame(frame)
  }

  function onKey(e, down) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault()
    }
    if (down) keys.add(e.code)
    else keys.delete(e.code)
    sendInput(true)
  }

  function canvasToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    return { x: clientX - rect.left + cam.x, y: clientY - rect.top + cam.y }
  }

  function onPointerDown(e) {
    canvas.setPointerCapture?.(e.pointerId)
    const rect = canvas.getBoundingClientRect()
    const lx = e.clientX - rect.left
    if (e.pointerType === 'touch' && lx < rect.width * 0.42) {
      moveStick = {
        active: true,
        dx: 0,
        dy: 0,
        pid: e.pointerId,
        ox: e.clientX,
        oy: e.clientY,
      }
    } else {
      const w = canvasToWorld(e.clientX, e.clientY)
      const me = myTank()
      if (me) aim = Math.atan2(w.y - me.y, w.x - me.x)
      fireHeld = true
      sendInput(true)
    }
  }

  function onPointerMove(e) {
    if (moveStick.active && e.pointerId === moveStick.pid) {
      const dx = e.clientX - moveStick.ox
      const dy = e.clientY - moveStick.oy
      const m = Math.hypot(dx, dy) || 1
      const s = Math.min(1, Math.max(0, (m - 10) / 50))
      moveStick.dx = (dx / m) * s
      moveStick.dy = (dy / m) * s
      return
    }
    const w = canvasToWorld(e.clientX, e.clientY)
    const me = myTank()
    if (me) {
      aim = Math.atan2(w.y - me.y, w.x - me.x)
      sendInput()
    }
  }

  function onPointerUp(e) {
    if (e.pointerId === moveStick.pid) {
      moveStick = { active: false, dx: 0, dy: 0, pid: null }
    }
    fireHeld = false
    sendInput(true)
  }

  function start() {
    raf = requestAnimationFrame(frame)
    window.addEventListener('keydown', (e) => onKey(e, true))
    window.addEventListener('keyup', (e) => onKey(e, false))
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  // named for cleanup
  const keyDown = (e) => onKey(e, true)
  const keyUp = (e) => onKey(e, false)

  return {
    connect,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    restartGame,
    listRooms,
    start() {
      raf = requestAnimationFrame(frame)
      window.addEventListener('keydown', keyDown)
      window.addEventListener('keyup', keyUp)
      canvas.addEventListener('pointerdown', onPointerDown)
      canvas.addEventListener('pointermove', onPointerMove)
      canvas.addEventListener('pointerup', onPointerUp)
      canvas.addEventListener('pointercancel', onPointerUp)
      canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    },
    stop() {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      try {
        ws?.close()
      } catch {
        /* */
      }
    },
    setFire(v) {
      fireHeld = !!v
      sendInput(true)
    },
  }
}

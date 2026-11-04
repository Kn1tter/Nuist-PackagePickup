<template>
  <main class="panel pool-page">
    <header class="head">
      <div>
        <h1>台球 · 8 球联机</h1>
        <p class="muted tip">{{ statusLine }}</p>
      </div>
      <RouterLink class="back" to="/arcade">← 小游戏</RouterLink>
    </header>

    <section v-if="phase === 'lobby'" class="lobby">
      <div class="row">
        <button type="button" class="btn" :disabled="!ready" @click="createRoom">创建房间</button>
        <button type="button" class="btn ghost" :disabled="!ready" @click="refreshList">刷新列表</button>
      </div>
      <div class="bot-row">
        <label class="count-lab">
          人机难度
          <select v-model="botDiff">
            <option value="easy">简单</option>
            <option value="normal">普通</option>
            <option value="hard">困难</option>
            <option value="yjz">普通 yjz</option>
            <option value="yjz_full">全解放 yjz</option>
          </select>
        </label>
        <button type="button" class="btn" :disabled="!ready" @click="createBotRoom">创建人机房间</button>
      </div>
      <div class="join-row">
        <input v-model="joinCode" maxlength="4" placeholder="房间码" class="code-input" />
        <button
          type="button"
          class="btn"
          :disabled="!ready || joinCode.trim().length < 4"
          @click="joinRoom()"
        >
          加入
        </button>
      </div>
      <p v-if="savedRoom" class="rejoin-hint">
        检测到未完成对局 <strong>{{ savedRoom }}</strong>
        <button type="button" class="btn sm" :disabled="!ready" @click="tryRejoin(savedRoom)">重连</button>
      </p>
      <p v-if="error" class="err">{{ error }}</p>
      <ul class="room-list">
        <li v-for="r in waiting" :key="r.id">
          <span>{{ r.hostName }} · {{ r.id }}</span>
          <button type="button" class="btn ghost sm" @click="joinRoom(r.id)">加入</button>
        </li>
        <li v-if="!waiting.length" class="muted">暂无等待中的房间，创建一个吧</li>
      </ul>
      <p class="muted cache-tip">若界面仍是旧操作方式，请 Ctrl+F5 强制刷新</p>
    </section>

    <section v-else class="game">
      <div class="meta">
        <span>房间 <strong>{{ roomId }}</strong></span>
        <span>你是 {{ seat === 'host' ? '房主' : '挑战者' }}</span>
        <span v-if="vsBot" class="bot-tag">人机房间 · {{ botDiffLabel }}</span>
        <span>{{ groupLabel }}</span>
        <span class="turn-tag">当前：{{ turnLabel }}</span>
        <span v-if="actionLeftSec != null && status === 'playing' && !animating"
          >操作剩 {{ actionLeftSec }}s</span
        >
        <button type="button" class="btn ghost sm" @click="leave">离开</button>
      </div>
      <div v-if="vsBot && status === 'waiting' && seat === 'host'" class="bot-ready">
        <p class="muted">人机已就位 · {{ botDiffLabel }} · 点开始开局</p>
        <button type="button" class="btn" @click="startBotMatch">开始游戏</button>
      </div>
      <p class="turn" :class="{ mine: myTurn && !animating }">{{ turnText }}</p>
      <div class="play-row">
        <div class="board-wrap">
          <canvas
            ref="canvasEl"
            :width="TABLE_W"
            :height="TABLE_H"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
          />
        </div>
        <div class="power-col" v-if="canAim">
          <span class="power-label">力度</span>
          <div
            class="power-track"
            ref="powerTrackEl"
            @pointerdown="onPowerDown"
            @pointermove="onPowerMove"
            @pointerup="onPowerUp"
            @pointerleave="onPowerUp"
          >
            <div class="power-fill" :style="{ height: `${Math.round(power * 100)}%` }" />
          </div>
          <button
            type="button"
            class="btn sm shoot-btn"
            :disabled="aimPhase !== 'power' || power < 0.05 || animating"
            @click="fireShot"
          >
            击球
          </button>
          <button v-if="aimPhase === 'power'" type="button" class="btn ghost sm" @click="resetAim">
            重选方向
          </button>
        </div>
        <div v-else-if="status === 'playing' && !animating" class="power-col ghost-col">
          <span class="power-label">对手</span>
          <div class="power-track disabled">
            <div class="power-fill" :style="{ height: `${Math.round(remotePower * 100)}%` }" />
          </div>
          <span class="muted tiny">{{ remotePhase === 'power' ? '调力度中' : '瞄准中' }}</span>
        </div>
      </div>
      <p class="hint muted">{{ aimHint }}</p>
      <p v-if="message" class="msg">{{ message }}</p>
      <p v-if="peerStatus" class="peer">{{ peerStatus }}</p>
      <GameChat :messages="chatLog" :disabled="status === 'ended'" @send="sendChat" />
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import GameChat from '../components/GameChat.vue'
import { apiBase, getToken, getUser, request } from '../api/request'
import {
  TABLE_W,
  TABLE_H,
  allStopped,
  applySerialized,
  createInitialBalls,
  drawTable,
  groupLabelFor,
  predictGuide,
  resolveShot,
  serializeBalls,
  simulateShot,
  step,
  validCuePlace,
} from '../lib/poolPhysics'
import { choosePoolBotShot } from '../lib/poolBot'

const ROOM_KEY = 'nuist_pool_room'
const BOT_NAMES = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
  yjz: '普通 yjz',
  yjz_full: '全解放 yjz',
}

const router = useRouter()
const canvasEl = ref(null)
const powerTrackEl = ref(null)
const phase = ref('lobby')
const ready = ref(false)
const error = ref('')
const waiting = ref([])
const joinCode = ref('')
const roomId = ref('')
const seat = ref(null)
const turn = ref('host')
const message = ref('')
const peerStatus = ref('')
const animating = ref(false)
const ballInHand = ref(false)
const tableOpen = ref(true)
const group = ref({ host: null, guest: null })
const status = ref('waiting')
const hostName = ref('')
const guestName = ref('')
const savedRoom = ref(sessionStorage.getItem(ROOM_KEY) || '')
const aimPhase = ref('aim')
const power = ref(0.35)
const aimAngle = ref(0)
const remoteAngle = ref(0)
const remotePower = ref(0)
const remotePhase = ref('aim')
const showRemoteAim = ref(false)
const chatLog = ref([])
const actionEndsAt = ref(0)
const actionLeftSec = ref(null)
const vsBot = ref(false)
const botDiff = ref('normal')
const botThinking = ref(false)

let ws = null
let actionTick = 0
let balls = createInitialBalls()
/** @type {ReturnType<typeof serializeBalls>|null} last committed board */
let committed = null
let raf = 0
let powerDragging = false
let intentionalLeave = false
let reconnectTimer = 0
let reconnectAttempts = 0
let aimSendAt = 0
let shotSeq = 0
let runningSeq = 0

const myTurn = computed(
  () => !!seat.value && turn.value === seat.value && status.value === 'playing'
)
const canAim = computed(
  () =>
    myTurn.value &&
    !animating.value &&
    !ballInHand.value &&
    status.value === 'playing' &&
    !(vsBot.value && turn.value === 'guest')
)
const groupLabel = computed(() => groupLabelFor(seat.value, group.value, tableOpen.value))
const botDiffLabel = computed(() => BOT_NAMES[botDiff.value] || botDiff.value)
const turnLabel = computed(() => {
  if (vsBot.value && turn.value === 'guest') return '人机'
  return turn.value === 'host' ? '房主' : '挑战者'
})
const turnText = computed(() => {
  if (status.value === 'ended') return message.value || '对局结束'
  if (peerStatus.value) return peerStatus.value
  if (botThinking.value) return '人机瞄准中…'
  if (animating.value) return '球在滚动…'
  if (ballInHand.value && myTurn.value) return '自由球：点击开球线后放置母球'
  if (canAim.value && aimPhase.value === 'aim') return '① 移动鼠标确定方向，点击台面锁定'
  if (canAim.value && aimPhase.value === 'power') return '② 右侧调力度，再点「击球」'
  if (myTurn.value) return '轮到你击球'
  if (vsBot.value && turn.value === 'guest') return '人机回合'
  return '对手回合（可看见对方瞄准）'
})
const aimHint = computed(() => {
  if (canAim.value && aimPhase.value === 'aim') return '双方相同：先定方向，再定力度'
  if (canAim.value) return '力度条拖拽；「重选方向」可返回第一步'
  if (!myTurn.value && showRemoteAim.value) return '对方正在瞄准…'
  return ''
})
const statusLine = computed(() => {
  if (phase.value === 'lobby') return ready.value ? '已连接，可开房或加入' : '正在连接…'
  return `${hostName.value || '房主'} vs ${guestName.value || '…'}`
})

watch([aimAngle, aimPhase, power, canAim], () => {
  if (!canAim.value) return
  const t = Date.now()
  if (t - aimSendAt < 40) return
  aimSendAt = t
  ws?.send(
    JSON.stringify({
      type: 'aim',
      angle: aimAngle.value,
      phase: aimPhase.value,
      power: power.value,
    })
  )
})

function wsUrl() {
  if (apiBase) {
    const u = new URL(apiBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/api/pool/ws'
    u.search = ''
    return u.toString()
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/pool/ws`
}

function rememberRoom(id) {
  if (id) {
    sessionStorage.setItem(ROOM_KEY, id)
    savedRoom.value = id
  } else {
    sessionStorage.removeItem(ROOM_KEY)
    savedRoom.value = ''
  }
}

function commitBoard() {
  committed = serializeBalls(balls)
}

function restoreCommitted() {
  if (!committed) {
    balls = createInitialBalls()
    commitBoard()
    return
  }
  balls = createInitialBalls()
  applySerialized(balls, committed)
}

function connect() {
  const token = getToken()
  if (!token) {
    router.replace({ name: 'login', query: { redirect: '/arcade/pool' } })
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  ws = new WebSocket(wsUrl())
  ws.onopen = () => {
    reconnectAttempts = 0
    ws.send(JSON.stringify({ type: 'auth', token }))
  }
  ws.onmessage = (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    onMsg(msg)
  }
  ws.onclose = () => {
    ready.value = false
    if (intentionalLeave) return
    if (phase.value === 'game' && roomId.value && status.value !== 'ended') {
      peerStatus.value = '连接断开，正在重连…'
      scheduleReconnect()
    }
  }
  ws.onerror = () => {
    if (phase.value === 'lobby') error.value = '连接失败'
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (reconnectAttempts >= 8) {
    peerStatus.value = '重连失败，请返回大厅点「重连」'
    return
  }
  const delay = Math.min(8000, 800 * 2 ** reconnectAttempts)
  reconnectAttempts += 1
  reconnectTimer = window.setTimeout(() => connect(), delay)
}

function onMsg(msg) {
  if (msg.type === 'authed') {
    ready.value = true
    const pending = sessionStorage.getItem(ROOM_KEY)
    if (pending && (phase.value === 'game' || reconnectAttempts > 0)) {
      tryRejoin(pending)
      return
    }
    if (phase.value === 'lobby') refreshList()
    return
  }
  if (msg.type === 'error') {
    error.value = msg.error || '出错了'
    return
  }
  if (msg.type === 'list') {
    waiting.value = msg.rooms || []
    return
  }
  if (msg.type === 'room') {
    applyRoomMeta(msg.room)
    phase.value = 'game'
    rememberRoom(msg.room.id)
    if (msg.room.status === 'waiting') {
      message.value = msg.room.vsBot
        ? `人机房间 ${msg.room.id} · ${BOT_NAMES[msg.room.botDiff] || msg.room.botDiff || '普通 yjz'} · 点开始开局`
        : `房间码 ${msg.room.id}，等待对手加入…`
    }
    peerStatus.value = ''
    resetAim()
    nextTick(() => paint())
    return
  }
  if (msg.type === 'bot_turn') {
    maybeRunPoolBot()
    return
  }
  if (msg.type === 'start') {
    if (msg.vsBot) vsBot.value = true
    if (msg.botDiff) botDiff.value = msg.botDiff
    balls = createInitialBalls()
    commitBoard()
    tableOpen.value = true
    group.value = { host: null, guest: null }
    ballInHand.value = false
    turn.value = msg.turn || 'host'
    status.value = 'playing'
    message.value = '开球！房主先打（先方向，再力度）'
    phase.value = 'game'
    peerStatus.value = ''
    showRemoteAim.value = false
    chatLog.value = []
    actionEndsAt.value = msg.actionEndsAt || 0
    resetAim()
    nextTick(() => paint())
    return
  }
  if (msg.type === 'sync') {
    if (msg.room) applyRoomMeta(msg.room)
    phase.value = 'game'
    turn.value = msg.turn || turn.value
    status.value = msg.status || 'playing'
    if (msg.group) group.value = msg.group
    tableOpen.value = !!msg.tableOpen
    ballInHand.value = !!msg.ballInHand
    message.value = msg.message || '已重连'
    peerStatus.value = ''
    actionEndsAt.value = msg.actionEndsAt || msg.room?.actionEndsAt || 0
    if (msg.balls?.length) {
      balls = createInitialBalls()
      applySerialized(balls, msg.balls)
      commitBoard()
    }
    rememberRoom(roomId.value)
    resetAim()
    nextTick(() => paint())
    return
  }
  if (msg.type === 'aim') {
    if (myTurn.value || animating.value) return
    remoteAngle.value = msg.angle
    remotePower.value = msg.power || 0
    remotePhase.value = msg.phase || 'aim'
    showRemoteAim.value = true
    paint()
    return
  }
  if (msg.type === 'shot' || msg.type === 'shot_ack') {
    const actingSeat = msg.from === 'guest' || msg.asBot ? 'guest' : seat.value
    beginShot(msg.angle, msg.power, msg.balls, msg.type === 'shot_ack', actingSeat)
    return
  }
  if (msg.type === 'frame') {
    if (myTurn.value) return // only peer applies remote frames
    applyFrame(msg.b)
    animating.value = true
    paint()
    return
  }
  if (msg.type === 'settle') {
    cancelAnimationFrame(raf)
    runningSeq = shotSeq
    if (msg.balls?.length) {
      balls = createInitialBalls()
      applySerialized(balls, msg.balls)
      commitBoard()
    }
    turn.value = msg.turn
    if (msg.group) group.value = { host: msg.group.host ?? null, guest: msg.group.guest ?? null }
    ballInHand.value = !!msg.ballInHand
    status.value = msg.status || 'playing'
    message.value = msg.message || ''
    tableOpen.value =
      typeof msg.tableOpen === 'boolean' ? msg.tableOpen : !(group.value.host || group.value.guest)
    animating.value = false
    showRemoteAim.value = false
    actionEndsAt.value = msg.actionEndsAt || 0
    resetAim()
    paint()
    if (vsBot.value && status.value === 'playing' && turn.value === 'guest') {
      window.setTimeout(() => maybeRunPoolBot(), 400)
    }
    return
  }
  if (msg.type === 'cue_place') {
    const cue = balls.find((b) => b.id === 0)
    if (cue) {
      cue.x = msg.x
      cue.y = msg.y
      cue.pocketed = false
    }
    ballInHand.value = false
    commitBoard()
    paint()
    return
  }
  if (msg.type === 'peer_disconnected') {
    peerStatus.value = msg.message || '对方断线，等待重连…'
    return
  }
  if (msg.type === 'peer_rejoined') {
    peerStatus.value = ''
    message.value = '对方已重连'
    if (msg.room) applyRoomMeta(msg.room)
    return
  }
  if (msg.type === 'peer_left') {
    status.value = 'ended'
    message.value = msg.message || '对方已离开'
    peerStatus.value = ''
    animating.value = false
    rememberRoom('')
    return
  }
  if (msg.type === 'chat') {
    chatLog.value = [
      ...chatLog.value.slice(-80),
      {
        nickname: msg.nickname || (msg.from === 'host' ? '房主' : '挑战者'),
        text: msg.text,
        self: !!msg.self,
      },
    ]
    return
  }
  if (msg.type === 'left') resetLobby()
}

function sendChat(text) {
  ws?.send(JSON.stringify({ type: 'chat', text }))
}

function applyRoomMeta(r) {
  roomId.value = r.id
  seat.value = r.seat
  vsBot.value = !!r.vsBot
  if (r.botDiff) botDiff.value = r.botDiff
  turn.value = r.turn
  status.value = r.status
  hostName.value = r.host?.nickname || r.host?.student_id || ''
  guestName.value = r.guest?.nickname || r.guest?.student_id || ''
  if (r.actionEndsAt) actionEndsAt.value = r.actionEndsAt
}

function resetLobby() {
  chatLog.value = []
  phase.value = 'lobby'
  roomId.value = ''
  seat.value = null
  message.value = ''
  peerStatus.value = ''
  status.value = 'waiting'
  balls = createInitialBalls()
  committed = null
  rememberRoom('')
  refreshList()
}

function createRoom() {
  error.value = ''
  vsBot.value = false
  ws?.send(JSON.stringify({ type: 'create' }))
}

function createBotRoom() {
  error.value = ''
  vsBot.value = true
  ws?.send(JSON.stringify({ type: 'create_bot', difficulty: botDiff.value }))
}
function startBotMatch() {
  error.value = ''
  ws?.send(JSON.stringify({ type: 'start' }))
}
function joinRoom(code) {
  error.value = ''
  const id = (typeof code === 'string' ? code : joinCode.value).trim().toUpperCase()
  if (id.length < 4) return
  ws?.send(JSON.stringify({ type: 'join', roomId: id }))
}
function tryRejoin(id) {
  error.value = ''
  const code = String(id || '').trim().toUpperCase()
  if (code.length < 4) return
  ws?.send(JSON.stringify({ type: 'rejoin', roomId: code }))
}
async function refreshList() {
  try {
    waiting.value = (await request('/pool/rooms')).rooms || []
  } catch {
    ws?.send(JSON.stringify({ type: 'list' }))
  }
}
function leave() {
  intentionalLeave = true
  rememberRoom('')
  ws?.send(JSON.stringify({ type: 'leave' }))
  resetLobby()
  setTimeout(() => {
    intentionalLeave = false
  }, 500)
}

function resetAim() {
  aimPhase.value = 'aim'
  power.value = 0.35
  aimAngle.value = 0
  paint()
}

function paint() {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const localAim = canAim.value
  const remote = !myTurn.value && showRemoteAim.value && !animating.value
  const angle = localAim ? aimAngle.value : remote ? remoteAngle.value : null
  const phaseNow = localAim ? aimPhase.value : remote ? remotePhase.value : null
  const pow = localAim ? power.value : remote ? remotePower.value : 0
  const guide =
    angle != null && !animating.value ? predictGuide(balls, angle) : null
  drawTable(ctx, balls, {
    aimAngle: angle,
    power: pow,
    aimPhase: phaseNow,
    ballInHand: ballInHand.value && myTurn.value,
    guide,
  })
}

function canvasPos(e) {
  const canvas = canvasEl.value
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (TABLE_W / rect.width),
    y: (e.clientY - rect.top) * (TABLE_H / rect.height),
  }
}

function onDown(e) {
  if (!canAim.value && !(myTurn.value && ballInHand.value)) return
  const p = canvasPos(e)
  if (ballInHand.value && myTurn.value) {
    if (validCuePlace(p.x, p.y, balls)) {
      const cue = balls.find((b) => b.id === 0)
      cue.x = p.x
      cue.y = p.y
      cue.pocketed = false
      ballInHand.value = false
      commitBoard()
      ws?.send(JSON.stringify({ type: 'cue_place', x: p.x, y: p.y }))
      resetAim()
    }
    return
  }
  if (!canAim.value) return
  const cue = balls.find((b) => b.id === 0 && !b.pocketed)
  if (!cue) return
  aimAngle.value = Math.atan2(p.y - cue.y, p.x - cue.x)
  if (aimPhase.value === 'aim') aimPhase.value = 'power'
  paint()
}

function onMove(e) {
  if (!canAim.value || aimPhase.value !== 'aim') return
  const cue = balls.find((b) => b.id === 0 && !b.pocketed)
  if (!cue) return
  const p = canvasPos(e)
  aimAngle.value = Math.atan2(p.y - cue.y, p.x - cue.x)
  paint()
}
function onUp() {}

function powerFromEvent(e) {
  const el = powerTrackEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  power.value = Math.max(0.05, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
  paint()
}
function onPowerDown(e) {
  if (!canAim.value) return
  aimPhase.value = 'power'
  powerDragging = true
  e.currentTarget?.setPointerCapture?.(e.pointerId)
  powerFromEvent(e)
}
function onPowerMove(e) {
  if (powerDragging) powerFromEvent(e)
}
function onPowerUp() {
  powerDragging = false
}

function fireShot() {
  if (!canAim.value || aimPhase.value !== 'power' || power.value < 0.05) return
  // send identical board snapshot so both clients start the same
  ws?.send(
    JSON.stringify({
      type: 'shot',
      angle: aimAngle.value,
      power: power.value,
      balls: serializeBalls(balls),
    })
  )
}

function packFrame() {
  // compact: [id, x10, y10, pocketedFlag]
  return balls.map((b) => [
    b.id,
    Math.round(b.x * 10),
    Math.round(b.y * 10),
    b.pocketed ? 1 : 0,
  ])
}

function applyFrame(packed) {
  if (!Array.isArray(packed)) return
  const map = new Map(packed.map((row) => [row[0], row]))
  for (const b of balls) {
    const row = map.get(b.id)
    if (!row) continue
    b.x = row[1] / 10
    b.y = row[2] / 10
    b.pocketed = !!row[3]
    b.vx = 0
    b.vy = 0
  }
}

/**
 * Shooter runs physics and streams frames; peer only paints remote frames.
 */
async function beginShot(angle, powerVal, startBalls, isShooter, actingSeat = null) {
  const seq = ++shotSeq
  runningSeq = seq
  cancelAnimationFrame(raf)
  animating.value = true
  showRemoteAim.value = false
  botThinking.value = false
  message.value = ''
  const shotSeat = actingSeat || seat.value

  if (Array.isArray(startBalls) && startBalls.length) {
    balls = createInitialBalls()
    applySerialized(balls, startBalls)
  } else {
    restoreCommitted()
  }
  paint()

  // Peer: wait for streamed frames + settle (no local physics)
  if (!isShooter) return

  // Authoritative sim for rules (clone), live balls for display + stream
  const simBalls = createInitialBalls()
  applySerialized(simBalls, serializeBalls(balls))
  const sim = simulateShot(simBalls, angle, powerVal)

  const cue = balls.find((b) => b.id === 0)
  const spd = 1.8 + powerVal * 12.5
  cue.vx = Math.cos(angle) * spd
  cue.vy = Math.sin(angle) * spd

  let frameGate = 0
  // send first frame immediately
  ws?.send(JSON.stringify({ type: 'frame', seq, b: packFrame() }))

  await new Promise((resolve) => {
    const tick = () => {
      if (runningSeq !== seq) {
        resolve()
        return
      }
      step(balls, { pocketed: [] })
      frameGate += 1
      // ~every 2 frames (~30fps stream) keep bandwidth low
      if (frameGate % 2 === 0) {
        ws?.send(JSON.stringify({ type: 'frame', seq, b: packFrame() }))
      }
      paint()
      if (allStopped(balls)) {
        for (const b of balls) {
          b.vx = 0
          b.vy = 0
        }
        resolve()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  })

  if (runningSeq !== seq) return

  applySerialized(balls, serializeBalls(simBalls))
  // final frame so peer matches exactly before settle
  ws?.send(JSON.stringify({ type: 'frame', seq, b: packFrame() }))
  paint()

  const result = resolveShot({
    pocketed: sim.pocketed,
    firstHit: sim.firstHit,
    seat: shotSeat,
    group: group.value,
    balls,
    tableOpen: tableOpen.value,
  })

  group.value = result.group
  tableOpen.value = result.tableOpen
  ballInHand.value = result.ballInHand
  message.value = result.message
  status.value = result.status

  let nextTurn = turn.value
  if (result.status !== 'ended' && !result.continueTurn) {
    nextTurn = shotSeat === 'host' ? 'guest' : 'host'
  } else if (result.continueTurn) {
    nextTurn = shotSeat
  }
  turn.value = nextTurn
  commitBoard()

  ws?.send(
    JSON.stringify({
      type: 'settle',
      balls: serializeBalls(balls),
      turn: nextTurn,
      group: result.group,
      tableOpen: result.tableOpen,
      ballInHand: result.ballInHand,
      status: result.status,
      winner: result.winner,
      message: result.message,
      scratch: result.foul,
    })
  )
  animating.value = false
  resetAim()
  paint()
  if (vsBot.value && status.value === 'playing' && nextTurn === 'guest') {
    window.setTimeout(() => maybeRunPoolBot(), 500)
  }
}

async function maybeRunPoolBot() {
  if (!vsBot.value || status.value !== 'playing' || animating.value) return
  if (turn.value !== 'guest' || botThinking.value) return
  botThinking.value = true
  message.value = '人机瞄准中…'
  // 自由球：自动放回开球点
  if (ballInHand.value) {
    const cue = balls.find((b) => b.id === 0)
    if (cue) {
      cue.pocketed = false
      cue.x = TABLE_W * 0.28
      cue.y = TABLE_H / 2
      cue.vx = 0
      cue.vy = 0
    }
    ballInHand.value = false
    commitBoard()
    paint()
  }
  await new Promise((r) => setTimeout(r, 350 + Math.random() * 500))
  if (!vsBot.value || turn.value !== 'guest' || status.value !== 'playing') {
    botThinking.value = false
    return
  }
  const pick = choosePoolBotShot(serializeBalls(balls), {
    seat: 'guest',
    group: group.value,
    tableOpen: tableOpen.value,
    difficulty: botDiff.value,
  })
  ws?.send(
    JSON.stringify({
      type: 'shot',
      angle: pick.angle,
      power: pick.power,
      balls: serializeBalls(balls),
      asBot: true,
    })
  )
}

function updateActionClock() {
  const ends = actionEndsAt.value
  if (!ends || status.value !== 'playing' || animating.value) {
    actionLeftSec.value = null
    return
  }
  actionLeftSec.value = Math.max(0, Math.ceil((ends - Date.now()) / 1000))
}

onMounted(() => {
  if (!getUser()) {
    router.replace({ name: 'login', query: { redirect: '/arcade/pool' } })
    return
  }
  connect()
  actionTick = window.setInterval(updateActionClock, 250)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  window.clearInterval(actionTick)
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
})
</script>

<style scoped>
.pool-page {
  padding: 1.2rem 1.2rem 2rem;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}
h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.55rem;
}
.tip {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
}
.back {
  color: var(--muted);
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
}
.lobby {
  display: grid;
  gap: 0.85rem;
  max-width: 420px;
}
.row,
.bot-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  margin: 0.65rem 0;
}

.bot-tag {
  font-weight: 700;
  color: var(--accent);
}
.bot-ready {
  display: grid;
  gap: 0.55rem;
  margin: 0.5rem 0 0.75rem;
  padding: 0.75rem 0.85rem;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.02);
}
.bot-ready p {
  margin: 0;
}

.count-lab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.count-lab select {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  background: #fff;
}

.join-row {
  display: flex;
  gap: 0.55rem;
}
.code-input {
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
}
.rejoin-hint {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin: 0;
  font-size: 0.9rem;
}
.cache-tip {
  margin: 0;
  font-size: 0.82rem;
}
.room-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.room-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.7);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.4rem;
}
.turn-tag {
  font-weight: 700;
  color: var(--accent-2, #c45c26);
}
.turn {
  margin: 0 0 0.55rem;
  font-weight: 700;
  color: var(--muted);
}
.turn.mine {
  color: var(--accent-2, #c45c26);
}
.play-row {
  display: flex;
  gap: 0.75rem;
  align-items: stretch;
  max-width: 780px;
}
.board-wrap {
  flex: 1;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid #2a1a0c;
  box-shadow: 0 12px 36px rgba(20, 40, 30, 0.18);
  touch-action: none;
}
canvas {
  display: block;
  width: 100%;
  height: auto;
  cursor: crosshair;
  background: #1f6b4a;
}
.power-col {
  width: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.ghost-col {
  opacity: 0.75;
}
.power-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--muted);
}
.power-track {
  flex: 1;
  width: 28px;
  min-height: 160px;
  border-radius: 999px;
  border: 2px solid #2a1a0c;
  background: linear-gradient(to top, #1a1a1a, #333);
  position: relative;
  overflow: hidden;
  cursor: ns-resize;
  touch-action: none;
}
.power-track.disabled {
  cursor: default;
  pointer-events: none;
}
.power-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to top, #e85d04, #ffba08, #90ee90);
}
.shoot-btn {
  width: 100%;
}
.tiny {
  font-size: 0.7rem;
  text-align: center;
}
.hint {
  margin: 0.45rem 0 0;
  font-size: 0.84rem;
}
.msg {
  margin: 0.55rem 0 0;
  font-weight: 600;
}
.peer {
  margin: 0.35rem 0 0;
  color: #b45309;
  font-weight: 600;
  font-size: 0.9rem;
}
.err {
  margin: 0;
  color: #c0392b;
}
.btn.sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
}
@media (max-width: 640px) {
  .play-row {
    flex-direction: column;
  }
  .power-col {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  .power-track {
    min-height: 120px;
  }
}
</style>

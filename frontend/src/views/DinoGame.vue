<template>
  <main class="panel dino-page">
    <header class="head">
      <div>
        <h1>谷歌小恐龙</h1>
        <p class="muted tip">{{ tip }}{{ ready ? '' : ' · 加载精灵…' }}</p>
      </div>
      <RouterLink class="back" to="/arcade">← 小游戏</RouterLink>
    </header>

    <section class="modes">
      <button
        type="button"
        class="mode-btn"
        :class="{ on: mode === 'solo' }"
        :disabled="busy"
        @click="switchMode('solo')"
      >
        <strong>单人耍起</strong>
        <span>本地畅玩，撞了就死</span>
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ on: mode === 'duo' }"
        :disabled="busy"
        @click="switchMode('duo')"
      >
        <strong>一起跑</strong>
        <span>2–5 人联机 · 还有人活着就能救队友</span>
      </button>
    </section>

    <section v-if="mode === 'duo' && !inRoom" class="lobby">
      <div class="row">
        <button type="button" class="btn" :disabled="!wsReady" @click="createRoom">开房</button>
        <button type="button" class="btn ghost" :disabled="!wsReady" @click="refreshList">刷新</button>
      </div>
      <div class="join-row">
        <input v-model="joinCode" maxlength="4" placeholder="房间码" class="code-input" />
        <button type="button" class="btn" :disabled="!wsReady || joinCode.trim().length < 4" @click="joinRoom()">
          加入
        </button>
      </div>
      <p v-if="savedRoom" class="rejoin-hint">
        未完成对局 <strong>{{ savedRoom }}</strong>
        <button type="button" class="btn sm" :disabled="!wsReady" @click="rejoin(savedRoom)">重连</button>
      </p>
      <ul class="room-list">
        <li v-for="r in waiting" :key="r.id">
          <span>{{ r.hostName }} · {{ r.id }} · {{ r.count }}/{{ r.max || 5 }}</span>
          <button type="button" class="btn ghost sm" @click="joinRoom(r.id)">加入</button>
        </li>
        <li v-if="!waiting.length" class="muted">暂无房间，开房等好友联机</li>
      </ul>
      <p v-if="error" class="err">{{ error }}</p>
    </section>

    <div class="stage-wrap">
      <canvas
        ref="canvasEl"
        class="stage"
        @pointerdown="onStagePointer"
        @click.prevent
      />
      <p v-if="!playing && ready" class="tap-hint">点画面或下方按钮开始 · 跳过障碍</p>
    </div>

    <div class="touch-controls" aria-label="触屏操作">
      <button
        type="button"
        class="touch-btn duck"
        :disabled="!ready || (mode === 'duo' && !inRoom)"
        @pointerdown.prevent="onDuckDown"
        @pointerup.prevent="onDuckUp"
        @pointerleave.prevent="onDuckUp"
        @pointercancel.prevent="onDuckUp"
      >
        下蹲
        <span>按住</span>
      </button>
      <button
        type="button"
        class="touch-btn jump"
        :disabled="!ready || (mode === 'duo' && !inRoom)"
        @pointerdown.prevent="onJump"
      >
        {{ playing ? '跳跃' : '开始 / 跳' }}
        <span>点按</span>
      </button>
    </div>

    <div v-if="mode === 'duo' && inRoom" class="duo-bar">
      <span>房间 <strong>{{ roomId }}</strong></span>
      <span>{{ roomMsg }}</span>
      <button
        v-if="isHost && (netStatus === 'lobby' || netStatus === 'ended')"
        type="button"
        class="btn sm"
        :disabled="playerCount < 2"
        @click="sendWs({ type: netStatus === 'ended' ? 'again' : 'start' })"
      >
        {{ netStatus === 'ended' ? '再来一局' : '开始' }}
      </button>
      <button type="button" class="btn ghost sm" @click="leaveRoom">离开</button>
    </div>

    <div class="hud">
      <p>
        分数 <strong>{{ score }}</strong>
        <template v-if="mode === 'solo'"> · 最高 <strong>{{ hi }}</strong></template>
        · 速度 <strong>{{ speedText }}</strong>
      </p>
      <ul v-if="mode === 'duo' && dinos.length" class="lives">
        <li v-for="d in dinos" :key="d.id" :class="{ dead: d.dead }">
          {{ d.label }}
          <template v-if="d.dead && d.reviveIn > 0">· {{ d.reviveIn }}s 复活</template>
          <template v-else-if="d.dead">· 出局</template>
          <template v-else>· 奔跑中</template>
        </li>
      </ul>
    </div>

    <ArcadeLeaderboard
      ref="boardRef"
      class="dino-board"
      title="小恐龙排行榜"
      only="dino"
      :limit="8"
    />

    <details class="help" open>
      <summary>操作说明</summary>
      <div v-if="mode === 'solo'">
        <p>手机：点「跳跃」或点画面起飞；按住「下蹲」躲飞鸟。</p>
        <p>键盘：<kbd>空格</kbd> / <kbd>↑</kbd> / <kbd>W</kbd> 跳 · <kbd>↓</kbd> / <kbd>S</kbd> 蹲</p>
      </div>
      <div v-else>
        <p>一起跑：手机用下方按钮，或键盘 <kbd>空格</kbd>/<kbd>↑</kbd> 跳、<kbd>↓</kbd>/<kbd>S</kbd> 蹲。</p>
        <p>只要还有人活着，出局的那位 5 秒后自动复活；全部挂了才结束。结束后房主点「再来一局」即可同房重开，不用重建房间。</p>
      </div>
    </details>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { DinoRunner, MODE_DUO, MODE_SOLO } from '../lib/dinoGame'
import ArcadeLeaderboard from '../components/ArcadeLeaderboard.vue'
import { apiBase, getToken, getUser, isGuest, request } from '../api/request'

const ROOM_KEY = 'nuist_dino_room'
const router = useRouter()
const canvasEl = ref(null)
const mode = ref(MODE_SOLO)
const score = ref(0)
const hi = ref(0)
const speed = ref(4)
const playing = ref(false)
const ready = ref(false)
const dinos = ref([])
const error = ref('')
const waiting = ref([])
const joinCode = ref('')
const savedRoom = ref(sessionStorage.getItem(ROOM_KEY) || '')
const inRoom = ref(false)
const roomId = ref('')
const roomMsg = ref('')
const netStatus = ref('lobby')
const playerCount = ref(0)
const isHost = ref(false)
const wsReady = ref(false)

const boardRef = ref(null)
let runner = null
let ws = null
let intentionalLeave = false
let reconnectTimer = 0
let postedRun = false

const tip = computed(() =>
  mode.value === MODE_DUO
    ? '一起跑 · 最多五人 · 还有人撑着就能把队友拉回来'
    : '单人耍起 · 无速度上限 · 能跑多远算多远'
)
const speedText = computed(() => `${Number(speed.value).toFixed(1)}`)
const busy = computed(() => playing.value || (mode.value === MODE_DUO && inRoom.value))

function onJump(e) {
  e?.preventDefault?.()
  runner?.inputJump(true)
}

function onDuckDown(e) {
  e?.preventDefault?.()
  runner?.inputDuck(true)
}

function onDuckUp(e) {
  e?.preventDefault?.()
  runner?.inputDuck(false)
}

function onStagePointer(e) {
  // 仅主指针；避免和底部按钮重复触发
  if (e.pointerType === 'mouse' && e.button !== 0) return
  e.preventDefault()
  runner?.inputJump(true)
}

function wsUrl() {
  if (apiBase) {
    const u = new URL(apiBase)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/api/dino/ws'
    return u.toString()
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/api/dino/ws`
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

function sendWs(msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg))
}

function switchMode(m) {
  if (busy.value) return
  error.value = ''
  if (m === MODE_SOLO) {
    leaveRoom(true)
    mode.value = MODE_SOLO
    runner?.setNet(false)
    hi.value = runner?.hi || 0
    return
  }
  mode.value = MODE_DUO
  runner?.setNet(true)
  connectWs()
}

function createRoom() {
  error.value = ''
  sendWs({ type: 'create' })
}

function joinRoom(code) {
  error.value = ''
  const id = String(code || joinCode.value || '')
    .trim()
    .toUpperCase()
  if (id.length < 4) return
  sendWs({ type: 'join', roomId: id })
}

function rejoin(code) {
  sendWs({ type: 'rejoin', roomId: code })
}

function refreshList() {
  sendWs({ type: 'list' })
}

function leaveRoom(silent = false) {
  intentionalLeave = true
  if (ws?.readyState === 1) sendWs({ type: 'leave' })
  inRoom.value = false
  roomId.value = ''
  roomMsg.value = ''
  netStatus.value = 'lobby'
  playerCount.value = 0
  rememberRoom('')
  if (!silent && mode.value === MODE_DUO) refreshList()
  intentionalLeave = false
}

function applyRoomState(state) {
  if (!state) return
  inRoom.value = true
  roomId.value = state.id
  rememberRoom(state.id)
  roomMsg.value = state.message || ''
  netStatus.value = state.status
  playerCount.value = state.players?.length || 0
  // you 可能不在共享包里：用自己的 userId 认座位
  const uid = getUser()?.id
  if (uid != null && state.players) {
    const seat = state.players.findIndex((p) => Number(p.userId) === Number(uid))
    isHost.value = seat === 0
  } else {
    isHost.value = state.you === 0
  }
  playing.value = state.status === 'playing'
  score.value = state.score || 0
  speed.value = state.speed || 4
  if (state.status === 'playing') postedRun = false
  if (state.status === 'ended' && !postedRun) {
    postedRun = true
    submitScore(state.score || 0)
  }
  // 复活倒计时/死亡变化才刷列表，减轻 Vue 负担
  const lifeKey = (state.players || []).map((p) => `${p.dead}:${p.reviveIn || 0}`).join('|')
  if (lifeKey !== applyRoomState._lifeKey || state.status !== applyRoomState._status) {
    applyRoomState._lifeKey = lifeKey
    applyRoomState._status = state.status
    dinos.value = (state.players || []).map((p, i) => ({
      id: i,
      label: p.nickname || `P${i + 1}`,
      dead: !!p.dead,
      reviveIn: p.reviveIn || 0,
    }))
  }
  if (uid != null) runner?.setNetUser(uid)
  runner?.applyNetState(state)
}

function connectWs() {
  const token = getToken()
  if (!token) {
    router.replace({ name: 'login', query: { redirect: '/arcade/dino' } })
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  ws = new WebSocket(wsUrl())
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }))
  }
  ws.onmessage = (ev) => {
    let msg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.type === 'authed') {
      wsReady.value = true
      refreshList()
      if (savedRoom.value) rejoin(savedRoom.value)
      return
    }
    if (msg.type === 'list') {
      waiting.value = msg.rooms || []
      return
    }
    if (msg.type === 'state') {
      applyRoomState(msg.state)
      return
    }
    if (msg.type === 'left') {
      inRoom.value = false
      playing.value = false
      rememberRoom('')
      refreshList()
      return
    }
    if (msg.type === 'error') {
      error.value = msg.error || '出错了'
    }
  }
  ws.onclose = () => {
    wsReady.value = false
    if (intentionalLeave) return
    if (mode.value !== MODE_DUO) return
    reconnectTimer = window.setTimeout(() => connectWs(), 1200)
  }
}

onMounted(() => {
  if (!getUser()) {
    router.replace({ name: 'login', query: { redirect: '/arcade/dino' } })
    return
  }
  runner = new DinoRunner(canvasEl.value, {
    mode: MODE_SOLO,
    onInput: (msg) => sendWs(msg),
    onOver: (score) => {
      playing.value = false
      submitScore(score)
    },
    onStatus: (s) => {
      if (mode.value === MODE_DUO && runner?.net) {
        ready.value = !!s.ready
        if (s.score != null) score.value = s.score
        if (s.speed != null) speed.value = s.speed
        if (s.dinos) dinos.value = s.dinos
        playing.value = !!s.playing
        return
      }
      playing.value = !!s.playing
      score.value = s.score
      hi.value = s.hi
      speed.value = s.speed
      ready.value = !!s.ready
      dinos.value = s.dinos || []
    },
  })
  const u = getUser()
  if (u?.id) runner.setNetUser(u.id)
  hi.value = runner.hi
  ready.value = false
  // sprite load will flip ready via onStatus
})

async function submitScore(score) {
  const n = Math.round(Number(score) || 0)
  if (n <= 0 || isGuest()) return
  try {
    const data = await request('/arcade/dino/score', { method: 'POST', body: { score: n } })
    const best = Number(data.best) || n
    if (runner && best > runner.hi) {
      runner.hi = best
      localStorage.setItem(runner.hiKey(), String(best))
    }
    hi.value = Math.max(hi.value, best)
    boardRef.value?.reload()
  } catch {
    /* 榜没写上不影响这一局 */
  }
}

onUnmounted(() => {
  intentionalLeave = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  runner?.destroy()
  runner = null
})
</script>

<style scoped>
.dino-page {
  padding: 1.2rem 1.2rem 2rem;
  animation: rise 0.35s ease both;
  max-width: 720px;
  margin: 0 auto;
}

.head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.85rem;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(1.35rem, 5vw, 1.7rem);
}

.tip {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  line-height: 1.4;
}

.back {
  flex-shrink: 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
  text-decoration: none;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.85);
}

.modes {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.65rem;
  margin-bottom: 0.9rem;
}

@media (min-width: 640px) {
  .modes {
    grid-template-columns: 1fr 1fr;
  }
}

.mode-btn {
  text-align: left;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}

.mode-btn strong {
  font-family: var(--display);
  font-size: 1.15rem;
}

.mode-btn span {
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.35;
}

.mode-btn.on {
  border-color: #535353;
  box-shadow: inset 0 0 0 1px #535353;
  background: #f7f7f7;
}

.mode-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.lobby {
  margin-bottom: 0.85rem;
}

.row,
.join-row,
.duo-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.55rem;
}

.code-input {
  width: 6rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--line);
}

.room-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
  display: grid;
  gap: 0.35rem;
}

.room-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

.rejoin-hint {
  font-size: 0.88rem;
  margin: 0.35rem 0;
}

.stage-wrap {
  position: relative;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #f7f7f7;
  line-height: 0;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.stage {
  display: block;
  width: 100%;
  max-width: 600px;
  height: auto;
  margin: 0 auto;
  background: #f7f7f7;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  touch-action: none;
  cursor: pointer;
}

.tap-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0.55rem;
  margin: 0;
  text-align: center;
  font-size: 0.78rem;
  font-weight: 700;
  color: #535353;
  pointer-events: none;
  line-height: 1.3;
  padding: 0 0.5rem;
}

.touch-controls {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 0.65rem;
  margin: 0.75rem 0 0.35rem;
}

.touch-btn {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 16px;
  min-height: 3.4rem;
  padding: 0.65rem 0.85rem;
  font: inherit;
  font-weight: 800;
  font-size: 1.05rem;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
  place-items: center;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  box-shadow: 0 2px 0 rgba(20, 36, 28, 0.08);
}

.touch-btn span {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--muted);
}

.touch-btn.jump {
  background: #535353;
  color: #fff;
  border-color: #3a3a3a;
}

.touch-btn.jump span {
  color: rgba(255, 255, 255, 0.72);
}

.touch-btn.duck {
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
}

.touch-btn:active:not(:disabled) {
  transform: translateY(1px);
  filter: brightness(0.96);
}

.touch-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dino-board {
  margin-top: 1rem;
}

.hud {
  margin: 0.75rem 0 0.5rem;
  font-size: 0.92rem;
}

.hud p {
  margin: 0;
}

.lives {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.86rem;
  color: var(--muted);
}

.lives .dead {
  color: #c0392b;
}

.help {
  margin-top: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.help p {
  margin: 0.4rem 0 0;
  line-height: 1.45;
}

.err {
  color: #c0392b;
  font-size: 0.9rem;
}

kbd {
  display: inline-block;
  padding: 0.05rem 0.35rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #fff;
  font-size: 0.8rem;
  color: var(--ink);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 640px) {
  .dino-page {
    padding: 0.85rem 0.7rem calc(1.25rem + env(safe-area-inset-bottom, 0px));
  }

  .head {
    margin-bottom: 0.65rem;
  }

  .mode-btn {
    padding: 0.75rem 0.85rem;
  }

  .mode-btn strong {
    font-size: 1.05rem;
  }

  .stage-wrap {
    border-radius: 10px;
    margin-inline: -0.15rem;
  }

  .stage {
    max-width: none;
  }

  .touch-controls {
    position: sticky;
    bottom: calc(0.35rem + env(safe-area-inset-bottom, 0px));
    z-index: 5;
    margin: 0.65rem 0 0.5rem;
    padding: 0.35rem;
    border-radius: 18px;
    background: rgba(232, 242, 236, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(20, 36, 28, 0.08);
  }

  .touch-btn {
    min-height: 3.75rem;
    font-size: 1.12rem;
  }

  .duo-bar {
    font-size: 0.88rem;
  }

  .hud {
    font-size: 0.88rem;
  }

  .help {
    font-size: 0.86rem;
  }
}

@media (min-width: 900px) {
  /* 桌面仍保留触控按钮，方便平板；略缩小 */
  .touch-btn {
    min-height: 3rem;
  }
}
</style>

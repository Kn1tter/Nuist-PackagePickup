<template>
  <main class="game-page">
    <div class="chrome">
      <RouterLink class="back" to="/">南信大互助</RouterLink>
      <div class="brand-block">
        <p class="eyebrow">Flashlight CS · Tank</p>
        <h1>坦克大战</h1>
      </div>
      <div class="chrome-actions">
        <RouterLink class="linkish" to="/game">迷宫夜战</RouterLink>
      </div>
    </div>

    <section v-show="phase === 'menu'" class="lobby-panel">
      <p class="lede">黑墙迷宫联机对战 · 车体 WASD · 鼠标瞄准 · 点击/空格开火（2–4 人）</p>

      <label class="field">
        <span>昵称</span>
        <input v-model="name" maxlength="12" placeholder="给自己起个车名" @keyup.enter="doCreate" />
      </label>

      <div class="row">
        <button class="btn" type="button" :disabled="!canAct || busy" @click="doConnect">
          {{ busy ? '连接中…' : connected ? '已连接' : '连接服务器' }}
        </button>
        <button class="btn primary" type="button" :disabled="!canAct || busy" @click="doCreate">开房</button>
        <button class="btn admin" type="button" :disabled="!canAct || busy" @click="doAdmin">
          测试房 TEST
        </button>
      </div>

      <div class="row">
        <input v-model="joinCode" maxlength="4" class="code" placeholder="房间码" @keyup.enter="doJoin" />
        <button class="btn" type="button" :disabled="!canAct || !joinCode || busy" @click="doJoin">加入</button>
        <button class="btn" type="button" :disabled="!canAct || busy" @click="doList">刷新列表</button>
      </div>

      <p v-if="statusLine" class="status">{{ statusLine }}</p>
      <p v-if="error" class="err">{{ error }}</p>

      <ul v-if="rooms.length" class="rooms">
        <li v-for="r in rooms" :key="r.code">
          <strong>{{ r.code }}</strong>
          <span>{{ r.host }} · {{ r.players }}/{{ r.maxPlayers }}{{ r.admin ? ' · 测试' : '' }}</span>
          <button type="button" class="btn tiny" :disabled="busy" @click="quickJoin(r.code)">加入</button>
        </li>
      </ul>

      <p class="hint">
        桌面：WASD 移动 · 鼠标移动瞄准 · 单击或空格开火 · 触屏：左移 / 右瞄准 / 开火键
      </p>
      <p class="hint admin-hint">
        测试房：点「测试房 TEST」或加入房间码 <code>TEST</code>。可一人开局（自动补 2 机器人），也可点「加机器人」再开打。
      </p>
    </section>

    <section v-show="phase === 'play'" class="play">
      <div class="bar">
        <div class="bar-left">
          <strong v-if="lobby?.code">房间 {{ lobby.code }}</strong>
          <span class="muted"> · {{ statusLabel }}</span>
          <span v-if="connected" class="dot on" title="已连接" />
          <span v-else class="dot" title="未连接" />
        </div>
        <div class="chrome-actions">
          <button
            v-if="isHost && isAdminRoom && uiStatus === 'lobby'"
            class="linkish"
            type="button"
            @click="clientAddBots()"
          >
            加机器人
          </button>
          <button
            v-if="isHost && (uiStatus === 'lobby' || uiStatus === 'ended')"
            class="linkish primary"
            type="button"
            @click="uiStatus === 'ended' ? clientRestart() : clientStart()"
          >
            {{ uiStatus === 'ended' ? '再来一局' : isAdminRoom ? '开始测试' : '开始对战' }}
          </button>
          <button class="linkish" type="button" @click="doLeave">离开</button>
        </div>
      </div>

      <p v-if="isAdminRoom && uiStatus === 'lobby'" class="admin-banner">
        测试房 <strong>TEST</strong> · 可独自开局（自动补机器人）或先「加机器人」
      </p>

      <ul v-if="uiStatus === 'lobby' && lobby?.players?.length" class="roster">
        <li v-for="p in lobby.players" :key="p.id">
          <i :style="{ background: p.color }" />
          {{ p.name }}
          <em v-if="p.bot">Bot</em>
          <em v-else-if="p.id === lobby.hostId">房主</em>
        </li>
      </ul>
      <p v-if="error" class="err bar-err">{{ error }}</p>
    </section>

    <div ref="stageRef" class="stage" :class="{ dim: phase === 'menu' }">
      <canvas ref="canvasRef" class="board" aria-label="坦克大战画布" />
      <div v-show="phase === 'play'" class="touch" aria-hidden="true">
        <div class="stick-zone">
          <div class="stick-ring" />
          <p>移动</p>
        </div>
        <div class="fire-zone">
          <div class="stick-ring aim" />
          <p>瞄准</p>
          <button
            type="button"
            class="fire"
            @pointerdown.prevent="onFire(true)"
            @pointerup.prevent="onFire(false)"
            @pointercancel.prevent="onFire(false)"
            @pointerleave.prevent="onFire(false)"
          >
            开火
          </button>
        </div>
      </div>
    </div>

    <p class="hint">
      瞄准与开火已分开：鼠标/右区只转向炮塔；单击、空格或「开火」键射击
    </p>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { createBattleTankClient } from '../game/battleTankClient'

const name = ref(localStorage.getItem('bt-name') || '')
const joinCode = ref('')
const connected = ref(false)
const connecting = ref(false)
const busy = ref(false)
const phase = ref('menu')
const error = ref('')
const statusLine = ref('')
const rooms = ref([])
const lobby = ref(null)
const uiStatus = ref('idle')
const meId = ref('')
const canvasRef = ref(null)
const stageRef = ref(null)

let client = null

const canAct = computed(() => name.value.trim().length > 0)
const isHost = computed(() => !!(lobby.value && lobby.value.hostId === meId.value))
const isAdminRoom = computed(() => !!(lobby.value && (lobby.value.admin || lobby.value.code === 'TEST')))
const statusLabel = computed(() => {
  if (uiStatus.value === 'lobby') return isAdminRoom.value ? '测试大厅' : '大厅等待中'
  if (uiStatus.value === 'playing') return '激战中'
  if (uiStatus.value === 'ended') return '本局结束'
  if (connecting.value) return '连接中'
  return '准备'
})

function fit() {
  const stage = stageRef.value
  const canvas = canvasRef.value
  if (!stage || !canvas) return
  canvas.style.width = `${stage.clientWidth}px`
  canvas.style.height = `${Math.max(320, stage.clientHeight)}px`
}

function ensureClient() {
  if (client) return client
  const canvas = canvasRef.value
  if (!canvas) throw new Error('画布未就绪')
  client = createBattleTankClient(canvas, {
    onUpdate(u) {
      connected.value = !!u.connected
      connecting.value = !!u.connecting
      error.value = u.error || ''
      lobby.value = u.lobby
      uiStatus.value = u.status
      meId.value = u.user?.id || ''
      if (u.status === 'lobby' || u.status === 'playing' || u.status === 'ended') {
        phase.value = 'play'
      }
      if (u.connected) statusLine.value = `已连接 · ${u.wsUrl || ''}`
      else if (u.connecting) statusLine.value = '正在连接…'
    },
    onList(list) {
      rooms.value = list || []
    },
  })
  client.start()
  return client
}

async function withBusy(fn) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    localStorage.setItem('bt-name', name.value.trim())
    ensureClient()
    await fn()
  } catch (e) {
    error.value = e.message || '操作失败'
  } finally {
    busy.value = false
  }
}

function doConnect() {
  return withBusy(async () => {
    await client.connect(name.value.trim())
    statusLine.value = '已连接服务器，可以开房或加入'
  })
}

function doCreate() {
  return withBusy(async () => {
    await client.createRoom(name.value.trim())
    phase.value = 'play'
    await nextTick()
    fit()
  })
}

function doAdmin() {
  return withBusy(async () => {
    await client.joinAdminRoom(name.value.trim())
    phase.value = 'play'
    await nextTick()
    fit()
    statusLine.value = '已进入测试房 TEST（可一人开局 / 加机器人）'
  })
}

function doJoin() {
  return withBusy(async () => {
    await client.joinRoom(name.value.trim(), joinCode.value)
    phase.value = 'play'
    await nextTick()
    fit()
  })
}

function quickJoin(code) {
  joinCode.value = code
  return doJoin()
}

function doList() {
  return withBusy(async () => {
    await client.listRooms(name.value.trim())
  })
}

function clientStart() {
  client?.startGame()
}
function clientRestart() {
  client?.restartGame()
}
function clientAddBots() {
  client?.addBots(1)
}
function doLeave() {
  client?.leaveRoom()
  phase.value = 'menu'
  lobby.value = null
  uiStatus.value = 'idle'
}
function onFire(v) {
  client?.setFire(v)
}

onMounted(async () => {
  document.title = '坦克大战 · The Greatest NUIST'
  window.addEventListener('resize', fit)
  await nextTick()
  fit()
  try {
    ensureClient()
  } catch {
    /* canvas ready */
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', fit)
  client?.stop()
  client = null
})
</script>

<style scoped>
.game-page {
  --ink: #d7e0ea;
  --muted: #8b9aab;
  --line: rgba(160, 190, 220, 0.16);
  --panel: rgba(10, 14, 20, 0.72);
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  color: var(--ink);
  background:
    radial-gradient(900px 480px at 15% -10%, rgba(48, 72, 96, 0.35), transparent 55%),
    radial-gradient(700px 400px at 90% 0%, rgba(90, 60, 30, 0.18), transparent 50%),
    linear-gradient(180deg, #07090d 0%, #0b1016 45%, #080a0e 100%);
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem 0.55rem;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}

.back {
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 600;
  border: 1px solid var(--line);
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  background: var(--panel);
}

.brand-block {
  text-align: center;
  flex: 1;
}

.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c4a574;
  font-weight: 700;
}

h1 {
  margin: 0.15rem 0 0;
  font-size: clamp(1.35rem, 3.5vw, 1.85rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: 'IBM Plex Sans', 'PingFang SC', sans-serif;
}

.chrome-actions {
  display: flex;
  gap: 0.45rem;
  align-items: center;
}

.linkish,
.btn {
  border: 1px solid var(--line);
  background: rgba(70, 110, 150, 0.22);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
  font-size: 0.86rem;
}

.linkish.primary,
.btn.primary {
  background: rgba(196, 150, 70, 0.32);
  border-color: rgba(220, 180, 100, 0.35);
}

.btn.admin {
  background: rgba(90, 120, 90, 0.28);
  border-color: rgba(120, 160, 120, 0.35);
}

.admin-hint {
  opacity: 0.85;
}

.admin-hint code {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  letter-spacing: 0.08em;
  color: #c4d4b8;
}

.admin-banner {
  margin: 0.45rem 0 0;
  font-size: 0.82rem;
  color: #9eb69a;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.tiny {
  padding: 0.25rem 0.55rem;
  font-size: 0.78rem;
}

.lobby-panel {
  width: min(560px, calc(100% - 1.5rem));
  margin: 0.35rem auto 0.75rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--panel);
}

.lede {
  margin: 0 0 0.9rem;
  color: var(--muted);
  line-height: 1.5;
  font-size: 0.92rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.86rem;
  color: var(--muted);
}

input {
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.35);
  color: var(--ink);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font: inherit;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 0.65rem;
}

.code {
  width: 6.5rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
}

.rooms {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.rooms li {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.rooms span {
  flex: 1;
  color: var(--muted);
  font-size: 0.86rem;
}

.status {
  margin: 0.25rem 0;
  color: #9eb6a8;
  font-size: 0.82rem;
  word-break: break-all;
}

.err {
  color: #ff8e7e;
  font-size: 0.9rem;
  margin: 0.25rem 0;
}

.bar-err {
  margin: 0 0 0.45rem;
}

.hint,
.muted {
  color: var(--muted);
  font-size: 0.82rem;
}

.hint {
  max-width: 1100px;
  width: calc(100% - 1.5rem);
  margin: 0.55rem auto 1rem;
  line-height: 1.45;
  text-align: center;
}

.play {
  width: min(1100px, calc(100% - 1.2rem));
  margin: 0 auto 0.45rem;
}

.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #5a6a78;
  display: inline-block;
}

.dot.on {
  background: #6ec8a0;
  box-shadow: 0 0 8px rgba(110, 200, 160, 0.55);
}

.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  list-style: none;
  margin: 0.45rem 0 0.35rem;
  padding: 0;
}

.roster li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 0.85rem;
  background: var(--panel);
}

.roster i {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  display: inline-block;
}

.roster em {
  font-style: normal;
  color: #c4a574;
  font-size: 0.75rem;
}

.stage {
  position: relative;
  flex: 1;
  width: min(1100px, calc(100% - 1.2rem));
  margin: 0 auto;
  min-height: min(58vh, 560px);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: #05070a;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
}

.stage.dim {
  min-height: min(36vh, 360px);
  opacity: 0.85;
}

.board {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
}

.touch {
  display: none;
  pointer-events: none;
  position: absolute;
  inset: auto 0 0.75rem 0;
  padding: 0 1rem;
  justify-content: space-between;
  align-items: flex-end;
}

.stick-zone,
.fire-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  color: rgba(180, 200, 220, 0.55);
  font-size: 0.72rem;
}

.stick-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px dashed rgba(160, 190, 220, 0.28);
  background: rgba(20, 28, 40, 0.25);
}

.stick-ring.aim {
  border-color: rgba(220, 180, 100, 0.35);
}

.fire {
  pointer-events: auto;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px solid rgba(220, 150, 90, 0.45);
  background: radial-gradient(circle at 40% 35%, rgba(255, 190, 120, 0.35), rgba(40, 24, 12, 0.7));
  color: #f0d2a8;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  touch-action: none;
}

@media (max-width: 820px) {
  .touch {
    display: flex;
  }

  .stage {
    min-height: min(52vh, 520px);
  }

  .chrome {
    padding-inline: 0.75rem;
  }
}

@media (hover: none) and (pointer: coarse) {
  .touch {
    display: flex;
  }
}
</style>

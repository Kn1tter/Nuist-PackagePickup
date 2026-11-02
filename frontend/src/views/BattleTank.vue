<template>
  <main class="page">
    <header class="chrome">
      <RouterLink class="back" to="/">南信大互助</RouterLink>
      <div class="brand">
        <p class="eyebrow">Battle City</p>
        <h1>坦克大战 · 联机</h1>
      </div>
      <RouterLink class="ghost" to="/game">迷宫夜战</RouterLink>
    </header>

    <section v-show="phase === 'menu'" class="panel lobby">
      <p class="lede">经典顶视角坦克 · 黑墙迷宫 · 车灯微光 · 开房联机（2–4 人）</p>
      <label class="field">
        <span>昵称</span>
        <input v-model="name" maxlength="12" placeholder="给自己起个车名" />
      </label>
      <div class="row">
        <button class="btn" type="button" :disabled="!canConnect" @click="doConnect">
          {{ connected ? '已连接' : '连接服务器' }}
        </button>
        <button class="btn primary" type="button" :disabled="!canConnect" @click="doCreate">开房</button>
      </div>
      <div class="row join">
        <input v-model="joinCode" maxlength="4" class="code" placeholder="房间码" />
        <button class="btn" type="button" :disabled="!canConnect || !joinCode" @click="doJoin">加入</button>
        <button class="btn ghost" type="button" :disabled="!canConnect" @click="doList">刷新列表</button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
      <ul v-if="rooms.length" class="rooms">
        <li v-for="r in rooms" :key="r.code">
          <strong>{{ r.code }}</strong>
          <span>{{ r.host }} · {{ r.players }}/{{ r.maxPlayers }}</span>
          <button type="button" class="btn tiny" @click="quickJoin(r.code)">加入</button>
        </li>
      </ul>
      <p class="hint">桌面 WASD 移动 · 鼠标瞄准开火 · 手机左半移动、右半瞄准射击</p>
    </section>

    <section v-show="phase === 'play'" class="play">
      <div class="bar">
        <div>
          <strong v-if="lobby?.code">房间 {{ lobby.code }}</strong>
          <span class="muted"> · {{ statusLabel }}</span>
        </div>
        <div class="actions">
          <button
            v-if="isHost && (uiStatus === 'lobby' || uiStatus === 'ended')"
            class="btn primary"
            type="button"
            @click="uiStatus === 'ended' ? clientRestart() : clientStart()"
          >
            {{ uiStatus === 'ended' ? '再来一局' : '开始对战' }}
          </button>
          <button class="btn ghost" type="button" @click="doLeave">离开</button>
        </div>
      </div>

      <ul v-if="uiStatus === 'lobby' && lobby?.players" class="roster">
        <li v-for="p in lobby.players" :key="p.id">
          <i :style="{ background: p.color }" />
          {{ p.name }}
          <em v-if="p.id === lobby.hostId">房主</em>
        </li>
      </ul>

      <div ref="stageRef" class="stage">
        <canvas ref="canvasRef" class="board" aria-label="坦克大战画布" />
        <div class="touch" aria-hidden="true">
          <div class="stick-ring" />
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
      <p v-if="error" class="err">{{ error }}</p>
    </section>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { createBattleTankClient } from '../game/battleTankClient'

const name = ref(localStorage.getItem('bt-name') || '')
const joinCode = ref('')
const connected = ref(false)
const phase = ref('menu')
const error = ref('')
const rooms = ref([])
const lobby = ref(null)
const uiStatus = ref('idle')
const meId = ref('')
const canvasRef = ref(null)
const stageRef = ref(null)

let client = null

const canConnect = computed(() => name.value.trim().length > 0)
const isHost = computed(() => !!(lobby.value && lobby.value.hostId === meId.value))
const statusLabel = computed(() => {
  if (uiStatus.value === 'lobby') return '大厅等待中'
  if (uiStatus.value === 'playing') return '激战中'
  if (uiStatus.value === 'ended') return '本局结束'
  return '准备'
})

function fit() {
  const stage = stageRef.value
  const canvas = canvasRef.value
  if (!stage || !canvas) return
  canvas.style.width = `${stage.clientWidth}px`
  canvas.style.height = `${Math.max(340, stage.clientHeight)}px`
}

async function ensureClient() {
  if (client) return client
  phase.value = 'play'
  await nextTick()
  fit()
  const canvas = canvasRef.value
  client = createBattleTankClient(canvas, {
    onUpdate(u) {
      connected.value = u.connected
      error.value = u.error || ''
      lobby.value = u.lobby
      uiStatus.value = u.status
      meId.value = u.user?.id || ''
      if (u.status === 'lobby' || u.status === 'playing' || u.status === 'ended') {
        phase.value = 'play'
      }
    },
    onList(list) {
      rooms.value = list || []
    },
  })
  client.start()
  return client
}

async function doConnect() {
  const n = name.value.trim()
  localStorage.setItem('bt-name', n)
  const c = await ensureClient()
  c.connect(n)
}

async function doCreate() {
  await doConnect()
  client.createRoom()
}

async function doJoin() {
  await doConnect()
  client.joinRoom(joinCode.value.trim().toUpperCase())
}

async function quickJoin(code) {
  joinCode.value = code
  await doJoin()
}

async function doList() {
  await doConnect()
  client.listRooms()
}

function clientStart() {
  client?.startGame()
}
function clientRestart() {
  client?.restartGame()
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

onMounted(() => {
  document.title = '坦克大战 · 联机 · The Greatest NUIST'
  window.addEventListener('resize', fit)
})

onUnmounted(() => {
  window.removeEventListener('resize', fit)
  client?.stop()
  client = null
})
</script>

<style scoped>
.page {
  --ink: #d7e0ea;
  --muted: #8b9aab;
  --line: rgba(160, 190, 220, 0.16);
  min-height: 100vh;
  min-height: 100dvh;
  color: var(--ink);
  background:
    radial-gradient(900px 480px at 12% -10%, rgba(48, 72, 96, 0.35), transparent 55%),
    radial-gradient(700px 400px at 90% 0%, rgba(90, 60, 30, 0.16), transparent 50%),
    linear-gradient(180deg, #07090d 0%, #0b1016 45%, #080a0e 100%);
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
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

.back,
.ghost {
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 600;
  border: 1px solid var(--line);
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  background: rgba(10, 14, 20, 0.72);
}

.brand {
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
  font-size: clamp(1.25rem, 3.2vw, 1.7rem);
  font-weight: 700;
}

.panel {
  width: min(560px, calc(100% - 1.5rem));
  margin: 1rem auto;
  padding: 1.25rem 1.3rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(10, 14, 20, 0.72);
}

.lede {
  margin: 0 0 1rem;
  color: var(--muted);
  line-height: 1.5;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
  font-size: 0.86rem;
  color: var(--muted);
}

input {
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.35);
  color: var(--ink);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 0.75rem;
}

.btn {
  border: 1px solid var(--line);
  background: rgba(70, 110, 150, 0.22);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.45rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.btn.primary {
  background: rgba(196, 150, 70, 0.35);
  border-color: rgba(220, 180, 100, 0.35);
}

.btn.ghost {
  background: transparent;
}

.btn.tiny {
  padding: 0.25rem 0.55rem;
  font-size: 0.78rem;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.code {
  width: 6.5rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
}

.rooms {
  list-style: none;
  margin: 0.5rem 0 0;
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

.hint,
.muted {
  color: var(--muted);
  font-size: 0.82rem;
}

.err {
  color: #ff8e7e;
  font-size: 0.9rem;
}

.play {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: min(1100px, calc(100% - 1.2rem));
  margin: 0 auto 1rem;
}

.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin: 0.4rem 0 0.55rem;
}

.actions {
  display: flex;
  gap: 0.45rem;
}

.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  list-style: none;
  margin: 0 0 0.55rem;
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
  min-height: min(64vh, 600px);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: #05070a;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
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

.stick-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 1px dashed rgba(160, 190, 220, 0.28);
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
  touch-action: none;
}

@media (max-width: 820px), (hover: none) and (pointer: coarse) {
  .touch {
    display: flex;
  }
}
</style>
